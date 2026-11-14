# Kiro tooling in this repository

Always loaded. Short on purpose: it says what exists so you use it instead of doing the same work
by hand.

## MCP servers (`.kiro/settings/mcp.json`)

**swf-inspector** (this repo, `mcp/swf-inspector/`, read-only). Use it whenever you need to know
what is inside a SWF or a pipeline output directory. Do not run one-off `java -jar
tools/ffdec/ffdec-cli.jar ...` commands and search the dump with `Select-String` for these
questions; the tools answer in one call and cache FFDec's work under `.work/mcp-swf-inspector/`.

| Tool | Answers |
|---|---|
| `swf_summary` | Version, frames, stage size, AS3 or not, SymbolClass or not, class count, count of every tag type |
| `swf_find_tags` | Every item of one tag type with all attributes (ids, depths, names, clip depths, flags) |
| `swf_list_classes` | The AS3 classes FFDec decompiles, with line counts |
| `swf_class_source` | The decompiled AS3 of one class, numbered: the text Translate reads |
| `swf_reference_frame` | One frame of the original, rendered by FFDec, as an image: the Verify reference |
| `fidelity_summary` | Scores, lowest frames, known limits, problems and class counts of an output directory |

Paths are relative to the repo root and must stay inside it. The tools never run the pipeline and
never write outside `.work/`.

**playwright** (`@playwright/mcp`, pinned). Use it to look at a built Emitted_Project or the web
UI in a real browser: load the page, take a screenshot, read the console. Use it for browser
checkpoints instead of asking the user to open a page when a screenshot answers the question.

## Hooks (`.kiro/hooks/`, scripts in `scripts/hooks/`)

All three are shell command hooks: they run locally and use no credits.

- **git-guard** (before a shell command). Blocks `git push`, `git add -A`, `git add .`,
  `git commit -a`, `--amend`, `--no-verify`, `rebase`, `reset --hard`, `clean`, `merge`,
  `cherry-pick`, switching to `main`, and any commit while on `main`. When it blocks you, do not
  look for another way to run the same thing: the rule is in `git-workflow.md`.
- **shim-table-and-sample-checks** (after you write a file). A write under `template/shim/`
  regenerates `src/translate/shimMembers.generated.ts`. It runs silently, so after a Shim edit check
  `git status` and stage the regenerated file with the Shim change; the task hook reports it if you forget. A write under `samples/` runs the provenance and licence checks.
- **task-commit-hygiene** (after a spec task). Lints the commits of the wip branch and the staged
  files. If it reports a problem in a commit, do not amend: fix forward where possible and tell
  the user.

## Custom agent (`.kiro/agents/fidelity-reviewer.md`)

A read-only reviewer for checkpoints. At a task named "Checkpoint", after the full suite, hand the
review to `fidelity-reviewer` (as a sub-agent, or the user starts it with `--agent
fidelity-reviewer`) and include its report in the checkpoint message. It reruns the checks,
compares floors, tolerance, reference data and goldens with `main`, and measures the scores
itself. It cannot edit or commit.
