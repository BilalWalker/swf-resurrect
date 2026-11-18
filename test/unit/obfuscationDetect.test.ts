// Robustness task 17.2 (design D-B2, Requirements 14.2, 14.3, 14.5): the verdict over the scan counts.
import { describe, expect, it } from "vitest";
import { isObfuscated, obfuscationVerdict } from "../../src/recover/detect";

const counts = (namesScanned: number, invalidNames: number, complete = true) => ({ namesScanned, invalidNames, complete });

describe("isObfuscated", () => {
  it("is true at exactly 20 % invalid with 5 invalid names, false just below", () => {
    expect(isObfuscated(counts(25, 5))).toBe(true); // 20 %
    expect(isObfuscated(counts(26, 5))).toBe(false); // 19.2 %
    expect(isObfuscated(counts(100, 20))).toBe(true);
    expect(isObfuscated(counts(100, 19))).toBe(false);
  });

  it("needs at least 5 invalid names whatever the share", () => {
    expect(isObfuscated(counts(4, 4))).toBe(false);
    expect(isObfuscated(counts(5, 5))).toBe(true);
    expect(isObfuscated(counts(10, 4))).toBe(false);
  });

  it("calls the committed samples' counts (0 invalid of 21 to 539) not obfuscated", () => {
    for (const n of [21, 26, 62, 97, 454, 539]) expect(isObfuscated(counts(n, 0))).toBe(false);
  });

  it("calls the local file's counts (1 537 of 2 919) obfuscated", () => {
    expect(isObfuscated(counts(2919, 1537))).toBe(true);
  });

  it("a small file with one odd name is not obfuscated", () => {
    expect(isObfuscated(counts(3, 1))).toBe(false);
    expect(isObfuscated(counts(20, 1))).toBe(false);
  });

  it("is false when the scan was incomplete or read no names", () => {
    expect(isObfuscated(counts(100, 100, false))).toBe(false);
    expect(isObfuscated(counts(0, 0))).toBe(false);
  });
});

describe("obfuscationVerdict", () => {
  it("carries the counts and a null sourceSignals", () => {
    expect(obfuscationVerdict(counts(25, 5))).toEqual({ detected: true, namesScanned: 25, invalidNames: 5, sourceSignals: null });
    expect(obfuscationVerdict(counts(97, 0))).toEqual({ detected: false, namesScanned: 97, invalidNames: 0, sourceSignals: null });
  });
});
