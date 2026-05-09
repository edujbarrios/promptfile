/**
 * Eval framework — runs quality checks over workflow outputs.
 *
 * Built-in checks:
 *   consistency — vocabulary overlap across outputs
 *   non-empty   — all outputs have content
 *   length      — minimum character count per output
 */
import type { StepOutput } from '../executor/index.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EvalResult {
  check: string;
  passed: boolean;
  score?: number;
  details: string;
}

export interface EvalCheck {
  readonly name: string;
  run(outputs: StepOutput[], options?: Record<string, string>): Promise<EvalResult>;
}

// ---------------------------------------------------------------------------
// Built-in checks
// ---------------------------------------------------------------------------

class ConsistencyCheck implements EvalCheck {
  readonly name = 'consistency';

  async run(outputs: StepOutput[]): Promise<EvalResult> {
    if (outputs.length < 2) {
      return {
        check: this.name,
        passed: true,
        score: 1.0,
        details: 'Only one output — consistency check not applicable',
      };
    }

    const words = (text: string): Set<string> =>
      new Set(
        text
          .toLowerCase()
          .split(/\W+/)
          .filter((w) => w.length > 4),
      );

    const firstWords = words(outputs[0].response);
    let totalOverlap = 0;

    for (let i = 1; i < outputs.length; i++) {
      const other = words(outputs[i].response);
      const shared = [...firstWords].filter((w) => other.has(w)).length;
      totalOverlap += shared / Math.max(firstWords.size, 1);
    }

    const avgOverlap = totalOverlap / (outputs.length - 1);
    const passed = avgOverlap > 0.05;
    const score = Math.min(1, avgOverlap * 5);

    return {
      check: this.name,
      passed,
      score,
      details: passed
        ? `Outputs appear consistent (vocabulary overlap: ${(avgOverlap * 100).toFixed(1)}%)`
        : `Outputs may be inconsistent (vocabulary overlap: ${(avgOverlap * 100).toFixed(1)}%)`,
    };
  }
}

class NonEmptyCheck implements EvalCheck {
  readonly name = 'non-empty';

  async run(outputs: StepOutput[]): Promise<EvalResult> {
    const empty = outputs.filter((o) => !o.response.trim());
    const passed = empty.length === 0;
    return {
      check: this.name,
      passed,
      score: (outputs.length - empty.length) / Math.max(outputs.length, 1),
      details: passed
        ? 'All outputs have content'
        : `${empty.length} output(s) are empty`,
    };
  }
}

class LengthCheck implements EvalCheck {
  readonly name = 'length';

  async run(outputs: StepOutput[], options?: Record<string, string>): Promise<EvalResult> {
    const min = parseInt(options?.['min'] ?? '50', 10);
    const short = outputs.filter((o) => o.response.length < min);
    const passed = short.length === 0;
    return {
      check: this.name,
      passed,
      score: (outputs.length - short.length) / Math.max(outputs.length, 1),
      details: passed
        ? `All outputs meet minimum length (≥${min} chars)`
        : `${short.length} output(s) shorter than ${min} chars`,
    };
  }
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

const CHECKS: Record<string, EvalCheck> = {
  consistency: new ConsistencyCheck(),
  'non-empty': new NonEmptyCheck(),
  length: new LengthCheck(),
};

export const KNOWN_CHECKS = Object.keys(CHECKS);

export function resolveCheck(name: string): EvalCheck {
  const check = CHECKS[name];
  if (!check) {
    throw new Error(
      `Unknown eval check: "${name}". Available checks: ${KNOWN_CHECKS.join(', ')}`,
    );
  }
  return check;
}

export async function runEvals(
  evals: Array<{ check: string; options: Record<string, string> }>,
  outputs: StepOutput[],
): Promise<EvalResult[]> {
  const results: EvalResult[] = [];
  for (const directive of evals) {
    const check = resolveCheck(directive.check);
    results.push(await check.run(outputs, directive.options));
  }
  return results;
}
