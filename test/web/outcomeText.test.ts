import { describe, expect, it } from 'vitest';
import type { OutcomeNumbers } from '../../web/shared/api';
import { classLine, fewTranslated, gapLines, originalPlayable, refusalHint, stageAspect } from '../../web/client/src/outcomeText';

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
      outcome: 'refused' as const, reasonCode, reason: '', numbers: null, gaps: [], facts: null, obfuscation: null, referenceId: null, runLimitS: null,
    });
    expect(originalPlayable(null)).toBe(true);
    expect(originalPlayable(o('time-limit'))).toBe(true);
    expect(originalPlayable(o('not-swf'))).toBe(false);
    expect(originalPlayable(o('damaged'))).toBe(false);
    expect(stageAspect(null, o(null))).toBe('550 / 400');
    expect(stageAspect({ width: 640, height: 480 }, null)).toBe('640 / 480');
  });
});
