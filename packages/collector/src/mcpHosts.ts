/**
 * Public MCP services whose hostname may be exported as McpServer.host. Any other host (internal
 * domains, IPs, localhost) is dropped so a profile never reveals private infrastructure.
 */
export const PUBLIC_MCP_HOSTS: { readonly exact: readonly string[]; readonly suffixes: readonly string[] } = {
  exact: [
    'mcp.exa.ai',
    'mcp.notion.com',
    'api.githubcopilot.com',
    'mcp.linear.app',
    'mcp.sentry.dev',
    'mcp.atlassian.com',
    'mcp.stripe.com',
    'mcp.vercel.com',
    'mcp.supabase.com',
    'mcp.context7.com',
    'mcp.deepwiki.com',
    'mcp.asana.com',
    'mcp.intercom.com',
    'mcp.zapier.com',
    'mcp.canva.com',
    'mcp.paypal.com',
    'huggingface.co',
  ],
  // '*.mcp.cloudflare.com': subdomains only, written with the leading dot.
  suffixes: ['.mcp.cloudflare.com'],
};

const EXACT = new Set(PUBLIC_MCP_HOSTS.exact);

/** `host` must already be a lower-case URL hostname. */
export function isPublicMcpHost(host: string): boolean {
  if (EXACT.has(host)) return true;
  return PUBLIC_MCP_HOSTS.suffixes.some((suffix) => host.length > suffix.length && host.endsWith(suffix));
}
