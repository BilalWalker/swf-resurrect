# Third-party software used by the web app

| Package | Version | Licence | Use |
|---------|---------|---------|-----|
| `@ruffle-rs/ruffle` (Ruffle web package) | 0.7.1 (exact pin) | MIT OR Apache-2.0; we use it under MIT | Plays the original SWF in the browser next to the converted project. Served from our own server at `/vendor/ruffle/`, never from a CDN. |

The embedded player is configured with `splashScreen: false` and
`contextMenu: "off"` (documented options of the pinned 0.7.1 package), so
Ruffle's logo and menu do not appear inside the side-by-side view. Ruffle
is credited by name, with its licence, in the page footer and here.

Ruffle's MIT licence text ships in the package
(`node_modules/@ruffle-rs/ruffle/LICENSE_MIT`) and the repository keeps a
copy in `samples/LICENSES/MIT-Ruffle.txt`.

The web app uses no web fonts, icon sets or images from third parties. All
illustration (moon, fog, tombstones, candles, sigils) is drawn in CSS and
inline SVG in this directory.

FFDec (GPLv3) is not part of the web app. The server runs the pipeline CLI
as a separate process, which in turn runs FFDec as a separate process.
The container image (`Dockerfile`) installs the unmodified FFDec release
in its own directory, `/opt/ffdec/`, with its licence beside it; see
`THIRD_PARTY.md` in the repository root.

## Images of the result page (brief 3)

The painted icons, tiles, ornaments and props in `web/client/public/art/`
whose names start with `icon-`, `tile-`, `orn-` or `prop-` were generated
with ChatGPT image generation by the project owner, 2026-11-24. The
source PNGs (1254 x 1254, kept outside the repository in `.work/art-src/`)
are turned into these WebP files by `web/scripts/build-art.py`: trimmed to
the object's bounds and scaled to icons 96 px, tiles 192 px, ornaments
256 px (the divider 512 px wide) and props 320 px, each file under 60 KB,
402 KB in total.
