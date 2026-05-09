/**
 * `pf validate` — parse and validate a Promptfile without running it.
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import chalk from 'chalk';
import { parse } from '../../parser/index.js';
import type { PromptfileAST } from '../../parser/types.js';
import { KNOWN_TOOLS } from '../../tools/index.js';
import { KNOWN_CHECKS } from '../../eval/index.js';
import { KNOWN_FORMATS } from '../../export/index.js';

interface ValidationIssue {
  level: 'error' | 'warning' | 'info';
  message: string;
  line?: number;
}

function lint(ast: PromptfileAST): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (ast.runs.length === 0) {
    issues.push({
      level: 'warning',
      message: 'No RUN directives — workflow will produce no output',
    });
  }

  if (!ast.system) {
    issues.push({
      level: 'info',
      message: 'No SYSTEM directive — model will use its default system prompt',
    });
  }

  for (const arg of ast.args) {
    if (arg.defaultValue === null) {
      issues.push({
        level: 'info',
        message: `ARG "${arg.name}" has no default — must be provided via --arg at runtime`,
        line: arg.position.line,
      });
    }
  }

  for (const tool of ast.tools) {
    if (!KNOWN_TOOLS.includes(tool.name)) {
      issues.push({
        level: 'warning',
        message: `Unknown tool: "${tool.name}". Known tools: ${KNOWN_TOOLS.join(', ')}`,
        line: tool.position.line,
      });
    }
  }

  const knownBackends = ['local'];
  if (ast.memory && !knownBackends.includes(ast.memory.backend)) {
    issues.push({
      level: 'warning',
      message: `Unknown memory backend: "${ast.memory.backend}". Known backends: ${knownBackends.join(', ')}`,
      line: ast.memory.position.line,
    });
  }

  for (const ev of ast.evals) {
    if (!KNOWN_CHECKS.includes(ev.check)) {
      issues.push({
        level: 'warning',
        message: `Unknown eval check: "${ev.check}". Known checks: ${KNOWN_CHECKS.join(', ')}`,
        line: ev.position.line,
      });
    }
  }

  for (const exp of ast.exports) {
    if (!KNOWN_FORMATS.includes(exp.format.toLowerCase())) {
      issues.push({
        level: 'warning',
        message: `Unknown export format: "${exp.format}". Known formats: ${KNOWN_FORMATS.join(', ')}`,
        line: exp.position.line,
      });
    }
  }

  return issues;
}

export async function validateCommand(filePath: string): Promise<void> {
  const absPath = resolve(filePath);

  if (!existsSync(absPath)) {
    console.error(chalk.red(`Error: File not found: ${absPath}`));
    process.exit(1);
  }

  const source = readFileSync(absPath, 'utf-8');
  let ast: PromptfileAST;

  try {
    ast = parse(source, absPath);
    console.log(chalk.green('✓') + chalk.dim(' syntax OK'));
  } catch (err) {
    console.error(chalk.red('✗') + ` Syntax error: ${(err as Error).message}`);
    process.exit(1);
  }

  const issues = lint(ast);
  const errors = issues.filter((i) => i.level === 'error');

  for (const issue of issues) {
    const lineStr = issue.line ? chalk.dim(` (line ${issue.line})`) : '';
    switch (issue.level) {
      case 'error':
        console.log(chalk.red('✗') + ` Error${lineStr}: ${issue.message}`);
        break;
      case 'warning':
        console.log(chalk.yellow('⚠') + ` Warning${lineStr}: ${issue.message}`);
        break;
      case 'info':
        console.log(chalk.blue('ℹ') + chalk.dim(` ${issue.message}`));
        break;
    }
  }

  if (issues.length === 0) {
    console.log(chalk.green('✓') + chalk.dim(' no issues found'));
  }

  console.log();
  console.log(chalk.bold('Summary'));
  console.log(`  FROM    ${ast.from.model}  (provider: ${ast.from.provider ?? 'auto'})`);
  console.log(`  RUN     ${ast.runs.length} step(s)`);
  console.log(`  CONTEXT ${ast.contexts.length} source(s): ${ast.contexts.map((c) => c.path).join(', ') || 'none'}`);
  console.log(`  TOOL    ${ast.tools.map((t) => t.name).join(', ') || 'none'}`);
  console.log(`  MEMORY  ${ast.memory?.backend ?? 'none'}`);
  console.log(`  EVAL    ${ast.evals.map((e) => e.check).join(', ') || 'none'}`);
  console.log(`  EXPORT  ${ast.exports.map((e) => e.format).join(', ') || 'none'}`);

  if (errors.length > 0) {
    process.exit(1);
  }
}
