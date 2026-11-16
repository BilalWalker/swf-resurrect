# Provenance: spacer
| Field                 | Value |
|-----------------------|-------|
| Author                | Zabuzard (GitHub user; repository `Zabuzard/Spacer`) |
| Source URL            | https://github.com/Zabuzard/Spacer/releases/download/v1/Spacer.swf |
| Licence               | GPL-3.0 |
| Modifications         | None. The fetched `test.swf` is byte-identical to the release asset `Spacer.swf`. |
| SHA-256               | `368926f94eb4de93918df9d06655ea2a4dd0ff28a06df725e61751c92552a50a` |
| Size                  | 85334 bytes |
| Added                 | 2026-11-15 |
| Not in the Repository | yes. The SWF is GPL-3.0 and the Repository is MIT, so neither the SWF nor any converted output of it is committed. |
| Fetch command         | `npm run fetch:spacer` (downloads the release asset); `npm run fetch:spacer -- <path>` copies a local file. Both write only when the SHA-256 matches. |
| Target path           | `.work/samples/spacer/test.swf` |
| Embedded fonts        | no embedded fonts recorded yet (to be checked with the swf-inspector tools when the sample is first converted) |
Licence text: samples/LICENSES/GPL-3.0.txt
## Upstream
Verified on 2026-11-15 with the GitHub API.
- Repository: https://github.com/Zabuzard/Spacer ("A shooter mini game with a top down view"; default branch `master`).
- Release: `v1` (published 2016-02-23). Its assets are `Spacer.swf` (85334 bytes) and `Spacer.html`. The stable download URL is the Source URL above.
- Commit of the release: `2c7326cd1ab68f2122f5e15405ec5b689633b882` (tag `v1`, 2016-02-23, "Update README.md").
- Commit looked at for the source and licence: `52ebaf94760818808f811ac6a3a8e82e416ed086`, the head of `master` (last push 2020-07-09).
- Paths in the repository at that commit: the ActionScript 3 source is `src/*.as` (for example `src/Main.as`) with the Flash project `src/Spacer.fla`. The repository tree holds no `.swf`; the SWF exists only as the release asset.
- SWF comparison: the SHA-256 of the raw download of the release asset `Spacer.swf` equals the SHA-256 above, and so equals the local copy `.work/games/spacer/test.swf` (85334 bytes in both).
## Licence
Licence: GPL-3.0. GitHub reports the repository licence as GPL-3.0, and the upstream file `LICENSE` at commit `52ebaf94760818808f811ac6a3a8e82e416ed086` is the GNU General Public License version 3 (29 June 2007). That file is copied unmodified to `samples/LICENSES/GPL-3.0.txt` (git blob `9cecc1d4669ee8af2ca727a5d8cde10cd8b2d7cc`, identical upstream and here).
The upstream `LICENSE` has no project copyright line. Its only copyright line is the licence's own header, `Copyright (C) 2007 Free Software Foundation, Inc. <http://fsf.org/>`, and the unfilled template lines at the end. The checked source file `src/Main.as` has no copyright header either. Zabuzard is named as the author because the repository belongs to that account.
## Why the SWF is not committed
The SWF is GPL-3.0 while the rest of the Repository is MIT. It is fetched into `.work/` on request. The only files of `spacer` planned for the Repository under GPL-3.0 are the hand-written classes in `handwritten/spacer/` (not yet created).
## Embedded fonts
- Not yet inspected. This note is updated with the font list, or the sentence "no embedded fonts", when the SWF is first converted.
## Reference behaviour (`reference/`)
`reference/test.toml` is our own file (`num_frames = 2`, the frame count FFDec reports for the SWF). The game calls no `trace()`, so there is no `output.txt`.
