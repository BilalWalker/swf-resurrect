# Third-party software in the container image

The `Dockerfile` builds an image that contains, besides this project
(MIT, see `LICENSE`) and its npm dependencies (see `package-lock.json`
and `web/THIRD_PARTY.md`):

## FFDec (JPEXS Free Flash Decompiler) 26.4.0

- Licence: GNU General Public License version 3 (GPL-3.0). The full text
  is kept beside the program as `/opt/ffdec/license.txt`.
- Unmodified: the official release archive `ffdec_26.4.0.zip` is
  downloaded during the image build from
  <https://github.com/jindrapetrik/jpexs-decompiler/releases/download/version26.4.0/ffdec_26.4.0.zip>,
  its SHA-256 is checked
  (`56ce960aeafc7caf034e2052ba49f878a883f7c7ca690da6eeffca9587b5e4b9`)
  and it is unpacked as is into its own directory, `/opt/ffdec/`. The
  libraries the archive carries in `lib/` keep their own licence files
  next to them.
- Run as a separate program: the pipeline starts
  `java -jar /opt/ffdec/ffdec-cli.jar ...` as a child process and reads
  its output files. No FFDec code is linked into or bundled with this
  project's code.
- Source code: <https://github.com/jindrapetrik/jpexs-decompiler>, tag
  `version26.4.0`
  (<https://github.com/jindrapetrik/jpexs-decompiler/tree/version26.4.0>).
  Whoever distributes the image (for example by pushing it to a public
  registry) passes on FFDec under GPL-3.0 and must make this
  corresponding source available with it, for example by this link.

This note is copied into the image as `/opt/ffdec-THIRD_PARTY.md`.

## Other parts of the image

- Node.js 24 (base image `node:24.18.0-bookworm-slim`), Debian 12
  packages including OpenJDK 17 (`openjdk-17-jre-headless`, GPL-2.0 with
  the Classpath Exception), and Chromium for Playwright with its system
  libraries, each under its own licence as shipped by Debian, the
  Node.js project and Playwright.
- Ruffle (MIT OR Apache-2.0) is an npm dependency; see
  `web/THIRD_PARTY.md`.
