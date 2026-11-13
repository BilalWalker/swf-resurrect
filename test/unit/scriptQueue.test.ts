import { afterEach, describe, expect, it } from 'vitest';
import type { CaughtError } from '../../template/runtime/errorReport';
import { ScriptQueue } from '../../template/runtime/scriptQueue';
import { setCaughtErrorSink } from '../../template/shim/internal';

function host(scripts: Record<number, () => void>, owner?: string) {
  return {
    frameScripts: new Map<number, () => void>(Object.entries(scripts).map(([k, v]) => [Number(k), v])),
    ...(owner === undefined ? {} : { _scriptOwner: () => owner }),
  };
}

describe('ScriptQueue error isolation (Requirement 25.1)', () => {
  const caught: CaughtError[] = [];
  afterEach(() => {
    setCaughtErrorSink(null);
    caught.length = 0;
  });
  const install = () => setCaughtErrorSink((e) => caught.push(e));

  it('reports a throwing script and runs the next one', () => {
    install();
    const log: string[] = [];
    const q = new ScriptQueue();
    q.enqueue(
      host(
        {
          2: () => {
            throw new Error('boom');
          },
        },
        'Main',
      ),
      2,
    );
    q.enqueue(host({ 1: () => log.push('next') }), 1);
    q.drain();
    expect(log).toEqual(['next']);
    expect(caught).toEqual([{ site: 'frame script Main frame 2', message: 'boom', className: null }]);
    expect(q.size).toBe(0);
  });

  it('resets the draining flag so a later drain runs', () => {
    install();
    const log: string[] = [];
    const q = new ScriptQueue();
    q.enqueue(
      host({
        1: () => {
          throw 'plain string';
        },
      }),
      1,
    );
    q.drain();
    expect(caught[0]).toMatchObject({ site: 'frame script MovieClip frame 1', message: 'plain string' });
    q.enqueue(host({ 1: () => log.push('later') }), 1);
    q.drain();
    expect(log).toEqual(['later']);
  });

  it('a throw inside a nested drain call does not lose the outer queue', () => {
    install();
    const log: string[] = [];
    const q = new ScriptQueue();
    const inner = host({ 1: () => log.push('inner') });
    q.enqueue(
      host({
        1: () => {
          q.enqueue(inner, 1);
          q.drain();
          throw new Error('after nested');
        },
      }),
      1,
    );
    q.enqueue(host({ 1: () => log.push('second') }), 1);
    q.drain();
    expect(log).toEqual(['second', 'inner']);
    expect(caught.map((c) => c.message)).toEqual(['after nested']);
  });
});
