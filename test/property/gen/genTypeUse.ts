import fc from "fast-check";

export const SHIM_CLASSES = ["Stage", "Sprite", "MovieClip", "Shape", "Event", "MouseEvent", "EventDispatcher"] as const;

/** Positions where a class name can appear: the first five are type positions, the last two expressions. */
const POSITIONS: ReadonlyArray<(n: string, i: number) => string> = [
  (n, i) => `private var f${i}:${n};`,
  (n, i) => `public function t${i}():void { var v:${n}; }`,
  (n, i) => `public function p${i}(a:${n}):void { }`,
  (n, i) => `public function r${i}():${n} { return null; }`,
  (n, i) => `public function c${i}(o:Object):void { var x:* = o as ${n}; }`,
  (n, i) => `public function e${i}():void { var x:* = ${n}; }`,
  (n, i) => `public function n${i}():void { var x:* = new ${n}(); }`,
];

export interface TypeUseCase {
  name: string;
  source: string;
}

export const genTypeUse: fc.Arbitrary<TypeUseCase> = fc
  .record({
    name: fc.constantFrom(...SHIM_CLASSES),
    uses: fc.uniqueArray(fc.integer({ min: 0, max: POSITIONS.length - 1 }), { minLength: 1, maxLength: POSITIONS.length }),
  })
  .map(({ name, uses }) => ({
    name,
    source: `package p { public class C { ${uses.map((u, i) => POSITIONS[u](name, i)).join(" ")} } }`,
  }));
