/**
 * Export registry — runs EXPORT directives and writes output files.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type { StepOutput } from '../executor/index.js';
import type { EvalResult } from '../eval/index.js';
import { toMarkdown } from './markdown.js';
import { toJSON } from './json.js';
import type { ExportDirective } from '../parser/types.js';

export { toMarkdown, toJSON };

export interface ExportOutput {
  format: string;
  path: string | null;
  content: string;
}

export const KNOWN_FORMATS = ['markdown', 'md', 'json'];

export async function runExports(
  exports: ExportDirective[],
  outputs: StepOutput[],
  evalResults: EvalResult[],
  cwd: string,
): Promise<ExportOutput[]> {
  const results: ExportOutput[] = [];

  for (const directive of exports) {
    const fmt = directive.format.toLowerCase();
    let content: string;

    switch (fmt) {
      case 'markdown':
      case 'md':
        content = toMarkdown(outputs, evalResults);
        break;
      case 'json':
        content = JSON.stringify(toJSON(outputs, evalResults), null, 2);
        break;
      default:
        throw new Error(
          `Unknown export format: "${directive.format}". Supported: ${KNOWN_FORMATS.join(', ')}`,
        );
    }

    const outputPath = directive.path ? resolve(cwd, directive.path) : null;
    if (outputPath) {
      mkdirSync(dirname(outputPath), { recursive: true });
      writeFileSync(outputPath, content, 'utf-8');
    }

    results.push({ format: directive.format, path: outputPath, content });
  }

  return results;
}
