// Run_Limits resolver (robustness design "Limits and process tree", D-A4). Pure: the environment is passed in.
import type { OutcomeLimits } from '../outcome/outcome';

export const DEFAULT_MAX_SIZE_MIB = 20;
export const DEFAULT_RUN_LIMIT_S = 300;
export const DEFAULT_STAGE_LIMIT_S = 60;

/** Weight of each stage: its allowance is `stageLimitS * weight`. */
export const STAGE_WEIGHTS: Readonly<Record<string, number>> = {
  recover: 2,
  unpack: 2,
  convert: 1,
  translate: 1,
  emit: 1,
  gate: 1,
  verify: 3,
};

export const ENV_MAX_SIZE = 'SWF_RESURRECT_MAX_SIZE_MIB';
export const ENV_RUN_LIMIT = 'SWF_RESURRECT_RUN_LIMIT_S';
export const ENV_STAGE_LIMIT = 'SWF_RESURRECT_STAGE_LIMIT_S';

export interface LimitOptions {
  /** `--max-size`, MiB, as typed. */
  maxSize?: string;
  /** `--run-limit`, seconds, as typed. */
  runLimit?: string;
  /** `--stage-limit`, seconds, as typed. */
  stageLimit?: string;
}

export type ResolvedLimits = { ok: true; limits: OutcomeLimits } | { ok: false; message: string };

/** The limits used when nothing is set. */
export function defaultLimits(): OutcomeLimits {
  return {
    maxSizeMiB: DEFAULT_MAX_SIZE_MIB,
    runLimitS: DEFAULT_RUN_LIMIT_S,
    stageLimitS: DEFAULT_STAGE_LIMIT_S,
    stageWeights: { ...STAGE_WEIGHTS },
  };
}

/** Allowance of one stage in seconds. */
export function stageAllowanceS(limits: OutcomeLimits, stage: string): number {
  return limits.stageLimitS * (limits.stageWeights[stage] ?? 1);
}

type Parsed = { ok: true; value: number | null } | { ok: false; message: string };

function parsePositiveInt(label: string, text: string | undefined): Parsed {
  if (text === undefined) return { ok: true, value: null };
  if (!/^[1-9][0-9]*$/.test(text)) return { ok: false, message: `${label} needs a positive integer, got "${text}"` };
  const n = Number(text);
  if (!Number.isSafeInteger(n)) return { ok: false, message: `${label} needs a positive integer, got "${text}"` };
  return { ok: true, value: n };
}

/** Option beats variable beats default. A value that is not a positive integer is a usage error (exit 2). */
export function resolveLimits(input: {
  options: LimitOptions;
  env: Readonly<Record<string, string | undefined>>;
}): ResolvedLimits {
  const out = defaultLimits();
  const fields = [
    { key: 'maxSizeMiB', opt: ['--max-size', input.options.maxSize], env: ENV_MAX_SIZE },
    { key: 'runLimitS', opt: ['--run-limit', input.options.runLimit], env: ENV_RUN_LIMIT },
    { key: 'stageLimitS', opt: ['--stage-limit', input.options.stageLimit], env: ENV_STAGE_LIMIT },
  ] as const;
  for (const f of fields) {
    const fromOption = parsePositiveInt(f.opt[0], f.opt[1]);
    if (!fromOption.ok) return fromOption;
    if (fromOption.value !== null) {
      out[f.key] = fromOption.value;
      continue;
    }
    const fromEnv = parsePositiveInt(f.env, input.env[f.env]);
    if (!fromEnv.ok) return fromEnv;
    if (fromEnv.value !== null) out[f.key] = fromEnv.value;
  }
  return { ok: true, limits: out };
}
