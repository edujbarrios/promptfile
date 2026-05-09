# Promptfile

> **Dockerfile for AI workflows** — define, run, and share reproducible AI pipelines with a single declarative file.

```promptfile
FROM qwen3:32b

SYSTEM """
You are a senior software architect.
"""

CONTEXT ./src

MEMORY local

TOOL github
TOOL filesystem

RUN summarize architecture
RUN generate ADR

EVAL consistency
EXPORT markdown
```

---

## What is Promptfile?

Promptfile is to AI workflows what Dockerfile is to containers.

It's a **developer-first standard** for defining reproducible AI pipelines:

- 📄 **One file** — model, prompt, context, tools, memory, evals, and exports
- 🔁 **Reproducible** — same file, same output, every time
- 🔌 **Composable** — chain steps, include shared base configs, parameterize with ARGs
- 🛠️ **CLI-first** — `pf run`, `pf validate`, `pf init`
- 🌐 **Multi-provider** — OpenAI, Ollama (local), and more coming

This is **not** another LangChain clone, chatbot app, or GUI builder. It's infrastructure — opinionated, minimal, and unix-philosophy inspired.

---

## Installation

```bash
npm install -g promptfile
```

Or run without installing:

```bash
npx promptfile init
npx promptfile run
```

**Requirements:** Node.js 18+

---

## Quick Start

### 1. Initialize a Promptfile

```bash
pf init
# or choose a template:
pf init architect
pf init reviewer
pf init summarizer
```

### 2. Edit your Promptfile

```promptfile
FROM openai/gpt-4o

SYSTEM """
You are a helpful assistant.
"""

RUN explain the concept of event-driven architecture in 3 bullet points
```

### 3. Run it

```bash
export OPENAI_API_KEY=sk-...
pf run
```

### 4. Validate without running

```bash
pf validate
```

---

## Promptfile Reference

### `FROM` — Model Selection

```promptfile
FROM gpt-4o                  # OpenAI (auto-detected)
FROM openai/gpt-4o           # OpenAI (explicit)
FROM qwen3:32b               # Ollama local model (auto-detected)
FROM ollama/llama3           # Ollama (explicit)
```

### `SET` — Model Parameters

```promptfile
SET temperature 0.2
SET max_tokens 4096
SET top_p 0.9
```

### `SYSTEM` — System Prompt

```promptfile
SYSTEM """
You are a senior engineer. Be concise and precise.
"""
```

### `CONTEXT` — File Injection

Inject local files or directories into the model's context:

```promptfile
CONTEXT ./src
CONTEXT ./docs --glob "**/*.md"
CONTEXT README.md
```

### `TOOL` — Tool Registration

Give the model access to tools:

```promptfile
TOOL filesystem    # read files & directories
TOOL github        # read GitHub issues, PRs, files (requires GITHUB_TOKEN)
```

### `MEMORY` — Persistent Memory

```promptfile
MEMORY local              # ~/.promptfile/memory/default.json
MEMORY local myproject    # named memory store
```

### `RUN` — Workflow Steps

Each `RUN` adds a user message and collects the response. Steps share full conversation history.

```promptfile
RUN analyze the codebase architecture
RUN identify top security risks
RUN generate a remediation plan
```

### `EVAL` — Output Quality Checks

```promptfile
EVAL consistency    # vocabulary overlap across outputs
EVAL non-empty      # all outputs have content
EVAL length --min 200
```

### `EXPORT` — Output Format

```promptfile
EXPORT markdown ./output/result.md
EXPORT json ./output/result.json
EXPORT markdown   # stdout
```

### `ARG` — Parameterization

```promptfile
ARG target=./src
ARG model=gpt-4o

FROM ${model}
CONTEXT ${target}
```

```bash
pf run --arg target=./lib --arg model=gpt-4-turbo
```

### `LABEL` — Metadata

```promptfile
LABEL version=1.0
LABEL author=alice
LABEL workflow=code-review
```

### `INCLUDE` — Reusable Base Configs

```promptfile
INCLUDE ./base.promptfile
```

---

## Full Example

```promptfile
# Automated code review

FROM openai/gpt-4o

LABEL version=1.0
LABEL workflow=code-review

SET temperature 0.2

SYSTEM """
You are an expert code reviewer. Your reviews are specific, actionable,
and grounded in the actual code. Always cite specific locations.
"""

ARG target=./src

CONTEXT ${target}
TOOL filesystem

RUN identify bugs and error handling issues
RUN identify security vulnerabilities
RUN suggest the top 3 refactoring opportunities
RUN give an overall quality score from 1-10 with justification

EVAL consistency
EVAL non-empty

EXPORT markdown ./output/review.md
EXPORT json ./output/review.json
```

```bash
pf run --arg target=./src
```

---

## CLI Reference

```
pf run [file]          Execute a Promptfile (default: ./Promptfile)
  --stream             Stream output in real-time (default: true)
  --no-stream          Print when complete
  -q, --quiet          Suppress progress output
  --json               Output results as JSON
  -a, --arg key=val    Pass ARG values (repeatable)

pf validate [file]     Validate syntax and semantics without running
pf lint [file]         Alias for validate

pf init [template]     Scaffold a new Promptfile
  Templates: basic | architect | summarizer | reviewer

pf parse [file]        Print the parsed AST as JSON (debug)
```

---

## Environment Variables

| Variable | Description |
|----------|-------------|
| `OPENAI_API_KEY` | OpenAI API key |
| `OLLAMA_HOST` | Ollama base URL (default: `http://localhost:11434`) |
| `GITHUB_TOKEN` | GitHub token for `TOOL github` |
| `DEBUG` | Enable verbose error output |

---

## Using with Ollama (local models)

1. Install [Ollama](https://ollama.ai)
2. Pull a model: `ollama pull qwen3:32b`
3. Write your Promptfile:

```promptfile
FROM qwen3:32b

SYSTEM """
You are a helpful assistant.
"""

RUN explain the CAP theorem in simple terms
```

```bash
pf run
```

No API key needed. Runs entirely locally.

---

## Examples

See the [`examples/`](./examples) directory:

| File | Description |
|------|-------------|
| `architect.promptfile` | Architecture analysis + ADR generation |
| `summarizer.promptfile` | Technical documentation summarizer |
| `reviewer.promptfile` | Automated code review |

---

## Specification

The full Promptfile format specification is in [`docs/spec.md`](./docs/spec.md).

---

## Roadmap

- [ ] `INCLUDE` directive (base config inheritance)
- [ ] Anthropic provider (`anthropic/<model>`)
- [ ] Mistral, Groq providers
- [ ] `TOOL web` (HTTP fetch)
- [ ] `TOOL shell` (sandboxed shell commands)
- [ ] `MEMORY redis` backend
- [ ] `MEMORY vector` backend (semantic search)
- [ ] `EVAL relevance` check (LLM-as-judge)
- [ ] Parallel RUN execution (`RUN PARALLEL`)
- [ ] Watch mode (`pf run --watch`)
- [ ] Registry for sharing Promptfiles

---

## Contributing

Contributions are welcome! Please open an issue first to discuss significant changes.

```bash
git clone https://github.com/edujbarrios/promptfile
cd promptfile
npm install
npm run build
node dist/index.js --help
```

---

## License

MIT © Eduardo Barrios
