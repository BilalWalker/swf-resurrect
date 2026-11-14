// Pure: a minimal MCP server core (JSON-RPC 2.0 over newline-delimited JSON).
// Handles initialize, ping, tools/list and tools/call. No IO here; main.ts wires stdio.

export interface TextContent {
  type: 'text';
  text: string;
}
export interface ImageContent {
  type: 'image';
  /** Base64. */
  data: string;
  mimeType: string;
}
export type ToolContent = TextContent | ImageContent;

export interface ToolResult {
  content: ToolContent[];
  isError?: boolean;
}

export interface ToolDefinition {
  name: string;
  description: string;
  /** JSON Schema of the arguments object. */
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
    additionalProperties?: boolean;
  };
  run(args: Record<string, unknown>): Promise<ToolResult>;
}

export interface ServerInfo {
  name: string;
  version: string;
}

type Id = string | number | null;
export interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: Id;
  result?: unknown;
  error?: { code: number; message: string };
}

/** Protocol revisions this server speaks, newest first. */
export const PROTOCOL_VERSIONS = ['2025-06-18', '2025-03-26', '2024-11-05'] as const;

export const PARSE_ERROR = -32700;
export const INVALID_REQUEST = -32600;
export const METHOD_NOT_FOUND = -32601;
export const INVALID_PARAMS = -32602;

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function fail(id: Id, code: number, message: string): JsonRpcResponse {
  return { jsonrpc: '2.0', id, error: { code, message } };
}

export function textResult(text: string): ToolResult {
  return { content: [{ type: 'text', text }] };
}

export function errorResult(message: string): ToolResult {
  return { content: [{ type: 'text', text: message }], isError: true };
}

/** Names of required arguments that are missing or not strings/numbers as the schema asks. */
export function checkArguments(tool: ToolDefinition, args: Record<string, unknown>): string | null {
  for (const name of tool.inputSchema.required ?? []) {
    if (args[name] === undefined || args[name] === null) return `missing required argument "${name}"`;
  }
  for (const [name, value] of Object.entries(args)) {
    const schema = tool.inputSchema.properties[name];
    if (schema === undefined) {
      if (tool.inputSchema.additionalProperties === false) return `unknown argument "${name}"`;
      continue;
    }
    const wanted = isObject(schema) ? schema.type : undefined;
    if (wanted === 'string' && typeof value !== 'string') return `argument "${name}" must be a string`;
    if (wanted === 'integer' && !(typeof value === 'number' && Number.isInteger(value))) {
      return `argument "${name}" must be an integer`;
    }
  }
  return null;
}

export interface McpServer {
  /** One parsed JSON-RPC message in, one response out (null for notifications). */
  handle(message: unknown): Promise<JsonRpcResponse | null>;
  /** One line of input in, one line of output out (null when nothing is sent). */
  handleLine(line: string): Promise<string | null>;
}

export function createServer(info: ServerInfo, tools: readonly ToolDefinition[]): McpServer {
  const byName = new Map(tools.map((t) => [t.name, t]));

  async function handle(message: unknown): Promise<JsonRpcResponse | null> {
    if (!isObject(message) || message.jsonrpc !== '2.0' || typeof message.method !== 'string') {
      return fail(null, INVALID_REQUEST, 'not a JSON-RPC 2.0 request');
    }
    const isNotification = !('id' in message);
    const rawId = message.id;
    const id: Id = typeof rawId === 'string' || typeof rawId === 'number' ? rawId : null;
    const params = isObject(message.params) ? message.params : {};

    if (isNotification) return null; // notifications/initialized, notifications/cancelled, ...

    switch (message.method) {
      case 'initialize': {
        const asked = params.protocolVersion;
        const version = PROTOCOL_VERSIONS.find((v) => v === asked) ?? PROTOCOL_VERSIONS[0];
        return {
          jsonrpc: '2.0',
          id,
          result: { protocolVersion: version, capabilities: { tools: {} }, serverInfo: info },
        };
      }
      case 'ping':
        return { jsonrpc: '2.0', id, result: {} };
      case 'tools/list':
        return {
          jsonrpc: '2.0',
          id,
          result: {
            tools: tools.map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema })),
          },
        };
      case 'tools/call': {
        const name = params.name;
        if (typeof name !== 'string') return fail(id, INVALID_PARAMS, 'tools/call needs a tool name');
        const tool = byName.get(name);
        if (tool === undefined) return fail(id, INVALID_PARAMS, `unknown tool "${name}"`);
        const args = isObject(params.arguments) ? params.arguments : {};
        const problem = checkArguments(tool, args);
        if (problem !== null) return { jsonrpc: '2.0', id, result: errorResult(`${name}: ${problem}`) };
        try {
          return { jsonrpc: '2.0', id, result: await tool.run(args) };
        } catch (err) {
          // Tool failures are results the agent can read, not protocol errors.
          return { jsonrpc: '2.0', id, result: errorResult(`${name}: ${err instanceof Error ? err.message : String(err)}`) };
        }
      }
      default:
        return fail(id, METHOD_NOT_FOUND, `method not found: ${message.method}`);
    }
  }

  async function handleLine(line: string): Promise<string | null> {
    const trimmed = line.trim();
    if (trimmed === '') return null;
    let message: unknown;
    try {
      message = JSON.parse(trimmed);
    } catch {
      return JSON.stringify(fail(null, PARSE_ERROR, 'parse error'));
    }
    const response = await handle(message);
    return response === null ? null : JSON.stringify(response);
  }

  return { handle, handleLine };
}
