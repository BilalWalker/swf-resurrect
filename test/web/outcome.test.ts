// The server's view of the Outcome_File: the four documented records, null numbers and facts,
// obfuscation, and a missing or unreadable file.
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseOutcomeText, readOutcomeFile } from '../../web/server/outcome';
import { REPO_ROOT } from '../../web/server/main';

/** The JSON blocks of docs/outcome.md, keyed by their heading (the engine's own examples). */
function docExamples(): Record<string, string> {
  const doc = readFileSync(join(REPO_ROOT, 'docs', 'outcome.md'), 'utf8');
  const out: Record<string, string> = {};
  for (const m of doc.matchAll(/^### ([a-z-]+)\s*\n+```json\n([\s\S]*?)```/gm)) out[m[1]] = m[2];
  return out;
}

describe('Outcome_File view', () => {
  const ex = docExamples();

  it('reads each documented outcome', () => {
    expect(Object.keys(ex).sort()).toEqual(['converted', 'converted-with-gaps', 'failed', 'refused']);
    for (const [name, text] of Object.entries(ex)) {
      const r = parseOutcomeText(text);
      if (!r.ok) throw new Error(r.message);
      expect(r.outcome.outcome).toBe(name);
      expect(r.outcome.runLimitS).toBe(300);
    }
  });

  it('keeps null numbers and facts as null', () => {
    const refused = JSON.parse(ex.refused) as Record<string, unknown>;
    const r = parseOutcomeText(JSON.stringify({ ...refused, facts: null }));
    if (!r.ok) throw new Error(r.message);
    expect(r.outcome).toMatchObject({ outcome: 'refused', reasonCode: 'actionscript-1-2', numbers: null, facts: null, obfuscation: null, referenceId: null });
    expect(r.outcome.reason).toBe('the file uses ActionScript 1 or 2, which is not supported');
  });

  it('passes gaps and the reference id through', () => {
    const gaps = parseOutcomeText(ex['converted-with-gaps']);
    const failed = parseOutcomeText(ex.failed);
    if (!gaps.ok || !failed.ok) throw new Error('example did not parse');
    expect(gaps.outcome.gaps.map((g) => [g.kind, g.count])).toEqual([['type-error', 2], ['untranslated-class', 1]]);
    expect(gaps.outcome.numbers?.translatedClasses).toBe(5);
    expect(failed.outcome.referenceId).toBe('3fa9c01e');
  });

  it('summarises an obfuscated run with its recovery', () => {
    const base = JSON.parse(ex['converted-with-gaps']) as Record<string, unknown>;
    const recovered = parseOutcomeText(
      JSON.stringify({
        ...base,
        obfuscated: { detected: true, invalidNames: 40, namesScanned: 90, sourceSignals: 2 },
        recovery: { attempted: true, candidateClasses: 12, deobfuscated: true, failedStep: null, fallback: false, recoveredClasses: 9, renamedIdentifiers: 41, skipped: null, unrecoverableClasses: 2 },
      }),
    );
    if (!recovered.ok) throw new Error(recovered.message);
    expect(recovered.outcome.obfuscation).toEqual({ recovered: true, fallback: false, recoveredClasses: 9, candidateClasses: 12, unrecoverableClasses: 2 });
    const plain = parseOutcomeText(ex.converted);
    expect(plain.ok && plain.outcome.obfuscation).toBeNull();
  });

  it('reports a missing, malformed or future file in one plain sentence', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'outcome-view-'));
    try {
      const missing = await readOutcomeFile(dir);
      expect(missing).toEqual({ ok: false, message: 'the converter ended without writing its result record' });
      await writeFile(join(dir, 'outcome.json'), '{ not json');
      expect(await readOutcomeFile(dir)).toEqual({ ok: false, message: 'the converter ended, but its result record could not be read' });
      await writeFile(join(dir, 'outcome.json'), ex.converted.replace('"formatVersion": 1', '"formatVersion": 2'));
      expect((await readOutcomeFile(dir)).ok).toBe(false);
      await writeFile(join(dir, 'outcome.json'), ex.converted);
      expect(await readOutcomeFile(dir)).toMatchObject({ ok: true, outcome: { outcome: 'converted' } });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
