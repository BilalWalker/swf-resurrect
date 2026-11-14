# Git workflow for spec tasks

Applies whenever a spec task is executed, including "Run all tasks".

## Branch: never commit on `main`

Spec work happens on a local `wip/<spec>` branch (for example
`wip/verify`). Before the first commit of a run, check `git branch
--show-current`. If it prints `main`, stop and ask the user; do not
create or switch branches yourself.

Commits on the `wip/` branch are save points. The user later regroups
them into a few larger commits on `main`, one per coherent piece of work,
spread over several days. So:

- keep committing after every top-level task as described below, so each
  save point builds and passes;
- never merge, cherry-pick or push the `wip/` branch;
- keep each commit's files limited to its task, so regrouping stays easy.

## Commit after every top-level task

When all sub-tasks of a top-level task (for example 5.1 to 5.4) are done:

1. Run `npm run typecheck` and the tests related to the files this task
   changed: `npx vitest related --run <changed source files>`, plus any
   test file the task added or edited. Both must pass. If either fails,
   fix it first. Never commit a failing state.

   A task that changes anything under `template/` also runs the score
   floor tests (`test/unit/clickgotoReplay.test.ts` and
   `test/e2e/overallMatch.e2e.test.ts`), because emitted projects copy
   `template/` and `vitest related` cannot see that link.

   The full suite (`npm test -- --run`, about two minutes) runs only at
   every Checkpoint task, before stopping.

   A failure the full suite finds at a checkpoint is fixed in a new
   commit that names the task that caused it.
2. Run `git status` and stage by path only the files this task created or
   changed, plus `.kiro/specs/<spec>/tasks.md` and `tasks.meta.json`.
   Never use `git add -A`, `git add .` or `git commit -a`.
3. Commit with this message shape:

   ```
   Area: what changed, imperative, at most 72 characters

   Why the change exists, then what it does if the diff does not make
   that obvious. How it was verified (commands run, tests passing) and
   what is not verified yet. Mention the spec task number.
   ```

   Areas in use: `Unpack`, `Convert`, `Translate`, `Emit`, `Runtime`,
   `Shim`, `Pipeline`, `Verify`, `Test`, `Spec`, `Steering`, `Build`,
   `Repo`, `Samples`, `Web`, `MCP`, `Hooks`, `Docs`.
4. No `Co-Authored-By`, no "Generated with" lines, no emoji, and no
   UTF-8 BOM at the start of the message (pass it on stdin with
   `git commit -F -`, or write the file without a BOM).

One top-level task is one commit. Do not mix two tasks in one commit and
do not split one task across several unless a sub-task is a pure move or
rename.

## Hooks enforce part of this

`.kiro/hooks/git-guard.json` blocks the forbidden git commands before
they run, and `.kiro/hooks/task-hygiene.json` lints the commits of the
branch after each task (see `kiro-tooling.md`). A blocked command means
the rule applies; do not route around it.

## Never

- Never `git push`. The user pushes.
- Never amend, rebase, reset or force anything.
- Never commit anything under `tools/`, `node_modules/`, `out/`, `.work/`
  or `dist/`.
- Never commit a SWF that is not already under `samples/` with a
  `PROVENANCE.md`.

## Stop conditions

Stop and ask the user instead of continuing to the next task when:

- a checkpoint task is reached (tasks named "Checkpoint");
- tests or typecheck cannot be made to pass within the task's scope;
- a finding contradicts `requirements.md`, `design.md` or
  `.kiro/steering/tech.md`;
- a task would need an FFDec XML name marked `UNVERIFIED` in
  `src/convert/ffdecXml.ts` to be trusted.

## Reading the design

`design.md` is long. Before coding a task, read the section for that
component by its heading. Do not rely only on the first part of the file.
