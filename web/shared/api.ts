// JSON shapes of the web API, shared by server and client (types only).
import type { JobError, JobStatus, JobWarning, StageState } from '../server/jobState';
import type { ResultSummary } from '../server/results';

export type { ClassCounts, ClassRow, ResultSummary, ScoreSummary, UnsupportedRow } from '../server/results';
export type { JobError, JobStatus, JobWarning, StageState, StageStatus } from '../server/jobState';
export type { StageKey } from '../server/stageLines';

export interface JobSummary {
  id: string;
  /** Display name only (sanitised). */
  name: string;
  source: 'sample' | 'upload';
  sample: string | null;
  sha256: string;
  status: JobStatus;
  /** 1-based position among waiting jobs, null when not waiting. */
  queuePosition: number | null;
  stages: StageState[];
  warnings: JobWarning[];
  error: JobError | null;
  verifyNotes: string[];
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  timeoutSeconds: number;
  results: ResultSummary | null;
  artifacts: { app: boolean; report: boolean; project: boolean; sourceFiles: number };
}

export interface LogLine {
  stream: 'stdout' | 'stderr' | 'server';
  text: string;
}

/** SSE `reset`: the whole job so far. Sent first on every (re)connection. */
export interface ResetEvent {
  job: JobSummary;
  log: LogLine[];
}

/** SSE `job`: the job changed (stage, status, queue position). */
export type JobEvent = JobSummary;

/** SSE `log`: one line of pipeline output. */
export type LogEvent = LogLine;

export interface CreateJobResponse {
  id: string;
  /** True when an earlier result for the same SWF bytes was reused. */
  cached: boolean;
}

export interface SampleInfo {
  name: string;
  bytes: number;
  author: string | null;
  licence: string | null;
  /** Id of a finished cached result for this sample, when there is one. */
  cachedJobId: string | null;
}

export interface SetupStatus {
  ready: boolean;
  /** Plain-language problems, empty when ready. */
  problems: string[];
  maxUploadBytes: number;
  timeoutSeconds: number;
}

export interface SourceFile {
  /** Path relative to the emitted project root, e.g. `src/Main.ts`. */
  path: string;
  bytes: number;
}

export interface ApiError {
  error: string;
}
