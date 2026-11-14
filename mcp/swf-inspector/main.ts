// Edge: stdio entry of the SWF inspector MCP server. Start with `npm run mcp:swf-inspector`.
// stdout carries protocol messages only; diagnostics go to stderr.
import path from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { createServer } from './protocol';
import { createTools } from './tools';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const jarPath = process.env.SWF_RESURRECT_FFDEC ?? path.join(repoRoot, 'tools', 'ffdec', 'ffdec-cli.jar');

const server = createServer(
  { name: 'swf-inspector', version: '0.1.0' },
  createTools({ repoRoot, jarPath, cacheDir: path.join(repoRoot, '.work', 'mcp-swf-inspector') }),
);

const lines = createInterface({ input: process.stdin, crlfDelay: Infinity });
// Requests are answered in arrival order so FFDec never runs twice for the same cache entry.
let queue: Promise<void> = Promise.resolve();
lines.on('line', (line) => {
  queue = queue.then(async () => {
    try {
      const reply = await server.handleLine(line);
      if (reply !== null) process.stdout.write(`${reply}\n`);
    } catch (err) {
      process.stderr.write(`swf-inspector: ${err instanceof Error ? err.message : String(err)}\n`);
    }
  });
});
lines.on('close', () => {
  void queue.then(() => process.exit(0));
});
