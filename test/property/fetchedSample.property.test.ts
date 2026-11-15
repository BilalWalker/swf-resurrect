// Spec task 17.7.
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  STATIC_TEXT_SOURCE,
  candidateUrl,
  decideFloorTest,
  sha256Hex,
  verifySha256,
} from "../../src/samples/fetchedSample";
import { fcConfig } from "./config";

const EMPTY_SHA = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
const hex64 = /^[0-9a-f]{64}$/;
const genBytes = fc.uint8Array({ maxLength: 64 });

function flipCase(s: string, mask: boolean[]): string {
  return [...s].map((c, i) => (mask[i % mask.length] ? c.toUpperCase() : c)).join("");
}

// Feature: breadth, Property 28: The fetch SHA-256 check
describe("Property 28: The fetch SHA-256 check", () => {
  it("**Validates: Requirements 20.2, 20.7** matches exactly when the bytes are equal", async () => {
    await fc.assert(
      fc.asyncProperty(genBytes, genBytes, fc.array(fc.boolean(), { minLength: 1, maxLength: 8 }), async (a, b, mask) => {
        const expected = await sha256Hex(b);
        expect(expected).toMatch(hex64);
        const r = await verifySha256(a, flipCase(expected, mask));
        const equal = a.length === b.length && a.every((v, i) => v === b[i]);
        expect(r.ok).toBe(equal);
        if (!r.ok) {
          expect(r.actual).toMatch(hex64);
          expect(r.expected).toBe(expected);
          expect(r.actual).toBe(await sha256Hex(a));
        }
      }),
      fcConfig,
    );
  });

  it("**Validates: Requirements 20.2, 20.7** the empty array has the known digest", async () => {
    expect(await sha256Hex(new Uint8Array(0))).toBe(EMPTY_SHA);
    expect(await verifySha256(new Uint8Array(0), EMPTY_SHA)).toEqual({ ok: true });
  });
});

// Feature: breadth, Property 29: The fetch URL and the floor decision
describe("Property 29: The fetch URL and the floor decision", () => {
  const seg = fc.stringMatching(/^[A-Za-z0-9_-][A-Za-z0-9_.-]{0,10}$/).filter((s) => s !== "." && s !== ".." && !s.includes(".."));
  const genSha = fc.uint8Array({ minLength: 32, maxLength: 32 }).map((u) => [...u].map((b) => b.toString(16).padStart(2, "0")).join(""));

  it("**Validates: Requirements 20.2, 15.1** URL shape", () => {
    fc.assert(
      fc.property(seg, seg, seg, fc.array(seg, { minLength: 1, maxLength: 4 }), (owner, name, commit, parts) => {
        const repoPath = parts.join("/");
        const url = candidateUrl(`${owner}/${name}`, commit, repoPath);
        expect(url.startsWith("https://raw.githubusercontent.com/")).toBe(true);
        expect(url.endsWith(repoPath)).toBe(true);
        const segments = url.split("/");
        expect(segments).not.toContain("..");
        expect(url).toContain(`/${commit}/${repoPath}`);
      }),
      fcConfig,
    );
    const s = STATIC_TEXT_SOURCE;
    expect(candidateUrl(s.repo, s.commit, s.repoPath)).toContain("/4a8d39661ed8aec97afee1504a4e33080da2efd0/");
  });

  it("**Validates: Requirements 20.3, 15.5** skip, fail and run", () => {
    fc.assert(
      fc.property(genSha, genSha, (expected, other) => {
        const absent = decideFloorTest({ present: false, sha256: null }, expected);
        expect(absent.action).toBe("skip");
        if (absent.action === "skip") expect(absent.message).toContain("npm run fetch:static-text");

        const same = decideFloorTest({ present: true, sha256: expected.toUpperCase() }, expected);
        expect(same).toEqual({ action: "run" });

        if (other !== expected) {
          const bad = decideFloorTest({ present: true, sha256: other }, expected);
          expect(bad.action).toBe("fail");
          if (bad.action === "fail") {
            expect(bad.message).toContain(expected);
            expect(bad.message).toContain(other);
          }
        }
      }),
      fcConfig,
    );
  });
});
