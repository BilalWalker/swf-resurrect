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
