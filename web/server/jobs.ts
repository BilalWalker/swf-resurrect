// Job manager: queue (one pipeline at a time), child process, preview build, cache and
// persistence. Job directories live under <repo>/.work/web-runs/<jobId>/:
//   input/upload.swf   uploaded SWF (samples run from samples/<name>/test.swf in place,
//                      so the verify stage finds their reference/ folder)
//   out/               pipeline output: emitted project and reports
//   work/              pipeline work directory (--keep-work)
//   app/               the built emitted project (preview)
//   project.zip        made on first download
//   job.json           summary and log, written when the job ends
import { existsSync } from 'node:fs';
import { cp, mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import type { ChildProcess } from 'node:child_process';
import type { JobSummary, LogLine, SampleInfo, SetupStatus, SourceFile } from '../shared/api';
import { abort, applyLine, buildFinished, initialState, pipelineExited, start } from './jobState';
import type { JobState } from './jobState';
import { javaAvailable, killTree, spawnPipeline } from './processTree';
import { summariseResults } from './results';
import type { ResultSummary } from './results';
import { parseLine, redactPaths, splitLines } from './stageLines';
import { cacheKey, displayName, isJobId, MAX_UPLOAD_BYTES, newJobId } from './upload';
import { buildZip } from './zip';
import type { ZipEntry } from './zip';

export interface JobManagerOptions {
  repoRoot: string;
  runsDir: string;
  ffdecJar: string;
  timeoutMs: number;
  /** Most jobs waiting at once; further submissions are refused. */
  maxQueued?: number;
  /** Builds the emitted project for the preview; injected so the module stays light to import. */
  buildPreview(projectDir: string, appDir: string): Promise<void>;
}

export type JobListener = (event: 'job' | 'log', data: JobSummary | LogLine) => void;

interface Job {
  id: string;
  name: string;
  source: 'sample' | 'upload';
  sample: string | null;
  sha256: string;
  swfPath: string;
  dir: string;
  state: JobState;
  log: LogLine[];
  createdAt: Date;
  startedAt: Date | null;
  finishedAt: Date | null;
  results: ResultSummary | null;
  sourceFiles: SourceFile[];
  hasApp: boolean;
  listeners: Set<JobListener>;
  child: ChildProcess | null;
}

interface PersistedJob {
  formatVersion: 1;
  id: string;
  name: string;
  source: 'sample' | 'upload';
  sample: string | null;
  sha256: string;
  swfPath: string;
  state: JobState;
  log: LogLine[];
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
}

export class SubmitError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

const MAX_LOG_LINES = 2000;

async function readJson(path: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as unknown;
  } catch {
    return undefined;
  }
}

/** Files under dir (recursively), as forward-slash paths relative to dir, skipping `skip` names. */
async function walk(dir: string, skip: ReadonlySet<string>): Promise<string[]> {
  const out: string[] = [];
  const visit = async (d: string): Promise<void> => {
    let entries;
    try {
      entries = await readdir(d, { withFileTypes: true });
    } catch {
      return;
    }
    entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    for (const e of entries) {
      if (skip.has(e.name)) continue;
      const full = join(d, e.name);
      if (e.isDirectory()) await visit(full);
      else if (e.isFile()) out.push(relative(dir, full).split(sep).join('/'));
    }
  };
  await visit(dir);
  return out;
}

function parseProvenance(text: string): { author: string | null; licence: string | null } {
  const field = (name: string): string | null => {
    const m = text.match(new RegExp(`^\\|\\s*${name}\\s*\\|\\s*(.*?)\\s*\\|\\s*$`, 'mi'));
    return m === null ? null : m[1];
  };
  return { author: field('Author'), licence: field('Licen[cs]e') };
}

export class JobManager {
  private readonly jobs = new Map<string, Job>();
  /** sha256 -> id of a finished, successful job. */
  private readonly cache = new Map<string, string>();
  private readonly queue: Job[] = [];
  private running: Job | null = null;
  private sampleHashes: Map<string, string> | null = null;
  private setup: SetupStatus | null = null;
  private stopping = false;

  constructor(private readonly opts: JobManagerOptions) {}

  get samplesDir(): string {
    return join(this.opts.repoRoot, 'samples');
  }

  /** Loads finished jobs from earlier server runs so their links and the cache keep working. */
  async load(): Promise<void> {
    await mkdir(this.opts.runsDir, { recursive: true });
    for (const name of await readdir(this.opts.runsDir)) {
      if (!isJobId(name)) continue;
      const p = (await readJson(join(this.opts.runsDir, name, 'job.json'))) as PersistedJob | undefined;
      if (p?.formatVersion !== 1 || p.id !== name) continue;
      const job: Job = {
        id: p.id,
        name: p.name,
        source: p.source,
        sample: p.sample,
        sha256: p.sha256,
        swfPath: p.swfPath,
        dir: join(this.opts.runsDir, name),
        state: p.state,
        log: p.log,
        createdAt: new Date(p.createdAt),
        startedAt: p.startedAt === null ? null : new Date(p.startedAt),
        finishedAt: p.finishedAt === null ? null : new Date(p.finishedAt),
        results: null,
        sourceFiles: [],
        hasApp: false,
        listeners: new Set(),
        child: null,
      };
      await this.collectArtifacts(job);
      this.jobs.set(job.id, job);
      if (job.state.status === 'succeeded') {
        const prev = this.cache.get(job.sha256);
        const prevJob = prev === undefined ? undefined : this.jobs.get(prev);
        if (prevJob === undefined || (prevJob.finishedAt ?? 0) < (job.finishedAt ?? 0)) this.cache.set(job.sha256, job.id);
      }
    }
  }

  /** Java and the FFDec jar; re-checked while not ready. */
  setupStatus(): SetupStatus {
    if (this.setup?.ready === true) return this.setup;
    const problems: string[] = [];
    if (!existsSync(this.opts.ffdecJar)) {
      problems.push(
        `The FFDec jar was not found at ${redactPaths(this.opts.ffdecJar, [[this.opts.repoRoot, '<repo>']])}. ` +
          'Download FFDec (see .kiro/steering/tech.md) to tools/ffdec/, or set SWF_RESURRECT_FFDEC to the path of ffdec-cli.jar.',
      );
    }
    if (!javaAvailable()) problems.push('Java was not found. FFDec needs Java 17 or newer on the PATH.');
    this.setup = { ready: problems.length === 0, problems, maxUploadBytes: MAX_UPLOAD_BYTES, timeoutSeconds: this.opts.timeoutMs / 1000 };
    return this.setup;
  }

  private async sampleHashMap(): Promise<Map<string, string>> {
    if (this.sampleHashes !== null) return this.sampleHashes;
    const map = new Map<string, string>();
    for (const s of await this.sampleNames()) {
      map.set(cacheKey(await readFile(join(this.samplesDir, s, 'test.swf'))), s);
    }
    this.sampleHashes = map;
    return map;
  }

  private async sampleNames(): Promise<string[]> {
    let names: string[];
    try {
      names = await readdir(this.samplesDir);
    } catch {
      return [];
    }
    const out: string[] = [];
    for (const n of names.sort()) {
      if (/^[a-z0-9][a-z0-9_-]*$/i.test(n) && existsSync(join(this.samplesDir, n, 'test.swf'))) out.push(n);
    }
    return out;
  }

  async listSamples(): Promise<SampleInfo[]> {
    const hashes = await this.sampleHashMap();
    const byName = new Map([...hashes].map(([h, n]) => [n, h]));
    const out: SampleInfo[] = [];
    for (const name of await this.sampleNames()) {
      const swf = join(this.samplesDir, name, 'test.swf');
      let prov: { author: string | null; licence: string | null } = { author: null, licence: null };
      try {
        prov = parseProvenance(await readFile(join(this.samplesDir, name, 'PROVENANCE.md'), 'utf8'));
      } catch {
        // no provenance file
      }
      const h = byName.get(name);
      out.push({
        name,
        bytes: (await stat(swf)).size,
        author: prov.author,
        licence: prov.licence,
        cachedJobId: h === undefined ? null : (this.cachedJob(h)?.id ?? null),
      });
    }
    return out;
  }

  private cachedJob(sha: string): Job | undefined {
    const id = this.cache.get(sha);
    const job = id === undefined ? undefined : this.jobs.get(id);
    if (job === undefined || !existsSync(job.dir)) return undefined;
    return job;
  }

  async submitSample(name: string, rerun: boolean): Promise<{ id: string; cached: boolean }> {
    if (!(await this.sampleNames()).includes(name)) throw new SubmitError(404, `No sample named ${name}`);
    const swfPath = join(this.samplesDir, name, 'test.swf');
    const bytes = await readFile(swfPath);
    return this.submit({ name: `${name}.swf`, source: 'sample', sample: name, sha256: cacheKey(bytes), swfPath, bytes: null }, rerun);
  }

  async submitUpload(bytes: Buffer, rawName: string | undefined, rerun: boolean): Promise<{ id: string; cached: boolean }> {
    const sha = cacheKey(bytes);
    // Bytes identical to a sample run as that sample, so verify finds its reference folder.
    const sample = (await this.sampleHashMap()).get(sha);
    if (sample !== undefined) return this.submitSample(sample, rerun);
    return this.submit({ name: displayName(rawName), source: 'upload', sample: null, sha256: sha, swfPath: '', bytes }, rerun);
  }

  /** Runs the same SWF again, bypassing the cache. */
  async rerun(job: Job): Promise<{ id: string; cached: boolean }> {
    if (job.source === 'sample' && job.sample !== null) return this.submitSample(job.sample, true);
    let bytes: Buffer;
    try {
      bytes = await readFile(job.swfPath);
    } catch {
      throw new SubmitError(410, 'The uploaded SWF of this job is no longer on the server. Upload it again.');
    }
    return this.submitUpload(bytes, job.name, true);
  }

  private async submit(
    s: { name: string; source: 'sample' | 'upload'; sample: string | null; sha256: string; swfPath: string; bytes: Buffer | null },
    rerun: boolean,
  ): Promise<{ id: string; cached: boolean }> {
    if (this.stopping) throw new SubmitError(503, 'The server is shutting down.');
    if (!rerun) {
      const hit = this.cachedJob(s.sha256);
      if (hit !== undefined) return { id: hit.id, cached: true };
    }
    // The same SWF already waiting or running: share that job.
    const active = [this.running, ...this.queue].find((j) => j !== null && j.sha256 === s.sha256);
    if (active) return { id: active.id, cached: false };
    const setup = this.setupStatus();
    if (!setup.ready) throw new SubmitError(503, setup.problems.join(' '));
    if (this.queue.length >= (this.opts.maxQueued ?? 8)) {
      throw new SubmitError(503, 'Too many conversions are waiting. Try again in a few minutes.');
    }
    const id = newJobId();
    const dir = join(this.opts.runsDir, id);
    await mkdir(dir, { recursive: true });
    let swfPath = s.swfPath;
    if (s.bytes !== null) {
      await mkdir(join(dir, 'input'), { recursive: true });
      swfPath = join(dir, 'input', 'upload.swf');
      await writeFile(swfPath, s.bytes);
    }
    const job: Job = {
      id,
      name: s.name,
      source: s.source,
      sample: s.sample,
      sha256: s.sha256,
      swfPath,
      dir,
      state: initialState(),
      log: [],
      createdAt: new Date(),
      startedAt: null,
      finishedAt: null,
      results: null,
      sourceFiles: [],
      hasApp: false,
      listeners: new Set(),
      child: null,
    };
    this.jobs.set(id, job);
    this.queue.push(job);
    this.publishQueue();
    this.pump();
    return { id, cached: false };
  }

  get(id: string): Job | undefined {
    return isJobId(id) ? this.jobs.get(id) : undefined;
  }

  summary(job: Job): JobSummary {
    const qi = this.queue.indexOf(job);
    return {
      id: job.id,
      name: job.name,
      source: job.source,
      sample: job.sample,
      sha256: job.sha256,
      status: job.state.status,
      queuePosition: qi < 0 ? null : qi + 1,
      stages: job.state.stages,
      warnings: job.state.warnings,
      error: job.state.error,
      verifyNotes: job.state.verifyNotes,
      createdAt: job.createdAt.toISOString(),
      startedAt: job.startedAt?.toISOString() ?? null,
      finishedAt: job.finishedAt?.toISOString() ?? null,
      timeoutSeconds: this.opts.timeoutMs / 1000,
      results: job.results,
      artifacts: {
        app: job.hasApp,
        report: existsSync(join(job.dir, 'out', 'fidelity-report.html')),
        project: existsSync(join(job.dir, 'out', 'package.json')),
        sourceFiles: job.sourceFiles.length,
      },
    };
  }

  log(job: Job): LogLine[] {
    return job.log;
  }

  subscribe(job: Job, listener: JobListener): () => void {
    job.listeners.add(listener);
    return () => job.listeners.delete(listener);
  }

  private emitJob(job: Job): void {
    const s = this.summary(job);
    for (const l of job.listeners) l('job', s);
  }

  private addLog(job: Job, line: LogLine): void {
    if (job.log.length >= MAX_LOG_LINES) return;
    const entry = { stream: line.stream, text: job.log.length === MAX_LOG_LINES - 1 ? '(log truncated)' : line.text };
    job.log.push(entry);
    for (const l of job.listeners) l('log', entry);
  }

  private setState(job: Job, state: JobState): void {
    if (state === job.state) return;
    job.state = state;
    this.emitJob(job);
  }

  private publishQueue(): void {
    for (const j of this.queue) this.emitJob(j);
  }

  private pump(): void {
    if (this.running !== null || this.stopping) return;
    const job = this.queue.shift();
    if (job === undefined) return;
    this.running = job;
    this.publishQueue();
    void this.run(job)
      .catch((err: unknown) => {
        this.addLog(job, { stream: 'server', text: `internal error: ${err instanceof Error ? err.message : String(err)}` });
        this.setState(job, abort(job.state, 'internal server error, see the log'));
      })
      .finally(async () => {
        job.finishedAt ??= new Date();
        job.child = null;
        await this.persist(job).catch(() => undefined);
        if (job.state.status === 'succeeded') this.cache.set(job.sha256, job.id);
        this.emitJob(job);
        this.running = null;
        this.pump();
      });
  }

  private async run(job: Job): Promise<void> {
    job.startedAt = new Date();
    this.setState(job, start(job.state));
    const outDir = join(job.dir, 'out');
    const workDir = join(job.dir, 'work');
    const exit = await new Promise<{ code: number | null; reason?: string }>((resolveExit) => {
      let reason: string | undefined;
      const child = spawnPipeline({ repoRoot: this.opts.repoRoot, swfPath: job.swfPath, outDir, workDir, ffdecJar: this.opts.ffdecJar });
      job.child = child;
      const timer = setTimeout(() => {
        reason = `timed out after ${this.opts.timeoutMs / 1000} s; the pipeline was stopped`;
        killTree(child);
      }, this.opts.timeoutMs);
      const pending = { stdout: '', stderr: '' };
      const onData = (stream: 'stdout' | 'stderr') => (chunk: Buffer) => {
        const { lines, rest } = splitLines(pending[stream], chunk.toString('utf8'));
        pending[stream] = rest;
        for (const l of lines) this.onLine(job, stream, l);
      };
      child.stdout?.on('data', onData('stdout'));
      child.stderr?.on('data', onData('stderr'));
      child.on('error', (err) => {
        reason = `the pipeline could not start: ${err.message}`;
      });
      child.on('close', (code) => {
        clearTimeout(timer);
        for (const stream of ['stdout', 'stderr'] as const) {
          if (pending[stream] !== '') this.onLine(job, stream, pending[stream]);
        }
        if (this.stopping && reason === undefined) reason = 'the server stopped';
        resolveExit({ code, ...(reason === undefined ? {} : { reason }) });
      });
    });
    const exited = pipelineExited(job.state, exit.code, exit.reason);
    if (exited.status !== 'running') {
      await this.finish(job, exited);
      return;
    }
    this.setState(job, exited);

    // Preview build: the emitted project built with the repo's Vite and PixiJS.
    let buildError: string | null;
    try {
      const appDir = join(job.dir, 'app');
      await rm(appDir, { recursive: true, force: true });
      await this.opts.buildPreview(outDir, appDir);
      buildError = existsSync(join(appDir, 'index.html')) ? null : 'the build wrote no index.html';
    } catch (err) {
      const message = redactPaths(err instanceof Error ? err.message : String(err), [[this.opts.repoRoot, '<repo>']]);
      this.addLog(job, { stream: 'server', text: `preview build failed: ${message}` });
      buildError = message.split('\n')[0];
    }
    await this.finish(job, buildFinished(job.state, buildError));
  }

  /** Final transition: results and artifacts are read before the finished state is published. */
  private async finish(job: Job, state: JobState): Promise<void> {
    job.finishedAt = new Date();
    await this.collectArtifacts(job).catch(() => undefined);
    this.setState(job, state);
  }

  private onLine(job: Job, stream: 'stdout' | 'stderr', raw: string): void {
    // Redact first, so error and warning messages in the state carry no server paths either.
    const text = redactPaths(raw, [
      [job.dir, '<job>'],
      [this.opts.repoRoot, '<repo>'],
    ]);
    this.addLog(job, { stream, text });
    this.setState(job, applyLine(job.state, parseLine(text)));
  }

  private async collectArtifacts(job: Job): Promise<void> {
    const out = join(job.dir, 'out');
    if (!existsSync(out)) return;
    const [f, t, u] = await Promise.all([
      readJson(join(out, 'fidelity-report.json')),
      readJson(join(out, 'translation-report.json')),
      readJson(join(out, 'unsupported-features.json')),
    ]);
    job.results = f === undefined && t === undefined && u === undefined ? null : summariseResults(f, t, u);
    const files = await walk(join(out, 'src'), new Set(['node_modules']));
    job.sourceFiles = [];
    for (const p of files) {
      if (!/\.(ts|js|json)$/.test(p)) continue;
      job.sourceFiles.push({ path: `src/${p}`, bytes: (await stat(join(out, 'src', ...p.split('/')))).size });
    }
    job.hasApp = existsSync(join(job.dir, 'app', 'index.html'));
  }

  private async persist(job: Job): Promise<void> {
    const p: PersistedJob = {
      formatVersion: 1,
      id: job.id,
      name: job.name,
      source: job.source,
      sample: job.sample,
      sha256: job.sha256,
      swfPath: job.swfPath,
      state: job.state,
      log: job.log,
      createdAt: job.createdAt.toISOString(),
      startedAt: job.startedAt?.toISOString() ?? null,
      finishedAt: job.finishedAt?.toISOString() ?? null,
    };
    await writeFile(join(job.dir, 'job.json'), JSON.stringify(p), 'utf8');
  }

  sourceFiles(job: Job): SourceFile[] {
    return job.sourceFiles;
  }

  dirs(job: Job): { out: string; app: string; swf: string } {
    return { out: join(job.dir, 'out'), app: join(job.dir, 'app'), swf: job.swfPath };
  }

  /** The emitted project as a zip (made once, then reused). Leaves out node_modules and dist. */
  async projectZip(job: Job): Promise<{ path: string; fileName: string } | null> {
    const out = join(job.dir, 'out');
    if (job.state.status !== 'succeeded' || !existsSync(join(out, 'package.json'))) return null;
    const stem = job.name.replace(/\.swf$/i, '').replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^[-.]+|-+$/g, '') || 'project';
    const fileName = `${stem}-resurrected.zip`;
    const zipPath = join(job.dir, 'project.zip');
    if (!existsSync(zipPath)) {
      const entries: ZipEntry[] = [];
      for (const rel of await walk(out, new Set(['node_modules', 'dist']))) {
        const full = join(out, ...rel.split('/'));
        const [data, st] = await Promise.all([readFile(full), stat(full)]);
        entries.push({ name: `${stem}-resurrected/${rel}`, data, mtime: st.mtime });
      }
      const tmp = `${zipPath}.${process.pid}.tmp`;
      await writeFile(tmp, buildZip(entries));
      await rm(zipPath, { force: true });
      await cp(tmp, zipPath);
      await rm(tmp, { force: true });
    }
    return { path: zipPath, fileName };
  }

  /** Stops the running pipeline (killing its process tree) and fails waiting jobs. */
  async stop(): Promise<void> {
    this.stopping = true;
    for (const j of this.queue.splice(0)) {
      this.setState(j, abort(j.state, 'the server stopped before this job started'));
    }
    const r = this.running;
    if (r?.child) killTree(r.child);
    // Give the close handler a moment to run and persist.
    for (let i = 0; i < 50 && this.running !== null; i++) await new Promise((res) => setTimeout(res, 100));
  }
}
