import { describe, expect, it, vi } from "vitest";
import { planTranslate } from "../../src/translate/planTranslate";
import { tsSyntaxCheck } from "../../src/translate/tsSyntaxCheck";

vi.setConfig({ testTimeout: 60_000 });

// Requirement 22.13, D18: bind order and the Shim exclusion, through the real translate path.

const scene = (names: string[]) =>
  ({
    formatVersion: 1,
    rootSymbolId: 0,
    symbols: Object.fromEntries(names.map((c, i) => [String(i), { type: "sprite", frames: [], labels: {}, className: c }])),
  }) as never;
const SPRITE = "import flash.display.Sprite;\n";
const MC = "import flash.display.MovieClip;\n";
const tr = (sources: Array<{ className: string; source: string }>, link: string) =>
  planTranslate(sources, scene([link]), tsSyntaxCheck).classes.find((c) => c.className === link)!.text;
const binds = (text: string): string[] =>
  [...text.matchAll(/this\.(\w+) = this\.\1\.bind\(this\);/g)].map((m) => m[1]!);

describe("method-value bind order (22.13)", () => {
  it("emits binds in declaration order when values are referenced in the opposite order", () => {
    const text = tr(
      [
        {
          className: "A",
          source:
            `package {\n${SPRITE}public class A extends Sprite {\n` +
            "public function A() { g(m3); g(m2); g(m1); }\n" +
            "public function m1():void {}\npublic function m2():void {}\npublic function m3():void {}\n}\n}\n",
        },
      ],
      "A",
    );
    expect(binds(text)).toEqual(["m1", "m2", "m3"]);
  });

  it("binds inherited methods after own ones, nearest base first, by the base's declaration index (bare and this.x)", () => {
    const sources = [
      {
        className: "C",
        source: `package {\n${SPRITE}public class C extends Sprite { public function c1():void {} public function c2():void {} public function c3():void {} }\n}\n`,
      },
      {
        className: "B",
        source: "package {\npublic class B extends C { public function b1():void {} public function b2():void {} }\n}\n",
      },
      {
        className: "A",
        source:
          "package {\npublic class A extends B {\n" +
          "public function A() { g(this.c3); g(b2); g(this.a2); g(c1); g(this.b1); g(a1); }\n" +
          "public function a1():void {}\npublic function a2():void {}\n}\n}\n",
      },
    ];
    const text = tr(sources, "A");
    expect(binds(text)).toEqual(["a1", "a2", "b1", "b2", "c1", "c3"]);
    expect(text.indexOf("super();")).toBeLessThan(text.indexOf("this.a1 = this.a1.bind(this);"));
  });

  it("does not bind a Shim method used as a value, this.play or a bare stop", () => {
    const text = tr(
      [
        {
          className: "A",
          source:
            `package {\n${MC}public class A extends MovieClip {\n` +
            "public function A() { g(this.play); g(stop); g(h); }\n" +
            "public function h():void {}\n}\n}\n",
        },
      ],
      "A",
    );
    expect(binds(text)).toEqual(["h"]);
    expect(text).not.toMatch(/this\.play = /);
    expect(text).not.toMatch(/this\.stop = /);
  });
});
