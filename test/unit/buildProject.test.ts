// Task 19.1 (verify Requirements 3.5, 12.5): the emitted project's own vite.config.ts puts
// assets/ into dist, built here with the real Vite via buildProject.
import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildProject, type BuiltProject } from '../../src/verify/edge/buildProject';
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
