/**
 * Exact versions pinned into the emitted project's package.json.
 * Chosen with `npm view <pkg> version` on 2026-11-11.
 * PixiJS API names the runtime adapter relies on were checked against the
 * installed pixi.js 8.22.0 typings: `Application#init(options?): Promise<void>`
 * and `Graphics#svg(svg: string): this`.
 */
export const PIXI_VERSION = "8.22.0";
export const VITE_VERSION = "8.3.8";
export const TYPESCRIPT_VERSION = "7.0.2";
