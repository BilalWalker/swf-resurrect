import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runPipeline } from "../../src/pipeline/pipeline";
import type { PipelineArgs, PipelineStages } from "../../src/pipeline/pipeline";

/** One temp directory per property run: runs `runPipeline` with stage fakes and returns what it wrote. */
export interface PipelineRun {
  exit: number;
  out: string;
  err: string;
  outcomeText: string;
  outcome: { outcome: string; reasonCode: string | null; reason: string; facts?: unknown; referenceId?: string | null };
  /** Text of every *.log the run wrote into the output directory, by file name. */
  logs: Record<string, string>;
}

export async function runWithFakes(bytes: Uint8Array, stages: PipelineStages): Promise<PipelineRun> {
  const tmp = await mkdtemp(join(tmpdir(), "pipe-prop-"));
  try {
    await writeFile(join(tmp, "a.swf"), bytes);
    const args: PipelineArgs = {
      swfPath: join(tmp, "a.swf"), outputDir: join(tmp, "out"), force: false, keepWork: false, ffdecJarPath: "jar",
      templateDir: "t", handwrittenDir: null, handwrittenClasses: [], cwd: tmp, homeDir: tmp,
    };
    let out = "";
    let err = "";
    const exit = await runPipeline(args, stages, { out: (s: string) => void (out += s), err: (s: string) => void (err += s) });
    const outcomeText = await readFile(join(tmp, "out", "outcome.json"), "utf8").catch(() => "");
    const logs: Record<string, string> = {};
    for (const n of await readdir(join(tmp, "out")).catch(() => [] as string[])) {
      if (n.endsWith(".log")) logs[n] = await readFile(join(tmp, "out", n), "utf8");
    }
    return { exit, out, err, outcomeText, logs, outcome: outcomeText === "" ? { outcome: "", reasonCode: null, reason: "" } : JSON.parse(outcomeText) };
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
}

/** Stages that fail the test when called: a refused input must start no stage. */
export function forbiddenStages(onCall: (name: string) => void): PipelineStages {
  const hit = (name: string) => async (): Promise<never> => {
    onCall(name);
    throw new Error(`stage ${name} must not run`);
  };
  return { unpack: hit("unpack"), convert: hit("convert"), translate: hit("translate"), emit: hit("emit"), typeCheck: hit("typeCheck") } as unknown as PipelineStages;
}
