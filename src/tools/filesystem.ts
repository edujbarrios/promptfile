/**
 * Filesystem tool — lets the model read files and list directories.
 * Automatically excluded: node_modules, .git, binary files.
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, resolve, extname } from 'node:path';
import { BaseTool } from './base.js';
import type { ToolResult } from './base.js';

const MAX_FILE_SIZE = 100 * 1024; // 100 KB

const BINARY_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.ico',
  '.pdf', '.zip', '.tar', '.gz', '.bz2', '.7z',
  '.exe', '.bin', '.dll', '.so', '.dylib',
  '.mp3', '.mp4', '.wav', '.avi', '.mov',
  '.woff', '.woff2', '.ttf', '.eot',
]);

const IGNORED_DIRS = new Set([
  'node_modules', '.git', '.svn', '__pycache__',
  'dist', 'build', 'target', '.next', '.nuxt',
  'coverage', '.turbo', '.cache',
]);

export class FilesystemTool extends BaseTool {
  readonly name = 'filesystem';
  readonly description =
    'Read files and list directories from the local filesystem. ' +
    'Use this to inspect source code, configuration, and documentation.';
  readonly parameters = {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['read', 'list', 'stat'],
        description: 'The action to perform',
      },
      path: {
        type: 'string',
        description: 'The file or directory path (absolute or relative to cwd)',
      },
      recursive: {
        type: 'boolean',
        description: 'List files recursively (only for "list" action)',
      },
    },
    required: ['action', 'path'],
  };

  async execute(params: Record<string, unknown>): Promise<ToolResult> {
    const action = params['action'] as string;
    const rawPath = params['path'] as string;
    const path = resolve(rawPath);

    if (!existsSync(path)) {
      return { success: false, error: `Path does not exist: ${rawPath}` };
    }

    try {
      switch (action) {
        case 'read': {
          const stat = statSync(path);
          if (stat.isDirectory()) {
            return { success: false, error: 'Cannot read a directory — use "list" instead' };
          }
          if (BINARY_EXTENSIONS.has(extname(path).toLowerCase())) {
            return { success: false, error: 'Cannot read binary files' };
          }
          if (stat.size > MAX_FILE_SIZE) {
            return {
              success: false,
              error: `File too large (${stat.size} bytes, max ${MAX_FILE_SIZE})`,
            };
          }
          const content = readFileSync(path, 'utf-8');
          return { success: true, data: { path, content, size: stat.size } };
        }

        case 'list': {
          const recursive = params['recursive'] === true;
          const files = recursive ? this.listRecursive(path) : readdirSync(path);
          return { success: true, data: { path, files } };
        }

        case 'stat': {
          const stat = statSync(path);
          return {
            success: true,
            data: {
              path,
              isFile: stat.isFile(),
              isDirectory: stat.isDirectory(),
              size: stat.size,
              modified: stat.mtime.toISOString(),
            },
          };
        }

        default:
          return { success: false, error: `Unknown action: ${action}` };
      }
    } catch (err) {
      return { success: false, error: String(err) };
    }
  }

  private listRecursive(dir: string, base = dir): string[] {
    const results: string[] = [];
    try {
      const entries = readdirSync(dir);
      for (const entry of entries) {
        if (entry.startsWith('.') || IGNORED_DIRS.has(entry)) continue;
        const full = join(dir, entry);
        const stat = statSync(full);
        if (stat.isDirectory()) {
          results.push(...this.listRecursive(full, base));
        } else if (!BINARY_EXTENSIONS.has(extname(entry).toLowerCase())) {
          results.push(full.slice(base.length + 1));
        }
      }
    } catch {
      // Skip unreadable directories
    }
    return results;
  }
}
