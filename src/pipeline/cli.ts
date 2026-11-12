// Command line entry: swf-resurrect <input.swf> <output-dir> [options].
import { readdir, readFile, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs as nodeParseArgs } from 'node:util';
import { convertStage } from '../convert/writeConverted';
import { emit } from '../emit/emit';
import { translateStage } from '../translate/translateStage';
import { typeCheckProject } from '../translate/typeCheckGate';
import { unpack } from '../unpack/unpack';
import { runPipeline } from './pipeline';
import type { PipelineArgs, PipelineStages } from './pipeline';

export interface CliOptions {
  swfPath: string;
  outputDir: string;
  force: boolean;
  workDir?: string;
  keepWork: boolean;
  ffdecJarPath?: string;
  handwrittenDir?: string;
  verify?: true;
  verifyFrames?: number;
}

export type ParsedArgs = { ok: true; options: CliOptions } | { ok: false; message: string; exitCode: 2 };

export const USAGE =
  'Usage: pipeline <input.swf> <output-dir> [--force] [--work-dir <dir>] [--keep-work] [--ffdec <jar>] [--handwritten <dir>] [--verify] [--verify-frames <n>]';

/** Pure: argv excludes the node binary and script path. Usage errors give exit code 2. */
export function parseArgs(argv: readonly string[]): ParsedArgs {
  let parsed;
  try {
    parsed = nodeParseArgs({
      args: [...argv],
      allowPositionals: true,
      strict: true,
      options: {
        force: { type: 'boolean' },
        'work-dir': { type: 'string' },
        'keep-work': { type: 'boolean' },
        ffdec: { type: 'string' },
        handwritten: { type: 'string' },
        verify: { type: 'boolean' },
        'verify-frames': { type: 'string' },
      },
    });
  } catch (err) {
    return { ok: false, message: `${err instanceof Error ? err.message : String(err)}\n${USAGE}`, exitCode: 2 };
  }
  const { values, positionals } = parsed;
  if (positionals.length !== 2) {
    return {
      ok: false,
      message: `Expected 2 positional arguments (input.swf, output-dir), got ${positionals.length}\n${USAGE}`,
      exitCode: 2,
    };
  }
  for (const [name, v] of [
    ['--work-dir', values['work-dir']],
    ['--ffdec', values.ffdec],
    ['--handwritten', values.handwritten],
  ] as const) {
    if (v === '') return { ok: false, message: `${name} needs a non-empty value\n${USAGE}`, exitCode: 2 };
  }
  const verifyFramesText = values['verify-frames'];
  if (verifyFramesText !== undefined) {
    if (values.verify !== true) {
      return { ok: false, message: `--verify-frames needs --verify\n${USAGE}`, exitCode: 2 };
    }
    if (!/^[1-9][0-9]*$/.test(verifyFramesText)) {
      return { ok: false, message: `--verify-frames needs a positive integer\n${USAGE}`, exitCode: 2 };
    }
  }
  const options: CliOptions = {
    swfPath: positionals[0],
    outputDir: positionals[1],
    force: values.force === true,
    keepWork: values['keep-work'] === true,
  };
  if (values['work-dir'] !== undefined) options.workDir = values['work-dir'];
  if (values.ffdec !== undefined) options.ffdecJarPath = values.ffdec;
  if (values.handwritten !== undefined) options.handwrittenDir = values.handwritten;
  if (values.verify === true) options.verify = true;
  if (verifyFramesText !== undefined) options.verifyFrames = Number(verifyFramesText);
  return { ok: true, options };
}

/** handwritten/<parent directory name of the SWF>/ under the repo root. */
export function defaultHandwrittenDir(repoRoot: string, swfPath: string): string {
  return join(repoRoot, 'handwritten', basename(dirname(resolve(swfPath))));
}

async function isDirectory(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

const realStages: PipelineStages = {
  unpack,
  convert: convertStage,
  translate: translateStage,
  emit,
  gate: (files) => typeCheckProject({ files, repoRoot: REPO_ROOT }),
  async typeCheck(outputDir, files) {
    const map = new Map<string, string>();
    for (const f of files) map.set(f, await readFile(join(outputDir, ...f.split('/')), 'utf8'));
    return typeCheckProject({ files: map, repoRoot: REPO_ROOT });
  },
  verify: async (req) => (await import('../verify/edge/verifyStage')).verifyStage(req),
};

export async function main(argv: readonly string[]): Promise<number> {
  const io = {
    out: (s: string) => void process.stdout.write(s),
    err: (s: string) => void process.stderr.write(s),
  };
  const parsed = parseArgs(argv);
  if (!parsed.ok) {
    io.err(`${parsed.message}\n`);
    return parsed.exitCode;
  }
  const o = parsed.options;

  let handwrittenDir: string | null;
  if (o.handwrittenDir !== undefined) {
    handwrittenDir = resolve(o.handwrittenDir);
    if (!(await isDirectory(handwrittenDir))) {
      io.err(`error [pipeline]: handwritten directory not found: ${handwrittenDir}\n`);
      return 2;
    }
  } else {
    const candidate = defaultHandwrittenDir(REPO_ROOT, o.swfPath);
    handwrittenDir = (await isDirectory(candidate)) ? candidate : null;
  }

  const handwrittenClasses =
    handwrittenDir === null
      ? []
      : (await readdir(handwrittenDir)).filter((n) => n.endsWith('.ts')).map((n) => n.replace(/\.ts$/, ''));

  const args: PipelineArgs = {
    swfPath: o.swfPath,
    outputDir: o.outputDir,
    force: o.force,
    keepWork: o.keepWork,
    ffdecJarPath: o.ffdecJarPath ?? join(REPO_ROOT, 'tools', 'ffdec', 'ffdec-cli.jar'),
    templateDir: join(REPO_ROOT, 'template'),
    handwrittenDir,
    handwrittenClasses,
    cwd: process.cwd(),
    homeDir: homedir(),
  };
  if (o.workDir !== undefined) args.workDir = o.workDir;
  if (o.verify === true) args.verify = o.verifyFrames === undefined ? {} : { frames: o.verifyFrames };
  return runPipeline(args, realStages, io);
}

const invokedAsScript = process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedAsScript) {
  main(process.argv.slice(2)).then(
    (code) => {
      process.exitCode = code;
    },
    (err: unknown) => {
      process.stderr.write(`error [pipeline]: ${err instanceof Error ? err.message : String(err)}\n`);
      process.exitCode = 1;
    },
  );
}
