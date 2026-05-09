/**
 * CLI definition — wires all commands together via Commander.
 */
import { Command } from 'commander';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { runCommand } from './commands/run.js';
import { validateCommand } from './commands/validate.js';
import { initCommand } from './commands/init.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function getVersion(): string {
  try {
    const pkg = JSON.parse(
      readFileSync(join(__dirname, '../../package.json'), 'utf-8'),
    ) as { version: string };
    return pkg.version;
  } catch {
    return '0.1.0';
  }
}

export function createCLI(): Command {
  const program = new Command();

  program
    .name('pf')
    .description('Promptfile — Dockerfile for AI workflows')
    .version(getVersion());

  // ─── pf run ───────────────────────────────────────────────────────────────
  program
    .command('run [file]')
    .description('Execute a Promptfile workflow')
    .option('--stream', 'stream model output in real-time (default: true)')
    .option('--no-stream', 'disable streaming; print response when complete')
    .option('-q, --quiet', 'suppress progress output; show only final results')
    .option('--json', 'output results as JSON to stdout')
    .option(
      '-a, --arg <key=value>',
      'pass ARG values (repeatable, e.g. -a model=gpt-4o -a target=./src)',
      (val: string, acc: string[]) => {
        acc.push(val);
        return acc;
      },
      [] as string[],
    )
    .action(
      async (
        file: string | undefined,
        options: { stream: boolean; quiet: boolean; json: boolean; arg: string[] },
      ) => {
        await runCommand({
          file: file ?? 'Promptfile',
          args: options.arg,
          stream: options.stream,
          quiet: options.quiet,
          json: options.json,
        });
      },
    );

  // ─── pf validate ──────────────────────────────────────────────────────────
  program
    .command('validate [file]')
    .alias('lint')
    .description('Validate a Promptfile without executing it')
    .action(async (file: string | undefined) => {
      await validateCommand(file ?? 'Promptfile');
    });

  // ─── pf init ──────────────────────────────────────────────────────────────
  program
    .command('init [template] [output]')
    .description('Create a new Promptfile from a template (basic | architect | summarizer | reviewer)')
    .action(async (template?: string, output?: string) => {
      await initCommand(template, output);
    });

  // ─── pf parse ─────────────────────────────────────────────────────────────
  program
    .command('parse [file]')
    .description('Parse a Promptfile and print the AST as JSON (useful for debugging)')
    .action(async (file: string | undefined) => {
      const { readFileSync } = await import('node:fs');
      const { resolve } = await import('node:path');
      const { parse } = await import('../parser/index.js');

      const filePath = resolve(file ?? 'Promptfile');
      const source = readFileSync(filePath, 'utf-8');
      const ast = parse(source, filePath);
      console.log(JSON.stringify(ast, null, 2));
    });

  return program;
}
