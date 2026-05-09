/**
 * Context builder — reads files and directories specified by CONTEXT directives
 * and formats them as an XML-fenced block for injection into the system prompt.
 */
import { readFileSync, statSync, existsSync, readdirSync } from 'node:fs';
import { join, resolve, extname, relative } from 'node:path';
import type { ContextDirective } from '../parser/types.js';

const MAX_FILE_BYTES = 512 * 1024; // 512 KB per file
const MAX_TOTAL_BYTES = 4 * 1024 * 1024; // 4 MB total context

const BINARY_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.ico', '.svg',
  '.pdf', '.zip', '.tar', '.gz', '.bz2', '.7z',
  '.exe', '.bin', '.dll', '.so', '.dylib',
  '.mp3', '.mp4', '.wav', '.avi', '.mov',
  '.woff', '.woff2', '.ttf', '.eot',
]);

const IGNORED_DIRS = new Set([
  'node_modules', '.git', '.svn', '__pycache__', '.pytest_cache',
  '.mypy_cache', 'dist', 'build', 'target', '.next', '.nuxt',
  'coverage', '.turbo', '.cache',
]);

function isBinary(filePath: string): boolean {
  return BINARY_EXTENSIONS.has(extname(filePath).toLowerCase());
}

function collectFiles(dir: string, exclude: string[]): string[] {
  const files: string[] = [];
  const excludedSet = new Set(exclude);

  function walk(current: string): void {
    let stat;
    try {
      stat = statSync(current);
    } catch {
      return;
    }

    if (stat.isFile()) {
      if (!isBinary(current) && stat.size <= MAX_FILE_BYTES) {
        files.push(current);
      }
      return;
    }

    if (!stat.isDirectory()) return;

    let entries: string[];
    try {
      entries = readdirSync(current);
    } catch {
      return;
    }

    for (const entry of entries) {
      if (entry.startsWith('.')) continue;
      if (IGNORED_DIRS.has(entry)) continue;
      if (excludedSet.has(entry)) continue;
      walk(join(current, entry));
    }
  }

  walk(dir);
  return files;
}

function formatFile(relPath: string, content: string): string {
  const lang = extname(relPath).slice(1) || 'text';
  return `<file path="${relPath}">\n\`\`\`${lang}\n${content.trimEnd()}\n\`\`\`\n</file>`;
}

export async function buildContext(
  directives: ContextDirective[],
  cwd: string,
): Promise<string> {
  if (directives.length === 0) return '';

  const parts: string[] = [];
  let totalBytes = 0;

  for (const directive of directives) {
    const absPath = resolve(cwd, directive.path);

    if (!existsSync(absPath)) {
      parts.push(`<!-- CONTEXT: "${directive.path}" not found -->`);
      continue;
    }

    const stat = statSync(absPath);

    if (stat.isFile()) {
      if (isBinary(absPath)) continue;
      if (totalBytes + stat.size > MAX_TOTAL_BYTES) {
        parts.push('<!-- CONTEXT: size limit reached, some files omitted -->');
        break;
      }
      const content = readFileSync(absPath, 'utf-8');
      totalBytes += stat.size;
      parts.push(formatFile(relative(cwd, absPath), content));
    } else if (stat.isDirectory()) {
      const files = collectFiles(absPath, directive.exclude);
      for (const file of files) {
        let fileStat;
        try {
          fileStat = statSync(file);
        } catch {
          continue;
        }

        if (totalBytes + fileStat.size > MAX_TOTAL_BYTES) {
          parts.push('<!-- CONTEXT: size limit reached, some files omitted -->');
          break;
        }

        try {
          const content = readFileSync(file, 'utf-8');
          totalBytes += fileStat.size;
          parts.push(formatFile(relative(cwd, file), content));
        } catch {
          // Skip unreadable files
        }
      }
    }
  }

  return parts.join('\n\n');
}
