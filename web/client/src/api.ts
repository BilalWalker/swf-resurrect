// Calls to the web server. Every failure becomes an ApiFailure with a message fit to show.
import type { ApiError, CreateJobResponse, JobSummary, SampleInfo, SetupStatus, SourceFile } from '../../shared/api';

export class ApiFailure extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch {
    throw new ApiFailure(0, 'The server cannot be reached. Is it still running?');
  }
  if (!res.ok) {
    let message = `The server answered ${res.status}.`;
    try {
      const body = (await res.json()) as Partial<ApiError>;
      if (typeof body.error === 'string') message = body.error;
    } catch {
      // not JSON
    }
    throw new ApiFailure(res.status, message);
  }
  return (await res.json()) as T;
}

export const api = {
  setup: () => call<SetupStatus>('/api/setup'),
  samples: () => call<SampleInfo[]>('/api/samples'),
  job: (id: string) => call<JobSummary>(`/api/jobs/${encodeURIComponent(id)}`),
  sources: (id: string) => call<SourceFile[]>(`/api/jobs/${encodeURIComponent(id)}/source`),
  async sourceText(id: string, path: string): Promise<string> {
    const url = `/api/jobs/${encodeURIComponent(id)}/source/${path.split('/').map(encodeURIComponent).join('/')}`;
    let res: Response;
    try {
      res = await fetch(url);
    } catch {
      throw new ApiFailure(0, 'The server cannot be reached.');
    }
    if (!res.ok) throw new ApiFailure(res.status, `Could not open ${path} (${res.status}).`);
    return res.text();
  },
  runSample: (name: string, rerun = false) =>
    call<CreateJobResponse>(`/api/jobs/sample/${encodeURIComponent(name)}${rerun ? '?rerun=1' : ''}`, { method: 'POST' }),
  upload: (file: File) =>
    call<CreateJobResponse>('/api/jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream', 'X-Filename': encodeURIComponent(file.name) },
      body: file,
    }),
  rerun: (id: string) => call<CreateJobResponse>(`/api/jobs/${encodeURIComponent(id)}/rerun`, { method: 'POST' }),
};

export const jobUrl = {
  events: (id: string) => `/api/jobs/${encodeURIComponent(id)}/events`,
  app: (id: string) => `/api/jobs/${encodeURIComponent(id)}/app/`,
  report: (id: string) => `/api/jobs/${encodeURIComponent(id)}/out/fidelity-report.html`,
  zip: (id: string) => `/api/jobs/${encodeURIComponent(id)}/project.zip`,
  ruffle: (id: string) => `/ruffle-frame.html#/api/jobs/${encodeURIComponent(id)}/swf`,
};
