/**
 * JSON exporter — renders workflow outputs as a structured JSON document.
 */
import type { StepOutput } from '../executor/index.js';
import type { EvalResult } from '../eval/index.js';

export interface JsonExport {
  version: string;
  timestamp: string;
  outputs: StepOutput[];
  evalResults: EvalResult[];
  summary: {
    steps: number;
    totalTokens: number;
    evalsPassed: number;
    evalsFailed: number;
  };
}

export function toJSON(outputs: StepOutput[], evalResults: EvalResult[]): JsonExport {
  const totalTokens = outputs.reduce((sum, o) => sum + o.tokens.total, 0);
  const evalsPassed = evalResults.filter((r) => r.passed).length;

  return {
    version: '1',
    timestamp: new Date().toISOString(),
    outputs,
    evalResults,
    summary: {
      steps: outputs.length,
      totalTokens,
      evalsPassed,
      evalsFailed: evalResults.length - evalsPassed,
    },
  };
}
