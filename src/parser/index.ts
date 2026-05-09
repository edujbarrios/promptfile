/**
 * Promptfile parser.
 *
 * Converts a Promptfile source string into a PromptfileAST.
 * Supports:
 *   - All directive keywords
 *   - Triple-quoted multi-line strings (""")
 *   - Inline comments (#)
 *   - Quoted option values
 *   - ${VAR} variable interpolation markers (resolved later by executor)
 */
import { readFileSync } from 'node:fs';
import type {
  Directive,
  PromptfileAST,
  FromDirective,
  SetDirective,
  SystemDirective,
  UserDirective,
  ContextDirective,
  ImageDirective,
  AudioDirective,
  VideoDirective,
  MemoryDirective,
  ToolDirective,
  RunDirective,
  GenerateDirective,
  EvalDirective,
  ExportDirective,
  ArgDirective,
  EnvDirective,
  LabelDirective,
  IncludeDirective,
} from './types.js';
import { ParseError } from './types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Tokenize a string respecting double-quoted and single-quoted segments.
 * Quoted tokens are returned without their surrounding quotes.
 */
function tokenize(line: string): string[] {
  const tokens: string[] = [];
  let current = '';
  let inQuote = false;
  let quoteChar = '';

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuote) {
      if (ch === quoteChar) {
        inQuote = false;
        tokens.push(current);
        current = '';
      } else {
        current += ch;
      }
    } else if (ch === '"' || ch === "'") {
      inQuote = true;
      quoteChar = ch;
    } else if (ch === ' ' || ch === '\t') {
      if (current) {
        tokens.push(current);
        current = '';
      }
    } else {
      current += ch;
    }
  }
  if (current) tokens.push(current);
  return tokens;
}

/**
 * Parse --key value, --key=value, and key=value option pairs from a token list.
 * Returns [positionalTokens, options].
 */
function parseOptions(tokens: string[]): [string[], Record<string, string>] {
  const positional: string[] = [];
  const options: Record<string, string> = {};
  let i = 0;

  while (i < tokens.length) {
    const token = tokens[i];

    if (token.startsWith('--')) {
      const key = token.slice(2);
      if (key.includes('=')) {
        const eqIdx = key.indexOf('=');
        options[key.slice(0, eqIdx)] = key.slice(eqIdx + 1);
      } else if (i + 1 < tokens.length && !tokens[i + 1].startsWith('--')) {
        options[key] = tokens[i + 1];
        i++;
      } else {
        options[key] = 'true';
      }
    } else if (
      token.includes('=') &&
      !token.startsWith('"') &&
      !token.startsWith("'") &&
      !token.startsWith('$')
    ) {
      const eqIdx = token.indexOf('=');
      options[token.slice(0, eqIdx)] = token.slice(eqIdx + 1);
    } else {
      positional.push(token);
    }
    i++;
  }

  return [positional, options];
}

// ---------------------------------------------------------------------------
// Main parser
// ---------------------------------------------------------------------------

export function parse(source: string, _filePath?: string): PromptfileAST {
  const lines = source.split('\n');
  const directives: Directive[] = [];

  let i = 0; // current line index (0-based)

  /**
   * Reads a multi-line triple-quoted block.
   * Called after the opening """ has been detected.
   * `startContent` is everything on the same line after the opening """.
   */
  function readMultiline(startContent: string): string {
    const parts: string[] = [];

    // content on the same line as the opening """
    if (startContent.trim()) {
      parts.push(startContent);
    }

    while (i < lines.length) {
      const raw = lines[i++];
      const trimmed = raw.trimEnd();

      if (trimmed.includes('"""')) {
        // closing """ may be at any position
        const closeIdx = trimmed.indexOf('"""');
        const before = trimmed.slice(0, closeIdx);
        if (before.trim()) parts.push(before);
        break;
      }
      parts.push(raw.trimEnd());
    }

    return parts.join('\n').trim();
  }

  while (i < lines.length) {
    const lineNum = i + 1; // 1-based for error messages
    const rawLine = lines[i++];
    const trimmed = rawLine.trim();

    // Skip blank lines and comments
    if (!trimmed || trimmed.startsWith('#')) continue;

    // Split into keyword + rest
    const spaceIdx = trimmed.search(/\s/);
    let keyword: string;
    let rest: string;

    if (spaceIdx === -1) {
      keyword = trimmed.toUpperCase();
      rest = '';
    } else {
      keyword = trimmed.slice(0, spaceIdx).toUpperCase();
      rest = trimmed.slice(spaceIdx + 1).trim();
    }

    const position = { line: lineNum };

    switch (keyword) {
      // ------------------------------------------------------------------
      case 'FROM': {
        const tokens = tokenize(rest);
        const [positional, options] = parseOptions(tokens);
        if (positional.length === 0)
          throw new ParseError('FROM requires a model name', lineNum);

        const modelSpec = positional[0];
        let model = modelSpec;
        let provider: string | null = null;

        if (modelSpec.includes('/')) {
          const slashIdx = modelSpec.indexOf('/');
          provider = modelSpec.slice(0, slashIdx);
          model = modelSpec.slice(slashIdx + 1);
        }

        directives.push({
          type: 'FROM',
          model,
          provider,
          options,
          position,
        } as FromDirective);
        break;
      }

      // ------------------------------------------------------------------
      case 'SET': {
        const spIdx = rest.search(/\s/);
        if (spIdx === -1) throw new ParseError('SET requires a key and value', lineNum);
        const key = rest.slice(0, spIdx);
        const value = rest.slice(spIdx + 1).trim();
        directives.push({ type: 'SET', key, value, position } as SetDirective);
        break;
      }

      // ------------------------------------------------------------------
      case 'SYSTEM': {
        let text: string;
        if (rest.startsWith('"""')) {
          const afterOpen = rest.slice(3);
          const closeIdx = afterOpen.indexOf('"""');
          if (closeIdx !== -1) {
            // Single-line triple-quoted
            text = afterOpen.slice(0, closeIdx).trim();
          } else {
            text = readMultiline(afterOpen);
          }
        } else {
          text = rest;
        }
        directives.push({ type: 'SYSTEM', text, position } as SystemDirective);
        break;
      }

      // ------------------------------------------------------------------
      case 'USER': {
        let text: string;
        if (rest.startsWith('"""')) {
          const afterOpen = rest.slice(3);
          const closeIdx = afterOpen.indexOf('"""');
          if (closeIdx !== -1) {
            text = afterOpen.slice(0, closeIdx).trim();
          } else {
            text = readMultiline(afterOpen);
          }
        } else {
          text = rest;
        }
        directives.push({ type: 'USER', text, position } as UserDirective);
        break;
      }

      // ------------------------------------------------------------------
      case 'CONTEXT': {
        const tokens = tokenize(rest);
        const [positional, options] = parseOptions(tokens);
        if (positional.length === 0)
          throw new ParseError('CONTEXT requires a path', lineNum);

        const exclude = options['exclude'] ? options['exclude'].split(',') : [];
        directives.push({
          type: 'CONTEXT',
          path: positional[0],
          glob: options['glob'] ?? null,
          exclude,
          position,
        } as ContextDirective);
        break;
      }

      // ------------------------------------------------------------------
      case 'IMAGE': {
        const tokens = tokenize(rest);
        const [positional, options] = parseOptions(tokens);
        if (positional.length === 0)
          throw new ParseError('IMAGE requires a path or URL', lineNum);

        const rawDetail = options['detail'] ?? 'auto';
        if (rawDetail !== 'auto' && rawDetail !== 'low' && rawDetail !== 'high') {
          throw new ParseError(
            `IMAGE --detail must be "auto", "low", or "high"`,
            lineNum,
          );
        }
        directives.push({
          type: 'IMAGE',
          src: positional[0],
          detail: rawDetail,
          position,
        } as ImageDirective);
        break;
      }

      // ------------------------------------------------------------------
      case 'AUDIO': {
        const tokens = tokenize(rest);
        const [positional, options] = parseOptions(tokens);
        if (positional.length === 0)
          throw new ParseError('AUDIO requires a path or URL', lineNum);

        const rawFmt = (options['format'] ?? 'mp3') as AudioDirective['format'];
        const validFmts: AudioDirective['format'][] = ['mp3', 'wav', 'ogg', 'flac', 'webm'];
        if (!validFmts.includes(rawFmt)) {
          throw new ParseError(
            `AUDIO --format must be one of: ${validFmts.join(', ')}`,
            lineNum,
          );
        }
        directives.push({
          type: 'AUDIO',
          src: positional[0],
          format: rawFmt,
          position,
        } as AudioDirective);
        break;
      }

      // ------------------------------------------------------------------
      case 'VIDEO': {
        const tokens = tokenize(rest);
        const [positional] = parseOptions(tokens);
        if (positional.length === 0)
          throw new ParseError('VIDEO requires a path or URL', lineNum);

        directives.push({
          type: 'VIDEO',
          src: positional[0],
          position,
        } as VideoDirective);
        break;
      }

      // ------------------------------------------------------------------
      case 'MEMORY': {
        const tokens = tokenize(rest);
        const [positional, options] = parseOptions(tokens);
        if (positional.length === 0)
          throw new ParseError('MEMORY requires a backend name', lineNum);

        directives.push({
          type: 'MEMORY',
          backend: positional[0],
          name: positional[1] ?? options['name'] ?? null,
          options,
          position,
        } as MemoryDirective);
        break;
      }

      // ------------------------------------------------------------------
      case 'TOOL': {
        const tokens = tokenize(rest);
        const [positional, options] = parseOptions(tokens);
        if (positional.length === 0)
          throw new ParseError('TOOL requires a name', lineNum);

        directives.push({
          type: 'TOOL',
          name: positional[0],
          options,
          position,
        } as ToolDirective);
        break;
      }

      // ------------------------------------------------------------------
      case 'RUN': {
        if (!rest) throw new ParseError('RUN requires an instruction', lineNum);
        directives.push({ type: 'RUN', instruction: rest, position } as RunDirective);
        break;
      }

      // ------------------------------------------------------------------
      case 'GENERATE': {
        const tokens = tokenize(rest);
        const [positional, options] = parseOptions(tokens);
        if (positional.length < 1)
          throw new ParseError('GENERATE requires a modality (image | audio | video)', lineNum);

        const modality = positional[0].toLowerCase() as GenerateDirective['modality'];
        if (modality !== 'image' && modality !== 'audio' && modality !== 'video') {
          throw new ParseError(
            `GENERATE modality must be "image", "audio", or "video"`,
            lineNum,
          );
        }

        // Remaining positional tokens form the prompt
        let prompt = positional.slice(1).join(' ');
        if (!prompt && options['prompt']) {
          prompt = options['prompt'];
        }
        if (!prompt) {
          throw new ParseError('GENERATE requires a prompt after the modality', lineNum);
        }

        directives.push({
          type: 'GENERATE',
          modality,
          prompt,
          output: options['output'] ?? null,
          options,
          position,
        } as GenerateDirective);
        break;
      }

      // ------------------------------------------------------------------
      case 'EVAL': {
        const tokens = tokenize(rest);
        const [positional, options] = parseOptions(tokens);
        if (positional.length === 0)
          throw new ParseError('EVAL requires a check name', lineNum);

        directives.push({
          type: 'EVAL',
          check: positional[0],
          options,
          position,
        } as EvalDirective);
        break;
      }

      // ------------------------------------------------------------------
      case 'EXPORT': {
        const tokens = tokenize(rest);
        const [positional, options] = parseOptions(tokens);
        if (positional.length === 0)
          throw new ParseError('EXPORT requires a format', lineNum);

        directives.push({
          type: 'EXPORT',
          format: positional[0],
          path: positional[1] ?? options['path'] ?? null,
          position,
        } as ExportDirective);
        break;
      }

      // ------------------------------------------------------------------
      case 'ARG': {
        if (!rest) throw new ParseError('ARG requires a name', lineNum);
        const eqIdx = rest.indexOf('=');
        directives.push({
          type: 'ARG',
          name: eqIdx === -1 ? rest : rest.slice(0, eqIdx),
          defaultValue: eqIdx === -1 ? null : rest.slice(eqIdx + 1),
          position,
        } as ArgDirective);
        break;
      }

      // ------------------------------------------------------------------
      case 'ENV': {
        const eqIdx = rest.indexOf('=');
        if (eqIdx === -1) throw new ParseError('ENV requires key=value format', lineNum);
        directives.push({
          type: 'ENV',
          key: rest.slice(0, eqIdx),
          value: rest.slice(eqIdx + 1),
          position,
        } as EnvDirective);
        break;
      }

      // ------------------------------------------------------------------
      case 'LABEL': {
        const eqIdx = rest.indexOf('=');
        if (eqIdx === -1) throw new ParseError('LABEL requires key=value format', lineNum);
        directives.push({
          type: 'LABEL',
          key: rest.slice(0, eqIdx),
          value: rest.slice(eqIdx + 1),
          position,
        } as LabelDirective);
        break;
      }

      // ------------------------------------------------------------------
      case 'INCLUDE': {
        if (!rest) throw new ParseError('INCLUDE requires a path', lineNum);
        directives.push({ type: 'INCLUDE', path: rest, position } as IncludeDirective);
        break;
      }

      // ------------------------------------------------------------------
      default:
        throw new ParseError(`Unknown directive: "${keyword}"`, lineNum);
    }
  }

  // Semantic validation: FROM is required
  const fromDirective = directives.find((d): d is FromDirective => d.type === 'FROM');
  if (!fromDirective) {
    throw new ParseError('Promptfile must start with a FROM directive', 0);
  }

  return {
    directives,
    from: fromDirective,
    sets: directives.filter((d): d is SetDirective => d.type === 'SET'),
    system: directives.find((d): d is SystemDirective => d.type === 'SYSTEM') ?? null,
    user: directives.find((d): d is UserDirective => d.type === 'USER') ?? null,
    contexts: directives.filter((d): d is ContextDirective => d.type === 'CONTEXT'),
    images: directives.filter((d): d is ImageDirective => d.type === 'IMAGE'),
    audios: directives.filter((d): d is AudioDirective => d.type === 'AUDIO'),
    videos: directives.filter((d): d is VideoDirective => d.type === 'VIDEO'),
    memory: directives.find((d): d is MemoryDirective => d.type === 'MEMORY') ?? null,
    tools: directives.filter((d): d is ToolDirective => d.type === 'TOOL'),
    runs: directives.filter((d): d is RunDirective => d.type === 'RUN'),
    generates: directives.filter((d): d is GenerateDirective => d.type === 'GENERATE'),
    evals: directives.filter((d): d is EvalDirective => d.type === 'EVAL'),
    exports: directives.filter((d): d is ExportDirective => d.type === 'EXPORT'),
    args: directives.filter((d): d is ArgDirective => d.type === 'ARG'),
    envs: directives.filter((d): d is EnvDirective => d.type === 'ENV'),
    labels: directives.filter((d): d is LabelDirective => d.type === 'LABEL'),
    includes: directives.filter((d): d is IncludeDirective => d.type === 'INCLUDE'),
  };
}

export function parseFile(filePath: string): PromptfileAST {
  const source = readFileSync(filePath, 'utf-8');
  return parse(source, filePath);
}

export { ParseError } from './types.js';
export type {
  PromptfileAST,
  Directive,
  ImageDirective,
  AudioDirective,
  VideoDirective,
  GenerateDirective,
} from './types.js';
