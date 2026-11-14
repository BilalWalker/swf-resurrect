import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, it, expect } from 'vitest';
import { verifyStage } from '../../src/verify/edge/verifyStage';
import type { VerifyDeps } from '../../src/verify/edge/verifyStage';
import {
  ResidualRegisterError,
  attributeRegions,
  residualLimits,
  validateResidualRegister,
} from '../../src/verify/core/residual';
import type { DiffRegion } from '../../src/verify/core/regions';

// The example register of the design, Data Models section.
const EXAMPLE: unknown = JSON.parse(
  '{ "formatVersion": 1, "sample": "3_joystick", "entries": [' +
    '{ "frame": 1, "bbox": { "x0": 0, "y0": 0, "x1": 0, "y1": 0 }, "kind": "example-kind", "message": "what differs in the render" }' +
    '] }',
);

const region = (id: number, x0: number, y0: number, x1: number, y1: number): DiffRegion => ({
  id,
  bbox: { x0, y0, x1, y1 },
  pixels: 1,
  first: { x: x0, y: y0 },
});

describe('residual register', () => {
  it('parses the example register of the design', () => {
    expect(() => validateResidualRegister(EXAMPLE)).not.toThrow();
    expect(() => validateResidualRegister(EXAMPLE, { width: 1, height: 1 })).not.toThrow();
  });

  it('names the failing field', () => {
    const bad = (patch: object, stage?: { width: number; height: number }): string => {
      const reg = JSON.parse(JSON.stringify(EXAMPLE)) as { entries: Record<string, unknown>[] };
      Object.assign(reg.entries[0]!, patch);
      try {
        validateResidualRegister(reg, stage);
      } catch (e) {
        expect(e).toBeInstanceOf(ResidualRegisterError);
        return (e as Error).message;
      }
      return '';
    };
    expect(bad({ kind: 'Bad Kind' })).toMatch(/^entries\[0\]\.kind/);
    expect(bad({ frame: 1.5 })).toMatch(/^entries\[0\]\.frame/);
    expect(bad({ message: 'ToDo' })).toMatch(/^entries\[0\]\.message/);
    expect(bad({ bbox: { x0: 0, y0: 0, x1: 1, y1: 0 } }, { width: 1, height: 1 })).toMatch(/^entries\[0\]\.bbox\.x1/);
  });

  it('attributes to the smallest containing entry of the same frame', () => {
    const reg = {
      formatVersion: 1 as const,
      sample: 's',
      entries: [
        { frame: 1, bbox: { x0: 0, y0: 0, x1: 9, y1: 9 }, kind: 'big', message: 'm' },
        { frame: 1, bbox: { x0: 2, y0: 2, x1: 3, y1: 3 }, kind: 'small', message: 'm' },
        { frame: 2, bbox: { x0: 2, y0: 2, x1: 2, y1: 2 }, kind: 'other-frame', message: 'm' },
      ],
    };
    const a = attributeRegions(1, [region(1, 2, 2, 2, 2), region(2, 5, 5, 6, 6), region(3, 8, 8, 12, 12)], reg);
    expect(a.map((x) => x.entry?.kind ?? null)).toEqual(['small', 'big', null]);
    expect(attributeRegions(1, [region(1, 0, 0, 0, 0)], null)[0]!.entry).toBeNull();
    expect(residualLimits(a).map((l) => l.kind)).toEqual(['residual-difference', 'residual-difference']);
  });
});

describe('verifyStage residual attribution', () => {
  let root: string;
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'residual-stage-test-'));
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  const image = (marks: Array<[number, number]>): { width: number; height: number; data: Uint8Array } => {
    const data = new Uint8Array(4 * 4 * 4);
    for (let i = 0; i < 16; i++) data.set([255, 0, 0, 255], i * 4);
    for (const [x, y] of marks) data.set([0, 255, 0, 255], (y * 4 + x) * 4);
    return { width: 4, height: 4, data };
  };

  // Frame 1 differs in two separate pixels, (0,0) and (3,3).
  async function run(register: string | null): Promise<{ report: any }> {
    const sampleDir = join(root, 'sample');
    const refDir = join(sampleDir, 'reference');
    await mkdir(refDir, { recursive: true });
    if (register !== null) await writeFile(join(sampleDir, 'residual-causes.json'), register);
    const deps: Partial<VerifyDeps> = {
      exportReferenceFrames: async () => new Map([[1, image([])]]) as never,
      buildProject: async () => ({ distDir: root, dispose: async () => undefined }),
      renderFrames: async () => new Map([[1, image([[0, 0], [3, 3]])]]) as never,
    };
    await verifyStage({
      swfPath: join(root, 'x.swf'),
      jarPath: 'none',
      outputDir: join(root, 'out'),
      projectDir: join(root, 'out'),
      scene: { formatVersion: 2, stage: { width: 4, height: 4, backgroundColor: '#ffffff', frameRate: 30 }, rootSymbolId: 0, symbols: {} } as never,
      unsupported: [],
      translationReport: { formatVersion: 1, typeCheck: 'skipped', classes: [], omittedClasses: [], otherErrors: [], classPaths: [] } as never,
      sampleName: 's',
      referenceDir: refDir,
      deps,
    });
    return { report: JSON.parse(await readFile(join(root, 'out', 'fidelity-report.json'), 'utf8')) };
  }

  const entry = (x0: number, y0: number, x1: number, y1: number): object => ({
    frame: 1,
    bbox: { x0, y0, x1, y1 },
    kind: 'edge-aa',
    message: 'anti-aliasing of an edge',
  });
  const register = (entries: object[]): string => JSON.stringify({ formatVersion: 1, sample: 's', entries });

  it('adds regions and counts without a register and raises no unattributed-region Problem', async () => {
    const { report } = await run(null);
    expect(report.visual.frames[0].regions.rows.map((r: { pixels: number }) => r.pixels)).toEqual([1, 1]);
    expect(report.visual.residual).toEqual({ regions: 2, attributed: 0, unattributed: 2 });
    expect(report.problems).toEqual([]);
  });

  it('attributes with a register and raises one Problem per unattributed region', async () => {
    const { report } = await run(register([entry(0, 0, 1, 1)]));
    expect(report.visual.residual).toEqual({ regions: 2, attributed: 1, unattributed: 1 });
    expect(report.problems).toEqual([{ kind: 'unattributed-region', frame: 1, index: 2, detail: 'bbox 3,3-3,3; 1 px' }]);
    expect(report.visual.knownVisualLimits.map((l: { kind: string }) => l.kind)).toEqual(['residual-difference']);
  });

  it('has no unattributed Problem when every region is attributed', async () => {
    const { report } = await run(register([entry(0, 0, 3, 3)]));
    expect(report.visual.residual).toEqual({ regions: 2, attributed: 2, unattributed: 0 });
    expect(report.problems).toEqual([]);
  });

  it('reports an invalid register as a Problem and attributes nothing', async () => {
    const { report } = await run(register([{ ...(entry(0, 0, 1, 1) as object), message: 'TODO' }]));
    expect(report.problems).toHaveLength(1);
    expect(report.problems[0].kind).toBe('residual-register-invalid');
    expect(report.problems[0].detail).toMatch(/^entries\[0\]\.message/);
    expect(report.visual.residual).toEqual({ regions: 2, attributed: 0, unattributed: 2 });
    const bad = await run('{ not json');
    expect(bad.report.problems[0].kind).toBe('residual-register-invalid');
  });
});