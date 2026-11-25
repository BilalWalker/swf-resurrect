# Hosting the web app

What judges need: a public URL that works, free for them, until
**2027-01-29**. What the app needs: the Docker image from `Dockerfile`
(Node 24, a Java 17 JVM for FFDec, headless Chromium for the verify
stage), memory while converting (**1-2 GB for the bundled samples, about
4 GB for real games**), one HTTP port (`$PORT`, default 7860), and a disk
that may be wiped on restart (the image ships with the samples already
converted).

Measured on the built image (see "The image" below). The bundled samples
are small: 26 MiB idle, peak 1.10 GiB while converting `clickgoto`, and
three samples in a row converted under a hard 1 GiB limit. Real games
are not: on 2026-11-25 three uploaded games of 3, 4 and 9 MB took 26 s,
205 s and 169 s and peaked at 3.42 GiB. So the 1-2 GB figure holds only
for a samples-only demo; a host that accepts uploads needs about 4 GB,
and a 2 GB machine is too small for real games.

Research date: 2026-11-14, with the Hugging Face and Fly.io facts
re-checked on 2026-11-25. Every claim below was read on the provider's
own page on that date unless it is marked **(unverified)**. Prices and
free tiers change; check the linked page before relying on a number.

## Comparison

| Host | Free tier RAM / CPU | Sleep and cold start | Card | Fits this app for free? | Cost to 2027-01-29 |
|------|---------------------|----------------------|------|-------------------------|--------------------|
| **Fly.io** | Free plan: $5 of usage a month once a card is added, $1 without a card; at most 3 Machines | Optional: stops when idle, starts on the next request (cold start of a few seconds; ours measured below) | For the $5 allowance | Samples only: a 2 GB machine that runs only while used stays within $5, but 2 GB is too small for real games | Likely $0 for a samples-only demo; a 2 GB machine 24/7 is about $13.39 a month |
| **Hugging Face Spaces (Docker SDK)** | CPU Basic: 2 vCPU, 16 GB RAM, 50 GB non-persistent disk, no hourly cost | Sleeps after 48 h without visitors; the next visitor restarts it | Yes (PRO) | **No**: creating a Docker Space requires PRO ($9 a month) | About $18-20 (see Recommendation) |
| **Render** | Free: 0.1 CPU, 512 MB | Spins down after 15 min idle; about 1 min to spin up | No | **No** (512 MB is too small for Java plus Chromium) | 2 GB plan about $25 a month **(price unverified)** |
| **Railway** | Trial: $5 once for 30 days, 1 GB; Free plan: 0.5 GB and $1 a month of credit | **(unverified)** | Card or GitHub verification | **No** (RAM) | Hobby $5 a month plus usage; 2 GB RAM at list price is about $20 a month |
| **Google Cloud Run** | Always free per month: 180,000 vCPU-seconds, 360,000 GiB-seconds, 2 million requests; up to 32 GiB per instance | Scales to zero; cold start includes pulling a 2-3 GB image **(not measured)** | Yes (billing account) | Mostly: about 25 h a month of request time at 2 vCPU / 2 GiB | About $0-1 (image storage over the 0.5 GB Artifact Registry free tier) |
| **Koyeb** | Free: 0.1 vCPU, 512 MB, 2 GB disk, one instance | Scales to zero after 1 h idle | Yes ($29 hold, released) | **No** (RAM) | 1 vCPU / 2 GB $10.71 a month; 2 vCPU / 2 GB $21.43 a month |
| **Oracle Cloud Always Free** | Ampere A1 (Arm): 2 OCPU and 12 GB in total; AMD micro: 1 GB | Always-on VM, but idle instances may be reclaimed (CPU, network and memory all under 20% over 7 days) | Yes (card and phone) | Yes, but self-managed VM, arm64 image, HTTPS proxy to set up, and an idle demo risks reclamation | $0 |

Terms: nothing found on these pages forbids a demo that decompiles
user-supplied SWF files. Hugging Face's content policy bans malware,
crypto mining and infringing content and describes Spaces as machine
learning applications; a non-ML demo is not excluded but sits outside
that description. Uploads can be switched off with
`SWF_RESURRECT_UPLOADS=off` on any host.

### Notes and sources

- **Fly.io**
  - <https://docs.fly.io/about/pricing> (re-checked 2026-11-25): the Free plan gives $5 of usage each month once a card is added, $1 without a card, and at most 3 Machines. The earlier sentence about bills under $5 being waived is no longer on the page. `shared-cpu-1x` 1 GB $6.70 a month, `shared-cpu-2x` 2 GB $13.39 a month, a stopped machine $0.15 per GB of root filesystem a month (prices as read on 2026-11-14).
  - <https://docs.fly.io/launch/autostop-autostart>: `auto_stop_machines`, `auto_start_machines`, `min_machines_running` (scale to zero with `"stop"`, `true`, `0`).
  - <https://docs.fly.io/apps/deploy/>: the first deploy creates two machines by default.
  - Remote builder limits (RAM, time) and image size limits: **(unverified)**; the steps below build locally to avoid depending on them.
- **Hugging Face Spaces**
  - <https://huggingface.co/docs/hub/spaces-overview>: "Gradio and Docker Spaces run on compute and require a paid plan to create: PRO for personal accounts [...]"; "Each Spaces environment is limited to 16GB RAM, 2 CPU cores and 50GB of (not persistent) disk space"; "The default CPU Basic hardware has no hourly cost".
  - <https://huggingface.co/docs/hub/spaces-gpus>: cpu-basic Spaces sleep after 48 hours of inactivity; "Anyone visiting your Space will restart it automatically."
  - <https://huggingface.co/pricing>: PRO $9 a month, "Host your own ZeroGPU, Gradio & Docker Spaces on compute". Re-checked 2026-11-25: PRO is still required to create a Docker Space; subscriptions renew on the 1st of each month and the first month is prorated.
  - A Space's app is reachable directly at `https://<user>-<space>.hf.space`; the Space page on huggingface.co shows it in an iframe from `https://huggingface.co`. Outbound requests from a Space are allowed only on ports 80, 443 and 8080 (checked 2026-11-25).
  - <https://huggingface.co/docs/hub/spaces-sdks-docker>: `sdk: docker`, `app_port` (default 7860), the container runs as uid 1000, variables and secrets in the Space settings.
  - <https://huggingface.co/docs/hub/spaces-config-reference>: `startup_duration_timeout` (default 30 min).
  - Build time and image size limits: **(unverified)**; no official numbers found.
  - Whether a Space keeps running after PRO is cancelled: **(unverified)**.
- **Render**: <https://render.com/docs/free> (15 min spin-down, about 1 min spin-up, 750 h a month), <https://render.com/docs/compute-plans> (Free 0.1 CPU / 512 MB). Paid prices from search results only **(unverified)**.
- **Railway**: <https://docs.railway.com/reference/pricing/plans>, <https://docs.railway.com/reference/pricing/free-trial>.
- **Google Cloud Run**: <https://docs.cloud.google.com/free/docs/free-cloud-features> (free tier quotas, billing account required, Artifact Registry 0.5 GB free), <https://docs.cloud.google.com/run/docs/configuring/services/memory-limits> (files written to disk count against memory). Per-second prices and CPU allocation outside requests: **(unverified)**. With request-based billing a conversion only gets CPU while a request is open; the page keeps an event stream open during a job, which should keep it running, but this was not tested.
- **Koyeb**: <https://www.koyeb.com/docs/reference/instances>, <https://www.koyeb.com/docs/faqs/pricing>.
- **Oracle**: <https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm> (A1 totals, idle reclamation rule). Whether Playwright's Chromium and OpenJDK 17 run on arm64 in this image: **(unverified)**; the image has only been built for amd64.

## Recommendation

**Hugging Face Spaces with PRO.** Real games need about 4 GB while
converting (measured above), and CPU Basic gives 16 GB with no hourly
cost; the port already matches and deployment is a git push. PRO is
$9 a month, renews on the 1st and the first month is prorated, so
covering up to 2027-01-29 costs about $18 to $20 depending on the start
day. Downsides: paid, and it sleeps after 48 h without visitors (the next
visitor waits for the container to start).

**Fallback for a samples-only demo: Fly.io**, one `shared-cpu-2x`
machine with 2 GB, stopped when idle and started on request, with
`SWF_RESURRECT_UPLOADS=off`. It runs the image as built, gives a stable
`https://<app>.fly.dev` URL and starts in seconds; at this usage it
should stay within the Free plan's $5 a month (a card is needed for
that allowance; 24/7 would be about $13.39 a month). 2 GB is enough for
the bundled samples but too small for real games, so uploads stay off.

Either way, set a spending limit or billing alert, and re-check the
pricing pages before the judging period.

## Deploy on Hugging Face Spaces (PRO)

1. Subscribe to PRO (<https://huggingface.co/pro>), then create a Space:
   SDK **Docker**, hardware **CPU basic**, visibility **Public**.
2. The Space's repository needs a `README.md` with this front matter at
   the top (the Space's own README, not this project's):

   ```yaml
   ---
   title: SWF Resurrect
   sdk: docker
   app_port: 7860
   startup_duration_timeout: 1h
   ---
   ```

3. Push this repository's files to the Space (an HF access token with
   write access is the password):

   ```
   git clone https://huggingface.co/spaces/<user>/<space> hf-space
   # copy the project into hf-space/ (without node_modules, .work, out, tools, .git),
   # keep the front matter README.md above, then:
   cd hf-space && git add . && git commit -m "Deploy" && git push
   ```

   The Space builds the `Dockerfile` (FFDec download, `npm ci`,
   Chromium, sample pre-warm) and starts it. Build logs are in the
   Space's "Logs" tab.

4. In the Space settings, "Variables and secrets": add
   `SWF_RESURRECT_FRAME_ANCESTORS=https://huggingface.co` (the Space page
   shows the app in an iframe from that origin; without it the browser
   blocks the frame and only the direct address works) and `TRUST_PROXY`
   (the number of proxies in front of the container is
   **(unverified)**; start with `1` and check).

5. Check it on the Space page and at the direct address
   `https://<user>-<space>.hf.space`: every tombstone should say "Risen
   before" and open at once; `/healthz` at the direct address should
   print `{"status":"ok",...}`.

The image already runs as uid 1000 (the `node` user), which Spaces
expects, and listens on 7860.

## Fallback: deploy on Fly.io (samples only)

Prerequisites: Docker running locally (the image is built on your
machine; the build downloads FFDec and converts the samples), and
`flyctl` installed (<https://fly.io/docs/flyctl/install/>).

1. Sign in and add a card (Dashboard, Billing):

   ```
   fly auth login            # or: fly auth signup
   ```

2. Create the app (pick a unique name and the region nearest the judges,
   e.g. `fra`, `iad`):

   ```
   fly apps create swf-resurrect-<suffix>
   ```

3. Put this `fly.toml` in the repository root (not committed, since the
   app name is yours):

   ```toml
   app = "swf-resurrect-<suffix>"
   primary_region = "fra"

   [build]
     dockerfile = "Dockerfile"

   [env]
     PORT = "7860"
     TRUST_PROXY = "1"            # Fly's proxy is the one hop in front of the app
     SWF_RESURRECT_UPLOADS = "off"   # 2 GB is too small for real games

   [http_service]
     internal_port = 7860
     force_https = true
     auto_stop_machines = "stop"
     auto_start_machines = true
     min_machines_running = 0
     [http_service.concurrency]
       type = "requests"
       soft_limit = 20
       hard_limit = 40

   [[http_service.checks]]
     method = "GET"
     path = "/healthz"
     interval = "30s"
     timeout = "5s"
     grace_period = "30s"

   [[vm]]
     cpu_kind = "shared"
     cpus = 2
     memory = "2gb"
   ```

4. Build locally and deploy one machine:

   ```
   fly deploy --local-only --ha=false
   fly scale count 1
   fly status
   ```

5. Check it: open `https://swf-resurrect-<suffix>.fly.dev`, every
   tombstone should say "Risen before" and open at once;
   `curl https://swf-resurrect-<suffix>.fly.dev/healthz` should print
   `{"status":"ok",...}`. Wait until `fly status` shows the machine
   stopped, then open the URL again to see the cold start.

6. Keep the cost within the Free plan's $5: in the dashboard set a
   billing alert; look at the current month's usage once a week until
   2027-01-29.

7. After judging: `fly apps destroy swf-resurrect-<suffix>`.

Notes:

- The disk is the image's: uploads and their results disappear when the
  machine stops or is redeployed. The pre-converted samples come back
  with the image.
- Settings are environment variables (`web/README.md`). In production
  mode the rate limit is on (per client a burst of 3 new conversions,
  then 10 per hour; cached samples are free); retention deletes old
  upload jobs.
- `TRUST_PROXY=1` assumes Fly's proxy appends the client address to
  `X-Forwarded-For` **(unverified on a live app)**. If every visitor
  shares one rate-limit bucket after deploying, check the header with a
  test request and adjust.

## The image

`docker build -t swf-resurrect .` then
`docker run --rm -p 7860:7860 swf-resurrect`. See the comments at the
top of `Dockerfile` and `THIRD_PARTY.md` for FFDec (GPL-3.0, unmodified,
run as a separate process, source link).

Measured 2026-11-14 on Windows 11, Docker Desktop 28.5.1 (WSL 2,
linux/amd64), 16 GB RAM host:

| | |
|-|-|
| Build time, cold (base images pulled, nothing cached) | 292 s, of which `npm ci` + Chromium 116 s, sample pre-warm 35 s, image export 66 s |
| Image size | 1.88 GB uncompressed (`docker image ls`), about 503 MB compressed; largest layers: npm packages and Chromium 865 MB, Java 229 MB, FFDec 27 MB |
| Cold start (`docker run` until `/healthz` answers 200) | 2.7 s |
| Memory idle | 26 MiB |
| Memory while converting `clickgoto` (rerun through `POST /api/jobs/sample/clickgoto?rerun=1`) | peak 1.10 GiB (cgroup `memory.peak`, includes page cache); 17 s for the job |
| Under `--memory=1g` | clickgoto, tweendemo, clickgoto converted in 14-17 s each, no OOM kill (the limit was reached and memory reclaimed) |
| Process user | `node` (uid 1000) |

Measured again on 2026-11-25, image built from `acbc08e`, run with
`--cpus=2 --memory=16g` (the size of a Hugging Face CPU Basic Space):

| | |
|-|-|
| Build time | 299 s |
| Image size | 1.91 GB |
| Three uploaded games (not bundled) | 3 MB in 26 s, 4 MB in 205 s, 9 MB (obfuscated) in 169 s |
| Peak memory over those runs | 3.42 GiB (cgroup `memory.peak`) |

Not measured: build and start on any of the hosts above, arm64 builds.
