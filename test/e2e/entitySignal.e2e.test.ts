// Behaviour of the translated entity_game Signal (as3-coverage task 19.2, Requirements 18.2 to 18.4). Loads the emitted
// module of the shared pipeline run in Node. A sample run, so it names the sample.
//
// Order confirmed from the decompiled SignalBindingList: registerListener builds
// `new SignalBindingList(new SignalBinding(...), this.bindings)`, so a new binding is the head, and dispatch walks
// head to tail. Listeners therefore run most recently added first.
// Validates: Requirements 18.2, 18.3, 18.4
import { pathToFileURL } from 'node:url';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { sharedPipelineRun } from '../support/sharedPipelineRun';
const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
describe('entity_game translated Signal', () => {
  let Signal: any;
  let ArgumentError: any;
  beforeAll(async () => {
    const { outDir, code } = await sharedPipelineRun('entity_game', resolve(repoRoot, 'samples/entity_game/test.swf'));
    expect(code).toBe(0);
    const url = (p: string): string => pathToFileURL(join(outDir, p)).href;
    Signal = (await import(/* @vite-ignore */ url('src/org/osflash/signals/Signal.ts'))).Signal;
    ArgumentError = (await import(/* @vite-ignore */ url('shim/index.ts'))).ArgumentError;
  }, 10 * 60 * 1000);
  it('keeps one binding when a listener is added twice', () => {
    const s = new Signal();
    const calls: number[] = [];
    const f = (): void => void calls.push(1);
    s.add(f);
    s.add(f);
    expect(s.numListeners).toBe(1);
    s.dispatch();
    expect(calls).toEqual([1]);
  });
  it('calls the most recently added listener first, addOnce fires once, remove detaches', () => {
    const s = new Signal();
    const log: string[] = [];
    const a = (): void => void log.push('a');
    const b = (): void => void log.push('b');
    const c = (): void => void log.push('c');
    s.add(a);
    s.add(b);
    s.addOnce(c);
    s.dispatch();
    expect(log).toEqual(['c', 'b', 'a']);
    expect(s.numListeners).toBe(2);
    s.remove(b);
    log.length = 0;
    s.dispatch();
    expect(log).toEqual(['a']);
    expect(s.numListeners).toBe(1);
  });
  it('throws ArgumentError when arguments do not match valueClasses', () => {
    const s = new Signal(Number);
    const seen: unknown[] = [];
    s.add((v: unknown) => void seen.push(v));
    expect(() => s.dispatch()).toThrow(ArgumentError);
    expect(() => s.dispatch('x')).toThrow(ArgumentError);
    s.dispatch(5);
    expect(seen).toEqual([5]);
    expect(() => new Signal('notAClass')).toThrow(ArgumentError);
  });
});

