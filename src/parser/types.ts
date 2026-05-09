/**
 * AST types for the Promptfile format.
 *
 * A Promptfile is parsed into a PromptfileAST, which contains typed directive
 * nodes. Each directive corresponds to a top-level keyword in the file.
 */

export type DirectiveType =
  | 'FROM'
  | 'SET'
  | 'SYSTEM'
  | 'USER'
  | 'CONTEXT'
  | 'MEMORY'
  | 'TOOL'
  | 'RUN'
  | 'EVAL'
  | 'EXPORT'
  | 'ARG'
  | 'ENV'
  | 'LABEL'
  | 'INCLUDE';

export interface Position {
  line: number;
}

export interface BaseDirective {
  type: DirectiveType;
  position: Position;
}

/** FROM <model> | FROM <provider>/<model> [key=value ...] */
export interface FromDirective extends BaseDirective {
  type: 'FROM';
  model: string;
  provider: string | null;
  options: Record<string, string>;
}

/** SET <key> <value> */
export interface SetDirective extends BaseDirective {
  type: 'SET';
  key: string;
  value: string;
}

/** SYSTEM """...""" or SYSTEM single line */
export interface SystemDirective extends BaseDirective {
  type: 'SYSTEM';
  text: string;
}

/** USER """...""" or USER single line */
export interface UserDirective extends BaseDirective {
  type: 'USER';
  text: string;
}

/** CONTEXT <path> [--glob <pattern>] [--exclude <dirs>] */
export interface ContextDirective extends BaseDirective {
  type: 'CONTEXT';
  path: string;
  glob: string | null;
  exclude: string[];
}

/** MEMORY <backend> [<name>] [options] */
export interface MemoryDirective extends BaseDirective {
  type: 'MEMORY';
  backend: string;
  name: string | null;
  options: Record<string, string>;
}

/** TOOL <name> [options] */
export interface ToolDirective extends BaseDirective {
  type: 'TOOL';
  name: string;
  options: Record<string, string>;
}

/** RUN <instruction> */
export interface RunDirective extends BaseDirective {
  type: 'RUN';
  instruction: string;
}

/** EVAL <check> [options] */
export interface EvalDirective extends BaseDirective {
  type: 'EVAL';
  check: string;
  options: Record<string, string>;
}

/** EXPORT <format> [<path>] */
export interface ExportDirective extends BaseDirective {
  type: 'EXPORT';
  format: string;
  path: string | null;
}

/** ARG <name>[=<default>] */
export interface ArgDirective extends BaseDirective {
  type: 'ARG';
  name: string;
  defaultValue: string | null;
}

/** ENV <KEY>=<value> */
export interface EnvDirective extends BaseDirective {
  type: 'ENV';
  key: string;
  value: string;
}

/** LABEL <key>=<value> */
export interface LabelDirective extends BaseDirective {
  type: 'LABEL';
  key: string;
  value: string;
}

/** INCLUDE <path> */
export interface IncludeDirective extends BaseDirective {
  type: 'INCLUDE';
  path: string;
}

export type Directive =
  | FromDirective
  | SetDirective
  | SystemDirective
  | UserDirective
  | ContextDirective
  | MemoryDirective
  | ToolDirective
  | RunDirective
  | EvalDirective
  | ExportDirective
  | ArgDirective
  | EnvDirective
  | LabelDirective
  | IncludeDirective;

/** The complete parsed representation of a Promptfile. */
export interface PromptfileAST {
  /** All directives in source order. */
  directives: Directive[];
  /** The FROM directive (always present). */
  from: FromDirective;
  sets: SetDirective[];
  system: SystemDirective | null;
  user: UserDirective | null;
  contexts: ContextDirective[];
  memory: MemoryDirective | null;
  tools: ToolDirective[];
  runs: RunDirective[];
  evals: EvalDirective[];
  exports: ExportDirective[];
  args: ArgDirective[];
  envs: EnvDirective[];
  labels: LabelDirective[];
  includes: IncludeDirective[];
}

export class ParseError extends Error {
  constructor(
    message: string,
    public readonly line: number,
  ) {
    super(line > 0 ? `Parse error at line ${line}: ${message}` : `Parse error: ${message}`);
    this.name = 'ParseError';
  }
}
