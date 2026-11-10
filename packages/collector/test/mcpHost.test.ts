import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildMcpServer } from '../src/mcp.js';
import { isPublicMcpHost, PUBLIC_MCP_HOSTS } from '../src/mcpHosts.js';
import { Redactor } from '../src/redact.js';

function hostFor(url: string, transport: 'http' | 'sse' = 'http'): string | undefined {
  return buildMcpServer('s', { type: transport, url }, 'user', 0, new Redactor()).host;
}

test('allow-listed public hosts are kept as host', () => {
  assert.equal(hostFor('https://mcp.notion.com/mcp'), 'mcp.notion.com');
  assert.equal(hostFor('https://api.githubcopilot.com/mcp/?x=1'), 'api.githubcopilot.com');
  assert.equal(hostFor('https://MCP.Exa.AI/mcp', 'sse'), 'mcp.exa.ai');
  assert.equal(hostFor('https://huggingface.co/mcp'), 'huggingface.co');
  for (const host of PUBLIC_MCP_HOSTS.exact) assert.equal(isPublicMcpHost(host), true, host);
});

test('suffix entries match subdomains only', () => {
  assert.equal(hostFor('https://bindings.mcp.cloudflare.com/sse'), 'bindings.mcp.cloudflare.com');
  assert.equal(isPublicMcpHost('mcp.cloudflare.com'), false);
  assert.equal(isPublicMcpHost('evilmcp.cloudflare.com'), false);
  assert.equal(isPublicMcpHost('mcp.notion.com.attacker.dev'), false);
  assert.equal(isPublicMcpHost('sub.mcp.notion.com'), false);
});

test('internal domains, IPs and localhost lose the host field', () => {
  for (const url of [
    'https://mcp.acme.dev/mcp',
    'https://agent.dev.acme.dev/sse',
    'http://127.0.0.1:8080/mcp',
    'http://localhost:3000/mcp',
    'http://[::1]:3000/mcp',
    'http://10.0.0.5/mcp',
    'https://mcp.example.com/v1',
  ]) {
    const server = buildMcpServer('s', { type: 'http', url }, 'user', 3, new Redactor());
    assert.deepEqual(server, { name: 's', transport: 'http', scope: 'user', calls: 3 }, url);
  }
});
