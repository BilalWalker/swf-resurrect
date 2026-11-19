import { describe, expect, it } from 'vitest';
import type { OutcomeNumbers } from '../../web/shared/api';
import { classLine, consideredLine, fewTranslated, wrapperLine, gapLines, originalPlayable, refusalHint, resultHeadline, stageAspect } from '../../web/client/src/outcomeText';

const numbers = (translated: number, candidates: number): OutcomeNumbers => ({
  candidateClasses: candidates,
  translatedClasses: translated,
  cleanClasses: translated,
  looseClasses: 0,
  untranslatedCodeClasses: 0,
  unparsedClasses: 0,
  unsupportedClasses: 0,
  omittedClasses: candidates - translated,
  typeErrors: 0,
  droppedPlacements: 0,
  namedLimits: 0,
  stubDependentClasses: 0,
  consideredClasses: candidates,
  totalClasses: candidates,
  notConsideredClasses: 0,
});

describe('outcome words', () => {
  it('has one line of what to try for every refusal code', () => {
    for (const code of ['not-swf', 'damaged', 'actionscript-1-2', 'encrypted', 'too-large', 'time-limit', 'nothing-translated'] as const) {
      expect(refusalHint(code, 20)).not.toBe('');
      expect(refusalHint(code, 20)).not.toMatch(/\n/);
    }
    expect(refusalHint('actionscript-1-2', null)).toContain('This tool converts ActionScript 3 files');
    expect(refusalHint('too-large', 20)).toContain('20 MiB');
    expect(refusalHint(null, null)).toBe('');
  });

  it('names gap kinds in plain words with their counts', () => {
    expect(
      gapLines([
        { kind: 'type-error', count: 2, examples: [] },
        { kind: 'untranslated-class', count: 1, examples: [] },
        { kind: 'dropped-placement', count: 0, examples: [] },
      ]),
    ).toEqual([
      { kind: 'type-error', text: '2 type errors in the TypeScript' },
      { kind: 'untranslated-class', text: '1 class was not translated' },
    ]);
  });

  it('counts classes and says when few were translated', () => {
    expect(classLine(numbers(5, 6))).toBe('5 of 6 classes translated');
    expect(classLine(numbers(0, 0))).toBeNull();
    expect(classLine(null)).toBeNull();
    expect(fewTranslated(numbers(5, 6))).toBe(false);
    expect(fewTranslated(numbers(3, 6))).toBe(false);
    expect(fewTranslated(numbers(2, 6))).toBe(true);
    expect(fewTranslated(null)).toBe(false);
  });

  it('plays the original unless the engine found it not a SWF or damaged', () => {
    const o = (reasonCode: 'not-swf' | 'damaged' | 'time-limit' | null) => ({
      outcome: 'refused' as const, reasonCode, reason: '', numbers: null, gaps: [], facts: null, obfuscation: null, referenceId: null, runLimitS: null, embeddedSwfs: null,
    });
    expect(originalPlayable(null)).toBe(true);
    expect(originalPlayable(o('time-limit'))).toBe(true);
    expect(originalPlayable(o('not-swf'))).toBe(false);
    expect(originalPlayable(o('damaged'))).toBe(false);
    expect(stageAspect(null, o(null))).toBe('550 / 400');
    expect(stageAspect({ width: 640, height: 480 }, null)).toBe('640 / 480');
  });

  it('says "It lives" only when at least half the classes were translated', () => {
    const o = (outcome: 'converted' | 'converted-with-gaps', n: OutcomeNumbers | null) => ({
      outcome, reasonCode: null, reason: '', numbers: n, gaps: [], facts: null, obfuscation: null, referenceId: null, runLimitS: null, embeddedSwfs: null,
    });
    expect(resultHeadline('a.swf', o('converted', numbers(4, 4))).title).toBe('It lives.');
    expect(resultHeadline('a.swf', o('converted-with-gaps', numbers(3, 6))).title).toBe('It lives, with gaps.');
    expect(resultHeadline('a.swf', o('converted-with-gaps', null)).title).toBe('It lives, with gaps.');
    const few = resultHeadline('a.swf', o('converted-with-gaps', numbers(2, 6)));
    expect(few).toMatchObject({ title: 'Partly raised.', tone: 'partial' });
    expect(few.title + few.sub).not.toMatch(/lives/i);
  });

  it('says how many classes of the file were considered, only when fewer than all', () => {
    expect(consideredLine({ consideredClasses: 169, totalClasses: 172 })).toBe('169 of 172 classes of the file were considered');
    expect(consideredLine({ consideredClasses: 4, totalClasses: 4 })).toBeNull();
    expect(consideredLine({ consideredClasses: 4, totalClasses: null })).toBeNull();
    expect(consideredLine({ consideredClasses: 0, totalClasses: 0 })).toBeNull();
    expect(consideredLine(numbers(4, 4))).toBeNull();
    // An Outcome_File written before the fields existed has none of them.
    expect(consideredLine({})).toBeNull();
    expect(consideredLine(null)).toBeNull();
  });

  it('labels the two new gap kinds and says plainly when the file is a wrapper', () => {
    expect(
      gapLines([
        { kind: 'classes-not-considered', count: 3, examples: [] },
        { kind: 'embedded-swf', count: 1, examples: ['id 46: CWS v10, 7349081 bytes'] },
      ]).map((l) => l.text),
    ).toEqual(['3 classes of the file were not considered', '1 embedded SWF inside the file was not converted']);
    expect(wrapperLine({ embeddedSwfs: { count: 1, totalBytes: 7349081, largestBytes: 7349081 }, gaps: [] })).toBe(
      'This file is a wrapper around another SWF (1 embedded, 7.0 MiB), and that SWF was not converted. The project holds only the wrapper, not the game inside it.',
    );
    // The gap alone (no embeddedSwfs field) still says it, without a size.
    expect(wrapperLine({ embeddedSwfs: null, gaps: [{ kind: 'embedded-swf', count: 2, examples: [] }] })).toContain('wrapper around 2 other SWFs (2 embedded)');
    expect(wrapperLine({ embeddedSwfs: null, gaps: [] })).toBeNull();
  });
});
