/**
 * Tool registry — maps TOOL directive names to concrete Tool implementations.
 */
import { FilesystemTool } from './filesystem.js';
import { GitHubTool } from './github.js';
import type { Tool } from './base.js';
import type { ToolDirective } from '../parser/types.js';

export { FilesystemTool, GitHubTool };
export type { Tool, ToolResult } from './base.js';

type ToolConstructor = new (options?: Record<string, string>) => Tool;

const REGISTRY: Record<string, ToolConstructor> = {
  filesystem: FilesystemTool,
  github: GitHubTool,
};

export const KNOWN_TOOLS = Object.keys(REGISTRY);

export function resolveTool(directive: ToolDirective): Tool {
  const Ctor = REGISTRY[directive.name];
  if (!Ctor) {
    throw new Error(
      `Unknown tool: "${directive.name}". Available tools: ${KNOWN_TOOLS.join(', ')}`,
    );
  }
  return new Ctor(directive.options);
}
