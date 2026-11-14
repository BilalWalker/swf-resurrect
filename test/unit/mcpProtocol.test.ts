import { describe, expect, it } from 'vitest';
import {
  checkArguments,
  createServer,
  INVALID_PARAMS,
  INVALID_REQUEST,
  METHOD_NOT_FOUND,
  PARSE_ERROR,
  PROTOCOL_VERSIONS,
  textResult,
  type ToolDefinition,
} from '../../mcp/swf-inspector/protocol';

const echo: ToolDefinition = {
  name: 'echo',
  description: 'returns its text',
  inputSchema: {
    type: 'object',
    properties: { text: { type: 'string' }, times: { type: 'integer' } },
    required: ['text'],
    additionalProperties: false,
  },
  run: async (args) => textResult(String(args.text)),
};
const boom: ToolDefinition = {
  name: 'boom',
  description: 'throws',
  inputSchema: { type: 'object', properties: {} },
  run: async () => {
    throw new Error('kaput');
  },
};

describe('MCP protocol core', () => {
  const server = createServer({ name: 't', version: '1' }, [echo, boom]);
  const call = (method: string, params?: unknown, id: number | string = 1) =>
    server.handle({ jsonrpc: '2.0', id, method, params });

  it('answers initialize with the asked protocol version when it is supported', async () => {
    const r = await call('initialize', { protocolVersion: '2024-11-05', capabilities: {} });
    expect(r?.result).toEqual({
      protocolVersion: '2024-11-05',
      capabilities: { tools: {} },
      serverInfo: { name: 't', version: '1' },
    });
  });

  it('falls back to its newest protocol version for an unknown one', async () => {
    const r = await call('initialize', { protocolVersion: '1999-01-01' });
    expect((r?.result as { protocolVersion: string }).protocolVersion).toBe(PROTOCOL_VERSIONS[0]);
  });

  it('sends nothing for notifications', async () => {
    expect(await server.handle({ jsonrpc: '2.0', method: 'notifications/initialized' })).toBeNull();
  });

  it('answers ping and keeps the request id, string or number', async () => {
    expect(await call('ping', undefined, 'abc')).toEqual({ jsonrpc: '2.0', id: 'abc', result: {} });
  });

  it('lists tools without the run function', async () => {
    const r = await call('tools/list');
    const tools = (r?.result as { tools: Array<Record<string, unknown>> }).tools;
    expect(tools.map((t) => t.name)).toEqual(['echo', 'boom']);
    expect(Object.keys(tools[0]).sort()).toEqual(['description', 'inputSchema', 'name']);
  });

  it('runs a tool', async () => {
    const r = await call('tools/call', { name: 'echo', arguments: { text: 'hi' } });
    expect(r?.result).toEqual({ content: [{ type: 'text', text: 'hi' }] });
  });

  it('reports a thrown tool error as an isError result, not a protocol error', async () => {
    const r = await call('tools/call', { name: 'boom', arguments: {} });
    expect(r?.error).toBeUndefined();
    expect(r?.result).toEqual({ content: [{ type: 'text', text: 'boom: kaput' }], isError: true });
  });

  it('reports bad arguments as an isError result', async () => {
    const missing = await call('tools/call', { name: 'echo', arguments: {} });
    expect(missing?.result).toMatchObject({ isError: true });
    const wrongType = await call('tools/call', { name: 'echo', arguments: { text: 5 } });
    expect(wrongType?.result).toMatchObject({ isError: true });
  });

  it('rejects unknown tools, unknown methods and non-requests with JSON-RPC errors', async () => {
    expect((await call('tools/call', { name: 'nope' }))?.error?.code).toBe(INVALID_PARAMS);
    expect((await call('resources/list'))?.error?.code).toBe(METHOD_NOT_FOUND);
    expect((await server.handle({ hello: 1 }))?.error?.code).toBe(INVALID_REQUEST);
    expect((await server.handle([1, 2]))?.error?.code).toBe(INVALID_REQUEST);
  });

  it('handleLine parses, answers on one line and survives bad JSON and blank lines', async () => {
    const reply = await server.handleLine('{"jsonrpc":"2.0","id":7,"method":"ping"}');
    expect(reply).toBe('{"jsonrpc":"2.0","id":7,"result":{}}');
    expect(JSON.parse((await server.handleLine('{nope'))!).error.code).toBe(PARSE_ERROR);
    expect(await server.handleLine('   ')).toBeNull();
  });
});

describe('checkArguments', () => {
  it('accepts valid arguments and names the first problem otherwise', () => {
    expect(checkArguments(echo, { text: 'a', times: 2 })).toBeNull();
    expect(checkArguments(echo, { text: 'a', times: 2.5 })).toMatch(/times.*integer/);
    expect(checkArguments(echo, { text: 'a', other: 1 })).toMatch(/unknown argument "other"/);
    expect(checkArguments(echo, { times: 1 })).toMatch(/missing required argument "text"/);
  });
});

