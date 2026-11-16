// Lists the descendants of a process, for tests that check no browser process is left behind (task 29.1).
// No shell is used: Windows asks PowerShell (Get-CimInstance Win32_Process), elsewhere `ps`.
import { execFile } from 'node:child_process';

interface Row {
  pid: number;
  ppid: number;
}

function run(file: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(file, args, { windowsHide: true, maxBuffer: 16 * 1024 * 1024 }, (err, stdout) => (err ? reject(err) : resolve(stdout)));
  });
}

async function processTable(): Promise<Row[]> {
  if (process.platform === 'win32') {
    const out = await run('powershell.exe', [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      'Get-CimInstance Win32_Process | ForEach-Object { "$($_.ProcessId) $($_.ParentProcessId)" }',
    ]);
    return parse(out);
  }
  return parse(await run('ps', ['-e', '-o', 'pid=,ppid=']));
}

function parse(out: string): Row[] {
  const rows: Row[] = [];
  for (const line of out.split(/\r?\n/)) {
    const m = /^\s*(\d+)\s+(\d+)\s*$/.exec(line);
    if (m) rows.push({ pid: Number(m[1]), ppid: Number(m[2]) });
  }
  return rows;
}

/** `pid` and every process below it, from one snapshot of the process table. */
export async function processTree(pid: number): Promise<number[]> {
  const rows = await processTable();
  const found = new Set<number>([pid]);
  for (let grew = true; grew; ) {
    grew = false;
    for (const r of rows) if (found.has(r.ppid) && !found.has(r.pid)) (found.add(r.pid), (grew = true));
  }
  return [...found];
}

/** Those of `pids` that are in the process table now. */
export async function alivePids(pids: readonly number[]): Promise<number[]> {
  const table = new Set((await processTable()).map((r) => r.pid));
  return pids.filter((p) => table.has(p));
}
