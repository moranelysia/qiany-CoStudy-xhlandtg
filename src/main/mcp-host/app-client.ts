import { app } from 'electron'
import path from 'node:path'
import { McpClient } from './client'

export function mcpScriptPath(filename: string): string {
  return path.join(app.getAppPath(), 'scripts', filename)
}

export function createAppMcpClient(
  filename: string,
  options: { timeoutMs: number; env?: Record<string, string> },
): McpClient {
  return new McpClient(process.execPath, [mcpScriptPath(filename)], {
    cwd: app.getAppPath(),
    timeoutMs: options.timeoutMs,
    env: { ...options.env, ELECTRON_RUN_AS_NODE: '1' },
  })
}
