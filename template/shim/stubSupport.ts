// Support for the generated API stubs in ./stubs (robustness design, "Flash_API_Table and stubs", task 14.2).
// Every stub member calls `stubCall('<Class>.<member>', neutral)`: it records one Named_Limit
// `api-stub:<Class>.<member>` and returns the neutral value. Nothing here throws or touches the world
// outside the page. The neutral values and the no-event rule are chosen by us, not read in Ruffle.
import { namedLimit } from './errorSink';

/** Above 0 while a stub builds another stub (a lazily created stub object): that creation records nothing. */
let building = 0;

function describeNeutral(neutral: unknown): string {
  if (neutral === null) return 'null';
  if (typeof neutral === 'object') return 'a stub object';
  return JSON.stringify(neutral);
}

/**
 * Records `api-stub:<id>` (once per id until the Named_Limits are taken, which is once per run) and returns the
 * neutral value. `namedLimit` is the one sink and keeps the first detail.
 */
export function stubCall<T>(id: string, neutral: T): T {
  if (building === 0) namedLimit(`api-stub:${id}`, `${id} is a stub: it has no effect and returns ${describeNeutral(neutral)}`);
  return neutral;
}

/** The constructor of a stub class: records `api-stub:<Class>.constructor`, and the no-event limit when the class can stall. */
export function stubConstructed(cls: string, canStall: boolean, noEventText: string): void {
  if (building > 0) return;
  namedLimit(`api-stub:${cls}.constructor`, `new ${cls}() is a stub: it has no effect`);
  if (canStall) stubNoEvent(cls, noEventText);
}

/** Records `api-stub-no-event:<Class>` at the first use of a class that dispatches no completion event. */
export function stubNoEvent(cls: string, text: string): void {
  if (building === 0) namedLimit(`api-stub-no-event:${cls}`, text);
}

const instances = new WeakMap<object, Map<string, object>>();

/**
 * The stub object a member returns: created on first use, built through the stub class itself, then the same
 * object for the same `owner` and `key` for the life of the page. A static member passes the class as owner.
 */
export function stubInstance<T extends object>(owner: object, key: string, make: () => T): T {
  let byKey = instances.get(owner);
  if (byKey === undefined) {
    byKey = new Map();
    instances.set(owner, byKey);
  }
  const have = byKey.get(key);
  if (have !== undefined) return have as T;
  building++;
  try {
    const made = make();
    byKey.set(key, made);
    return made;
  } finally {
    building--;
  }
}
