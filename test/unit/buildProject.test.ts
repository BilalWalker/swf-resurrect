// Task 19.1 (verify Requirements 3.5, 12.5): the emitted project's own vite.config.ts puts
// assets/ into dist, built here with the real Vite via buildProject.
import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildProject, type BuiltProject } from '../../src/verify/edge/buildProject';
import { MIME } from '../../src/verify/edge/renderFrames';
import { emitFixtureProject, type EmittedFixtureProject } from '../support/emitFixtureProject';

describe('buildProject (clickgoto fixture)', () => {
  let project: EmittedFixtureProject;
  let built: BuiltProject;

  beforeAll(async () => {
    project = await emitFixtureProject('clickgoto');
    built = await buildProject(project.projectDir);
  }, 120_000);

  afterAll(async () => {
    await built?.dispose();
    await project?.dispose();
  });

  it('keeps index.html and copies assets/scene.json and the shape files into dist', async () => {
    expect(existsSync(resolve(built.distDir, 'index.html'))).toBe(true);
    const scene = JSON.parse(await readFile(resolve(built.distDir, 'assets/scene.json'), 'utf8'));
    expect(scene).toHaveProperty('symbols');
    const files = await readdir(resolve(built.distDir, 'assets'));
    expect(files.some((f) => f.endsWith('.shape.json'))).toBe(true);
  });
});

describe('buildProject with a bitmap asset (Task 11.5, Requirement 9.2)', () => {
  let project: EmittedFixtureProject;
  let built: BuiltProject;
  const bytes = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0xff, 0x80]);

  beforeAll(async () => {
    project = await emitFixtureProject('clickgoto');
    await mkdir(resolve(project.projectDir, 'assets/images'), { recursive: true });
    await writeFile(resolve(project.projectDir, 'assets/images/5.png'), bytes);
    built = await buildProject(project.projectDir);
  }, 120_000);

  afterAll(async () => {
    await built?.dispose();
    await project?.dispose();
  });

  it('copies assets/images/5.png into dist/assets/images byte for byte', async () => {
    const copied = await readFile(resolve(built.distDir, 'assets/images/5.png'));
    expect(new Uint8Array(copied)).toEqual(bytes);
  });

  it('the verify render server has a MIME type for every Shape_JSON bitmap extension', () => {
    expect(MIME['.png']).toBe('image/png');
    expect(MIME['.jpg']).toBe('image/jpeg');
  });
});
