import { startMcpServer } from '../../mcp/server.js';

export async function executeMcpCommand(): Promise<void> {
  await startMcpServer();
}
