// Plain words for the engine's Outcome (docs/outcome.md). Pure: no DOM, so tests run in Node.
// The engine's own `reason` sentence is shown as it is; these lines only add what to try and
// what the counts mean.
import type { GapKind, JobOutcome, OutcomeNumbers, ReasonCode } from '../../shared/api';

/** One line of what to try after a refusal. Empty when there is nothing useful to say. */
export function refusalHint(code: ReasonCode | null, maxUploadMiB: number | null): string {
  switch (code) {
    case 'not-swf':
      return 'Pick a .swf file exported from Flash or Animate.';
    case 'damaged':
      return 'The file may be cut short or corrupted. Download or export it again and retry.';
    case 'actionscript-1-2':
      return 'This tool converts ActionScript 3 files (Flash Player 9 and later). Older ActionScript 1 and 2 files are not supported.';
    case 'encrypted':
      return 'Try the original, unprotected file.';
    case 'too-large':
      return maxUploadMiB === null ? 'Try a smaller file.' : `This server takes files up to ${maxUploadMiB} MiB.`;
    case 'time-limit':
      return 'Large games can take longer than this server allows. Run SWF Resurrect on your own machine with a higher --run-limit.';
    case 'nothing-translated':
      return 'None of its ActionScript 3 classes could be translated yet, so there is nothing to run.';
    default:
      return '';
  }
}

const GAP_WORDS: Record<GapKind, [string, string]> = {
  'untranslated-class': ['class was not translated', 'classes were not translated'],
  'class-omitted': ['class was left out of the project', 'classes were left out of the project'],
  'untranslated-code': ['class keeps code that was not translated', 'classes keep code that was not translated'],
  'unbound-instance': ['placed object has no class to run it', 'placed objects have no class to run them'],
  'unrecoverable-class': ['class could not be read after deobfuscation', 'classes could not be read after deobfuscation'],
  'type-error': ['type error in the TypeScript', 'type errors in the TypeScript'],
  'dropped-placement': ['timeline placement was dropped', 'timeline placements were dropped'],
  'flash-api-gap': ['Flash API call has no equivalent yet', 'Flash API calls have no equivalent yet'],
};

/** "3 classes were not translated": one line per gap kind with a count above 0. */
export function gapLines(gaps: JobOutcome['gaps']): Array<{ kind: string; text: string }> {
  return gaps
    .filter((g) => g.count > 0)
    .map((g) => {
      const words = GAP_WORDS[g.kind as GapKind] as [string, string] | undefined;
      const text = words === undefined ? `${g.count} × ${g.kind}` : `${g.count} ${g.count === 1 ? words[0] : words[1]}`;
      return { kind: g.kind, text };
    });
}

/** "N of M classes translated", or null when the engine has no numbers or no candidate classes. */
export function classLine(n: OutcomeNumbers | null): string | null {
  if (n === null || n.candidateClasses === 0) return null;
  return `${n.translatedClasses} of ${n.candidateClasses} class${n.candidateClasses === 1 ? '' : 'es'} translated`;
}

/** True when fewer than half of the candidate classes were translated: say the project will probably not run. */
export function fewTranslated(n: OutcomeNumbers | null): boolean {
  return n !== null && n.candidateClasses > 0 && n.translatedClasses * 2 < n.candidateClasses;
}

/** The engine found the file a readable SWF, so the original can be played in Ruffle. */
export function originalPlayable(o: JobOutcome | null): boolean {
  return o?.reasonCode !== 'not-swf' && o?.reasonCode !== 'damaged';
}

/** Stage size for the players, from the result or the Outcome facts; 550 × 400 when neither says. */
export function stageAspect(fromResult: { width: number; height: number } | null, o: JobOutcome | null): string {
  const s = fromResult ?? o?.facts?.stage ?? null;
  return s === null || s.width <= 0 || s.height <= 0 ? '550 / 400' : `${s.width} / ${s.height}`;
}

/**
 * The headline of a run that wrote a project. "It lives" only when at least half the classes were
 * translated; below that the project will probably not run, and the headline says so soberly.
 */
export function resultHeadline(name: string, o: JobOutcome | null): { title: string; sub: string; tone: 'alive' | 'partial' } {
  if (o?.outcome === 'converted-with-gaps' && fewTranslated(o.numbers)) {
    return { title: 'Partly raised.', sub: `${name} was only partly converted; the project will probably not run.`, tone: 'partial' };
  }
  if (o?.outcome === 'converted-with-gaps') {
    return { title: 'It lives, with gaps.', sub: `${name} is now a TypeScript + Vite + PixiJS project, with parts missing.`, tone: 'alive' };
  }
  return { title: 'It lives.', sub: `${name} is now a TypeScript + Vite + PixiJS project.`, tone: 'alive' };
}
