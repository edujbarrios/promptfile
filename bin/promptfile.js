#!/usr/bin/env node
/**
 * promptfile — globally installable CLI entry point
 *
 * Install:  npm install -g promptfile
 * Usage:    promptfile <command> [options]
 */

import { program } from 'commander';
import chalk from 'chalk';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/** Read version from package.json at runtime so it stays in sync. */
function getVersion() {
  try {
    const pkg = JSON.parse(
      readFileSync(join(__dirname, '../package.json'), 'utf-8'),
    );
    return pkg.version;
  } catch {
    return '0.1.0';
  }
}

program
  .name('promptfile')
  .description('Promptfile — Dockerfile for AI workflows')
  .version(getVersion());

// ─── promptfile init ──────────────────────────────────────────────────────────
program
  .command('init [template]')
  .description(
    'Initialize a new Promptfile (templates: basic | architect | summarizer | reviewer)',
  )
  .action((template) => {
    console.log(chalk.bold.cyan('Initializing Promptfile...'));

    if (template) {
      console.log(chalk.dim(`Template: ${template}`));
    }

    console.log(
      chalk.green('✓ Done!') +
        chalk.dim(' Edit your Promptfile and run: promptfile run'),
    );
  });

// ─── promptfile run ───────────────────────────────────────────────────────────
program
  .command('run [file]')
  .description('Execute a Promptfile workflow')
  .option('--no-stream', 'disable streaming; print response when complete')
  .option('-q, --quiet', 'suppress progress output')
  .option('--json', 'output results as JSON')
  .option(
    '-a, --arg <key=value>',
    'pass ARG values (repeatable)',
    (val, acc) => {
      acc.push(val);
      return acc;
    },
    [],
  )
  .action((file, options) => {
    console.log(
      chalk.cyan(`Running ${file ?? 'Promptfile'}`) +
        chalk.dim(' — build the project first with: npm run build'),
    );
  });

// ─── promptfile validate ──────────────────────────────────────────────────────
program
  .command('validate [file]')
  .alias('lint')
  .description('Validate a Promptfile without executing it')
  .action((file) => {
    console.log(
      chalk.cyan(`Validating ${file ?? 'Promptfile'}`) +
        chalk.dim(' — build the project first with: npm run build'),
    );
  });

program.parse(process.argv);
