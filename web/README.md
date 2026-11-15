# SWF Resurrect web app

A local web UI for the pipeline: drop in an ActionScript 3 `.swf` (or pick
a sample), watch the stages run, then compare the original (Ruffle) with
the converted project side by side, read the fidelity report, browse the
generated TypeScript and download the project as a zip.

## Run it

Needs what the pipeline needs: Node (as in the repo), `npm ci`, Java 17+
and the FFDec jar (see `.kiro/steering/tech.md`).

```
npm run web                      # dev: one server, Vite in middleware mode, http://127.0.0.1:5180
npm run web -- --port 6000       # or PORT=6000 npm run web
npm run web:build                # build the client into web/dist
npm run web:start                # production: serve web/dist and the API on one port
npm run typecheck:web            # strict type-check of web/ (tsconfig.web.json)
npx vitest run test/web          # unit tests and the end-to-end test
```

Environment:

| Variable | Default | Meaning |
|----------|---------|---------|
| `PORT` / `--port` | `5180` | Port. |
| `HOST` / `--host` | `127.0.0.1` | Bind address. Only local by default. |
| `SWF_RESURRECT_FFDEC` | `tools/ffdec/ffdec-cli.jar` | FFDec jar. If it or Java is missing the page says so and no conversion starts; cached results still open. |
| `SWF_RESURRECT_TIMEOUT_S` | `180` | Per-job pipeline timeout; the whole process tree is killed. |
| `SWF_RESURRECT_KEEP_HOURS` | `72` | Finished jobs are deleted this long after they ended. `0`: no age limit. |
| `SWF_RESURRECT_KEEP_MB` | `2048` | Most disk space all job directories may use; oldest jobs go first. `0`: no limit. |
| `SWF_RESURRECT_KEEP_JOBS` | `100` | Most job directories kept; oldest go first. `0`: no limit. |
| `SWF_RESURRECT_SWEEP_MINUTES` | `10` | How often the retention sweep runs (it also runs at start). `0`: only at start. |

Retention (`web/server/retention.ts` decides, `JobManager.sweep` deletes)
never removes a queued or running job, nor the current cached result of a
bundled sample, so the gallery keeps opening at once. Superseded sample
runs and finished uploads are removed by age, then oldest first while the
size or count limit is exceeded. A job directory without a readable
`job.json` (a server stopped mid-run) is removed once it is an hour old.

The end-to-end conversion test uses the same `SWF_RESURRECT_FFDEC` and is
skipped, with the reason printed, when Java or the jar is missing.

## How it works

- `web/server/` (Node, `node:http`, run with tsx, no framework). Each job
  runs the pipeline CLI as a child process:
  `node --import tsx src/pipeline/cli.ts <swf> <job>/out --force --verify --keep-work --work-dir <job>/work --ffdec <jar>`.
  The server reads the CLI's progress lines (`[convert] ok (...)`, `error [stage]: ...`)
  and never imports engine internals, with one exception: after a
  successful run it calls `buildProject` (`src/verify/edge/buildProject.ts`)
  to build the emitted project for the preview.
- One job runs at a time; others wait in a queue (at most 8). Results are
  cached by SHA-256 of the SWF bytes in `.work/web-runs/<random job id>/`
  and survive restarts; "Re-run the ritual" bypasses the cache. An upload
  byte-identical to a sample runs as that sample, so verify finds its
  `reference/` folder.
- `web/client/` (Vite, vanilla TypeScript and CSS). Hash routes: `#/` and
  `#/job/<id>`. Live progress over Server-Sent Events; the stream replays
  the whole history on every (re)connection.
- `web/shared/api.ts` holds the JSON shapes both sides use.

### API

| Route | |
|-------|-|
| `POST /api/jobs` | Raw SWF body (`application/octet-stream`), `X-Filename` header (display only). 20 MB cap, SWF signature check. `?rerun=1` skips the cache. Returns `{id, cached}`. |
| `POST /api/jobs/sample/<name>` | Converts `samples/<name>/test.swf`. |
| `POST /api/jobs/<id>/rerun` | Runs the job's SWF again. |
| `GET /api/jobs/<id>` | Job summary (stages, numbers, warnings, error, results). |
| `GET /api/jobs/<id>/events` | SSE: `reset` (summary and full log), then `job` and `log`. |
| `GET /api/jobs/<id>/app/` | The built converted project. |
| `GET /api/jobs/<id>/out/<path>` | Pipeline output: `fidelity-report.html`, report JSON, `verify/frames/`. |
| `GET /api/jobs/<id>/swf` | The original SWF (for Ruffle). |
| `GET /api/jobs/<id>/source`, `/source/<path>` | Generated `src/` file list and file text. |
| `GET /api/jobs/<id>/project.zip` | The emitted project without `node_modules` and `dist`. |
| `GET /api/samples`, `GET /api/setup` | Gallery and setup status. |
| `GET /healthz` | Liveness: `{status: "ok", running, queued}`. No disk access, no child process. |
| `GET /vendor/ruffle/*` | The Ruffle web package from `node_modules`. |

## Security

Uploads are untrusted.

- Size checked from `Content-Length` and while reading; signature must be
  `FWS`, `CWS` or `ZWS`; the client file name is only displayed, after
  sanitising, never used in a path. Job ids are 96 random bits.
- Every file route resolves through `web/server/safePath.ts`: decoded
  first, then `..`, `.`, empty segments, backslashes, colons, absolute
  paths and NUL are refused, and the result must stay inside the root.
  No directory listings.
- The converted project and the Ruffle page run in
  `<iframe sandbox="allow-scripts">` and are also served with
  `Content-Security-Policy: sandbox allow-scripts`, so they get an opaque
  origin even when opened in their own tab. Ruffle runs with script
  access, networking and URL opening turned off. The fidelity report is
  shown in a frame without scripts and served with a no-script CSP.
- `X-Content-Type-Options: nosniff` and `Referrer-Policy: no-referrer`
  on every response; a strict CSP on the production page. Server paths
  are replaced with `<job>` and `<repo>` in everything sent to the browser.
- The page loads nothing from other sites (no fonts, CDNs or images).

## The design

The interface is built on one metaphor: Flash is dead (end of life
31 December 2020) and this tool raises SWFs as code. Each spooky element
carries a function, and the facts (real stage names and numbers) are
always shown next to the theme:

| Element | Function |
|---------|----------|
| Graveyard landing at night | First screen; one-sentence explanation of the tool. |
| Open grave | The drop zone (a keyboard-operable button). The lid lifts and the pit glows while a file is dragged over it. |
| Fog | Stirs when a file is dragged anywhere over the page: feedback that the page sees the drag. |
| Tombstones | The sample gallery: name, AS3, file size, author and licence; "Risen before" marks cached results. |
| Ritual candles | One per pipeline stage, lit in order with the real stage name and the CLI's numbers; a failed stage is snuffed and smokes. |
| Wisp | Drifts to the stage in progress. |
| "It lives." and the heartbeat line | Success. |
| Moon gauges | Overall_Match and Trace_Score; the lit part is the score, the exact percentage is printed; an eclipsed moon means "not compared", with the reason. |
| The ghost / The risen | Original (Ruffle) beside the converted project. |
| Autopsy | The fidelity report. |
| What stayed in the grave | Unsupported features and the class table. |
| Grimoire | The generated TypeScript. |
| Take the body home | The zip download. |

All motion stops under `prefers-reduced-motion`. Third-party notes:
`web/THIRD_PARTY.md`.
