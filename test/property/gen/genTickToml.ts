import fc from 'fast-check';

export interface TickToml {
  text: string;
  /** Expected values: top-level occurrences only, first one wins. */
  numFrames: number | null;
  numTicks: number | null;
  tickRate: number | null;
}

type Key = 'num_frames' | 'num_ticks' | 'tick_rate';

interface Line {
  key: Key;
  value: number;
  /** true when the line sits under a table header. */
  nested: boolean;
}

const keyArb: fc.Arbitrary<Key> = fc.constantFrom('num_frames', 'num_ticks', 'tick_rate');
const spaceArb = fc.constantFrom('', ' ', '  ', '\t');
const commentArb = fc.constantFrom('', ' # note', '# x');

const lineArb: fc.Arbitrary<Line> = fc.record({
  key: keyArb,
  value: fc.integer({ min: 0, max: 500 }),
  nested: fc.boolean(),
});

/** TOML text with the three keys in any order, spacing, comments, CRLF and under a table header. */
export const tickTomlArb: fc.Arbitrary<TickToml> = fc
  .record({
    lines: fc.array(lineArb, { maxLength: 6 }),
    eol: fc.constantFrom('\n', '\r\n'),
    pad: fc.array(fc.tuple(spaceArb, spaceArb, commentArb), { minLength: 6, maxLength: 6 }),
    noise: fc.constantFrom('', 'name = "x"\n', '# header comment\n'),
  })
  .map(({ lines, eol, pad, noise }) => {
    const top = lines.filter((l) => !l.nested);
    const nested = lines.filter((l) => l.nested);
    const render = (l: Line, i: number): string => {
      const [a, b, c] = pad[i % pad.length]!;
      return `${a}${l.key}${b}=${b}${l.value}${c}`;
    };
    const parts: string[] = [];
    if (noise !== '') parts.push(noise.replace(/\n$/, ''));
    top.forEach((l, i) => parts.push(render(l, i)));
    if (nested.length > 0) {
      parts.push('[player_options]');
      nested.forEach((l, i) => parts.push(render(l, i)));
    }
    const first = (key: Key): number | null => top.find((l) => l.key === key)?.value ?? null;
    return {
      text: parts.join(eol) + eol,
      numFrames: first('num_frames'),
      numTicks: first('num_ticks'),
      tickRate: first('tick_rate'),
    };
  });
