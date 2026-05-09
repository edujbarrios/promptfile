/**
 * `pf run` — execute a Promptfile workflow.
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import chalk from 'chalk';
import { parse } from '../../parser/index.js';
import { execute } from '../../executor/index.js';
import { runEvals } from '../../eval/index.js';
import { runExports } from '../../export/index.js';

export interface RunOptions {
  file: string;
  args: string[];
  stream: boolean;
  quiet: boolean;
  json: boolean;
}

function parseArgPairs(rawArgs: string[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (const raw of rawArgs) {
    const eqIdx = raw.indexOf('=');
    if (eqIdx === -1) {
      result[raw] = 'true';
    } else {
      result[raw.slice(0, eqIdx)] = raw.slice(eqIdx + 1);
    }
  }
  return result;
}

export async function runCommand(options: RunOptions): Promise<void> {
  const filePath = resolve(options.file);

  if (!existsSync(filePath)) {
    console.error(chalk.red(`Error: Promptfile not found: ${filePath}`));
    process.exit(1);
  }

  const source = readFileSync(filePath, 'utf-8');
  let ast;
  try {
    ast = parse(source, filePath);
  } catch (err) {
    console.error(chalk.red(`Parse error: ${(err as Error).message}`));
    process.exit(1);
  }

  const cwd = resolve(filePath, '..');
  const args = parseArgPairs(options.args);
  const silent = options.quiet || options.json;

  if (!silent) {
    const provider = ast.from.provider ?? 'auto';
    console.log();
    console.log(chalk.bold('Promptfile') + chalk.dim(` ${filePath}`));
    console.log(chalk.dim(`  model:   ${ast.from.model} (${provider})`));
    if (ast.contexts.length > 0) {
      console.log(chalk.dim(`  context: ${ast.contexts.map((c) => c.path).join(', ')}`));
    }
    if (ast.tools.length > 0) {
      console.log(chalk.dim(`  tools:   ${ast.tools.map((t) => t.name).join(', ')}`));
    }
    if (ast.memory) {
      console.log(chalk.dim(`  memory:  ${ast.memory.backend}`));
    }
    console.log();
  }

  let result;
  try {
    result = await execute(ast, {
      cwd,
      args,
      stream: options.stream,
      onStepStart: silent
        ? undefined
        : (instruction, idx, total) => {
            console.log(chalk.cyan(`[${idx + 1}/${total}] `) + chalk.bold(instruction));
            console.log(chalk.dim('─'.repeat(60)));
          },
      onChunk: silent ? undefined : (chunk) => process.stdout.write(chunk),
      onStepEnd: silent
        ? undefined
        : (output, _idx, _total) => {
            // In non-streaming mode, print the full response here
            if (!options.stream) {
              process.stdout.write(output.response);
            }
            process.stdout.write('\n\n');
            if (output.tokens.total > 0) {
              console.log(
                chalk.dim(
                  `tokens: ${output.tokens.prompt}↑ ${output.tokens.completion}↓ (${output.tokens.total} total)`,
                ),
              );
            }
          },
    });
  } catch (err) {
    console.error(chalk.red(`\nExecution error: ${(err as Error).message}`));
    if (process.env['DEBUG']) {
      console.error((err as Error).stack);
    }
    process.exit(1);
  }

  // Evals
  let evalResults: Awaited<ReturnType<typeof runEvals>> = [];
  if (ast.evals.length > 0) {
    try {
      evalResults = await runEvals(ast.evals, result.outputs);
    } catch (err) {
      console.error(chalk.yellow(`Eval error: ${(err as Error).message}`));
    }

    if (!silent) {
      console.log(chalk.bold('\nEvaluation:'));
      for (const er of evalResults) {
        const icon = er.passed ? chalk.green('✓') : chalk.red('✗');
        const score =
          er.score !== undefined ? chalk.dim(` (${(er.score * 100).toFixed(0)}%)`) : '';
        console.log(`  ${icon} ${er.check}${score}: ${er.details}`);
      }
      console.log();
    }
  }

  // Exports
  if (ast.exports.length > 0) {
    try {
      const exportResults = await runExports(ast.exports, result.outputs, evalResults, cwd);
      if (!silent) {
        for (const exp of exportResults) {
          if (exp.path) {
            console.log(chalk.green(`Exported → ${exp.path}`));
          } else {
            console.log(chalk.dim(`\n─── ${exp.format.toUpperCase()} OUTPUT ───\n`));
            console.log(exp.content);
          }
        }
      }
    } catch (err) {
      console.error(chalk.red(`Export error: ${(err as Error).message}`));
    }
  }

  if (options.json) {
    console.log(JSON.stringify({ result, evalResults }, null, 2));
  }

  if (!silent) {
    const tokenStr =
      result.totalTokens > 0 ? ` • ${result.totalTokens} tokens` : '';
    console.log(
      chalk.dim(`Done — ${result.outputs.length} step(s)${tokenStr}`),
    );
  }
}
