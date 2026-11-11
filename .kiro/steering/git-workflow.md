# Git workflow for spec tasks

Applies whenever a spec task is executed, including "Run all tasks".

## Commit after every top-level task

When all sub-tasks of a top-level task (for example 5.1 to 5.4) are done:

1. Run `npm run typecheck` and `npm test -- --run`. Both must pass.
   If either fails, fix it first. Never commit a failing state.
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

   Areas in use: `Unpack`, `Convert`, `Emit`, `Runtime`, `Shim`,
   `Pipeline`, `Test`, `Spec`, `Steering`, `Build`, `Repo`, `Samples`.
4. No `Co-Authored-By`, no "Generated with" lines, no emoji.

One top-level task is one commit. Do not mix two tasks in one commit and
do not split one task across several unless a sub-task is a pure move or
rename.

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
