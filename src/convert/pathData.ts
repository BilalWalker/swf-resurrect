// Path data helpers for the Shape_Function: parse an SVG `d` string into PathCmd lists, bake an affine matrix into the
// commands and print them back. Core: no node module, clock, randomness or locale call (Requirement 15.2).
// Matrices follow SVG `matrix(a b c d e f)`: x' = a*x + c*y + e, y' = b*x + d*y + f.

import type { Mat6, PathCmd } from '../../template/runtime/shapeJson';

const TOKEN = /([a-zA-Z])|([-+]?(?:[0-9]+\.?[0-9]*|\.[0-9]+)(?:[eE][-+]?[0-9]+)?)|[\s,]+/gy;

const ARITY: Readonly<Record<string, number>> = { m: 2, l: 2, h: 1, v: 1, q: 4, c: 6, z: 0 };

/** `-0` becomes `0`; other numbers keep their shortest round-trip form. */
function num(n: number): number {
  return Object.is(n, -0) ? 0 : n;
}

function tokenize(d: string): Array<string | number> {
  const out: Array<string | number> = [];
  TOKEN.lastIndex = 0;
  while (TOKEN.lastIndex < d.length) {
    const start = TOKEN.lastIndex;
    const m = TOKEN.exec(d);
    if (m === null) throw new Error(`path data: unexpected character at ${start}`);
    if (m[1] !== undefined) out.push(m[1]);
    else if (m[2] !== undefined) out.push(Number(m[2]));
  }
  return out;
}

/**
 * Parses absolute and relative `M L H V Q C Z` (the commands FFDec writes, plus the common relative forms). A command
 * letter may be followed by several argument groups (implicit repetition): extra pairs after `M` are `L`, after `m`
 * are `l`. `H` and `V` become `L`. Anything else (arcs, smooth curves) throws.
 */
export function parsePathD(d: string): PathCmd[] {
  const tokens = tokenize(d);
  const out: PathCmd[] = [];
  let cx = 0;
  let cy = 0;
  let sx = 0;
  let sy = 0;
  let i = 0;
  let cmd = '';
  let first = true;
  let fresh = false;
  while (i < tokens.length) {
    const t = tokens[i];
    if (typeof t === 'string') {
      cmd = t;
      fresh = true;
      i++;
      if (ARITY[cmd.toLowerCase()] === undefined) throw new Error(`path data: unsupported command ${cmd}`);
      if (first && cmd.toLowerCase() !== 'm') throw new Error('path data: must start with M');
      first = false;
      if (cmd.toLowerCase() === 'z') {
        out.push(['Z']);
        cx = sx;
        cy = sy;
        continue;
      }
    } else if (cmd === '' || cmd.toLowerCase() === 'z') {
      throw new Error('path data: number without a command');
    }
    const lower = cmd.toLowerCase();
    const rel = cmd !== cmd.toUpperCase();
    const n = ARITY[lower];
    const args: number[] = [];
    for (let k = 0; k < n; k++) {
      const a = tokens[i + k];
      if (typeof a !== 'number') throw new Error(`path data: command ${cmd} needs ${n} numbers`);
      args.push(a);
    }
    i += n;
    const ox = rel ? cx : 0;
    const oy = rel ? cy : 0;
    switch (lower) {
      case 'm':
        cx = args[0] + ox;
        cy = args[1] + oy;
        // Pairs after the first are implicit lineto of the same case.
        if (fresh) {
          out.push(['M', num(cx), num(cy)]);
          sx = cx;
          sy = cy;
        } else {
          out.push(['L', num(cx), num(cy)]);
        }
        break;
      case 'l':
        cx = args[0] + ox;
        cy = args[1] + oy;
        out.push(['L', num(cx), num(cy)]);
        break;
      case 'h':
        cx = args[0] + ox;
        out.push(['L', num(cx), num(cy)]);
        break;
      case 'v':
        cy = args[0] + oy;
        out.push(['L', num(cx), num(cy)]);
        break;
      case 'q':
        out.push(['Q', num(args[0] + ox), num(args[1] + oy), num(args[2] + ox), num(args[3] + oy)]);
        cx = args[2] + ox;
        cy = args[3] + oy;
        break;
      case 'c':
        out.push([
          'C',
          num(args[0] + ox),
          num(args[1] + oy),
          num(args[2] + ox),
          num(args[3] + oy),
          num(args[4] + ox),
          num(args[5] + oy),
        ]);
        cx = args[4] + ox;
        cy = args[5] + oy;
        break;
    }
    fresh = false;
  }
  return out;
}

/** Applies the matrix to every point of every command. A pure function; the input is not changed. */
export function bakeCmds(cmds: readonly PathCmd[], m: Mat6): PathCmd[] {
  const [a, b, c, d, e, f] = m;
  const px = (x: number, y: number): number => num(a * x + c * y + e);
  const py = (x: number, y: number): number => num(b * x + d * y + f);
  return cmds.map((cmd): PathCmd => {
    switch (cmd[0]) {
      case 'M':
        return ['M', px(cmd[1], cmd[2]), py(cmd[1], cmd[2])];
      case 'L':
        return ['L', px(cmd[1], cmd[2]), py(cmd[1], cmd[2])];
      case 'Q':
        return ['Q', px(cmd[1], cmd[2]), py(cmd[1], cmd[2]), px(cmd[3], cmd[4]), py(cmd[3], cmd[4])];
      case 'C':
        return [
          'C',
          px(cmd[1], cmd[2]),
          py(cmd[1], cmd[2]),
          px(cmd[3], cmd[4]),
          py(cmd[3], cmd[4]),
          px(cmd[5], cmd[6]),
          py(cmd[5], cmd[6]),
        ];
      case 'Z':
        return ['Z'];
    }
  });
}

/** Prints absolute commands separated by single spaces, numbers in their shortest round-trip form, `-0` as `0`. */
export function cmdsToD(cmds: readonly PathCmd[]): string {
  return cmds.map((cmd) => cmd.map((v) => (typeof v === 'number' ? String(num(v)) : v)).join(' ')).join(' ');
}
