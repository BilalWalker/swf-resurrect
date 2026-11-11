# Product: SWF Resurrect

Kiroween 2026 (Devpost) entry, Resurrection category. Deadline Dec 4, 2026, 2:00 PM Pacific. See `docs/brief.md` for the full brief.

## Pitch
Drop in an ActionScript 3 `.swf`, get a readable TypeScript web project that runs in any browser (including phones), plus a fidelity report showing how closely it matches the original.

## Users
- Creators who lost their `.fla` / source and only have the SWF.
- Archivists and educators with Flash games, e-learning and museum interactives that can only be emulated today.

## Positioning
- "Sealed SWF in, verified project out." Ruffle emulates; FFDec exports pieces; we emit a maintainable, runnable codebase and measure fidelity.
- Never claim to be the first or only AS3-to-web tool (Apache Royale and OpenFL exist nearby).

## Fixed scope decisions
- AS3 only. No AS1/AS2.
- PixiJS for rendering, not plain Canvas.
- Deterministic transpile first, LLM repair second.
- Gallery-first hosted demo: pre-converted samples always work; arbitrary upload has size/time limits and fails with a clear report.
- Every report lists unsupported features. No silent failure; code that fails to compile is flagged, never hidden.

## Out of scope
Stage3D, video, networking, filters, blend modes, morph shapes, non-trivial masks, BitmapData manipulation, E4X/XML, exact embedded-font metrics, large class hierarchies, commercial games.

## Samples and licensing
- Three or four SWFs only, each with documented provenance in the repo.
- Only permissively licensed files or ones with written author permission. Never commit third-party SWFs without a licence.
- FFDec and Ruffle are disclosed third-party dependencies.

## Hackathon constraints
- `/.kiro` is committed at repo root (specs, hooks, steering), never ignored.
- Public repo with open-source licence shown in About; free hosted URL; demo video under 3 minutes.
