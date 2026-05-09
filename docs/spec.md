# Promptfile Specification v0.1
<!-- Dockerfile for AI workflows -->

## Overview

A **Promptfile** defines a reproducible, self-contained AI workflow. It specifies the model, system prompt, context, tools, memory, workflow steps, evaluation criteria, and output format — all in a single declarative file.

Promptfiles are executed by the `pf` CLI.

---

## File Format

- File name: `Promptfile` (no extension) or any `*.promptfile` file
- Encoding: UTF-8
- Line endings: LF or CRLF
- Comments: lines starting with `#`
- Blank lines are ignored
- Directive keywords are **case-insensitive** (convention: UPPERCASE)

### Multi-line values

Use triple double-quotes to span multiple lines:

```
SYSTEM """
You are a helpful assistant.
Be concise and accurate.
"""
```

### Variable interpolation

Use `${VAR}` or `$VAR` to inject ARG values or environment variables:

```
ARG target=./src
CONTEXT ${target}
```

---

## Directives Reference

### `FROM`

**Required.** Specifies the AI model to use.

```
FROM <model>
FROM <provider>/<model> [options...]
```

| Syntax | Provider | Example |
|--------|----------|---------|
| `FROM gpt-4o` | OpenAI (auto-detected) | GPT-4o via OpenAI |
| `FROM openai/gpt-4o` | OpenAI (explicit) | GPT-4o via OpenAI |
| `FROM qwen3:32b` | Ollama (auto-detected) | Qwen3 32B via local Ollama |
| `FROM ollama/llama3` | Ollama (explicit) | Llama 3 via local Ollama |

Options are passed as `key=value` pairs after the model name:

```
FROM openai/gpt-4o apiKey=sk-... baseURL=https://proxy.example.com/v1
```

---

### `SET`

Set model inference parameters.

```
SET <key> <value>
```

| Key | Description | Default |
|-----|-------------|---------|
| `temperature` | Sampling temperature | Model default |
| `max_tokens` | Maximum tokens to generate | Model default |
| `top_p` | Nucleus sampling threshold | Model default |

```
SET temperature 0.2
SET max_tokens 4096
```

---

### `SYSTEM`

Defines the system prompt sent to the model.

```
SYSTEM """
You are a senior engineer...
"""
```

Single-line form:

```
SYSTEM You are a helpful assistant.
```

---

### `USER`

Defines an initial user message (before any RUN steps).

```
USER Analyze the following codebase.
```

---

### `CONTEXT`

Injects file or directory contents into the system prompt as a structured XML block.

```
CONTEXT <path> [--glob <pattern>] [--exclude <dirs>]
```

```
CONTEXT ./src
CONTEXT ./docs --glob "**/*.md"
CONTEXT ./src --exclude node_modules,dist
CONTEXT README.md
```

Files are formatted as fenced code blocks inside `<file path="...">` tags. Binary files, `node_modules`, `.git`, and files exceeding 512 KB are automatically excluded. Total context is capped at 4 MB.

---

### `MEMORY`

Configures a persistent memory backend. Each RUN step is stored and can be recalled in future runs.

```
MEMORY <backend> [<name>] [options...]
```

| Backend | Description |
|---------|-------------|
| `local` | JSON file under `~/.promptfile/memory/<name>.json` |

```
MEMORY local
MEMORY local myproject
MEMORY local --name myproject
```

---

### `TOOL`

Registers a tool the model can call during generation.

```
TOOL <name> [options...]
```

| Tool | Description |
|------|-------------|
| `filesystem` | Read files and list directories |
| `github` | Read GitHub issues, PRs, and files (requires `GITHUB_TOKEN`) |

```
TOOL filesystem
TOOL github --repo owner/repo
```

---

### `RUN`

Defines a workflow step. Each `RUN` adds a user message and collects the model response.

```
RUN <instruction>
```

Steps are executed sequentially. The full conversation history (including prior responses) is passed to the model for each step.

```
RUN analyze the codebase architecture
RUN identify top security risks
RUN generate a remediation plan
```

---

### `EVAL`

Runs a quality check over all RUN outputs after the workflow completes.

```
EVAL <check> [options...]
```

| Check | Description |
|-------|-------------|
| `consistency` | Vocabulary overlap across outputs (detects contradictions) |
| `non-empty` | Verifies all outputs have content |
| `length` | Verifies minimum character count per output |

```
EVAL consistency
EVAL non-empty
EVAL length --min 200
```

---

### `EXPORT`

Writes workflow outputs to a file or stdout.

```
EXPORT <format> [<path>]
```

| Format | Description |
|--------|-------------|
| `markdown` / `md` | Structured Markdown document |
| `json` | Machine-readable JSON |

```
EXPORT markdown ./output/result.md
EXPORT json ./output/result.json
EXPORT markdown   # prints to stdout
```

---

### `ARG`

Declares a build-time parameter. Can have an optional default value.

```
ARG <name>[=<default>]
```

```
ARG model=gpt-4o
ARG target
```

Pass values at runtime with `pf run --arg name=value`.

---

### `ENV`

Injects an environment variable value into the workflow context.

```
ENV <KEY>=<value>
```

```
ENV PROJECT_NAME=myapp
```

---

### `LABEL`

Attaches metadata to the Promptfile.

```
LABEL <key>=<value>
```

```
LABEL version=1.0
LABEL author=alice
LABEL workflow=code-review
```

---

### `INCLUDE`

Includes directives from another Promptfile (useful for shared base configurations).

```
INCLUDE <path>
```

```
INCLUDE ./base.promptfile
```

---

## Complete Example

```promptfile
# Full-featured code review workflow

FROM openai/gpt-4o

LABEL version=1.0
LABEL workflow=code-review

SET temperature 0.2
SET max_tokens 4096

SYSTEM """
You are an expert code reviewer with 15+ years of industry experience.
Your reviews are specific, actionable, and grounded in the actual code.
"""

ARG target=./src

CONTEXT ${target}
TOOL filesystem

RUN identify bugs and error handling issues
RUN identify security vulnerabilities
RUN suggest the top 3 refactoring opportunities
RUN give an overall quality score from 1-10

EVAL consistency
EVAL non-empty

EXPORT markdown ./output/review.md
EXPORT json ./output/review.json
```

---

## Environment Variables

| Variable | Description |
|----------|-------------|
| `OPENAI_API_KEY` | OpenAI API key (required for OpenAI models) |
| `OLLAMA_HOST` | Ollama base URL (default: `http://localhost:11434`) |
| `GITHUB_TOKEN` | GitHub token (required for `TOOL github`) |
| `DEBUG` | Set to any value to enable verbose error output |

---

## Execution Model

1. Parse the Promptfile into an AST
2. Resolve `ARG` values (CLI `--arg` flags override defaults)
3. Instantiate the model adapter (`FROM`)
4. Read and format file context (`CONTEXT`)
5. Initialize memory (`MEMORY`)
6. Register tools (`TOOL`)
7. Build the initial message list (`SYSTEM`, `USER`)
8. For each `RUN` step:
   - Append the instruction as a user message
   - Call the model (with tools if registered)
   - Append the response as an assistant message
   - Persist to memory if configured
9. Run `EVAL` checks over all outputs
10. Write `EXPORT` files

---

## Provider Support Matrix

| Provider | Status | Notes |
|----------|--------|-------|
| OpenAI | ✅ Full | `OPENAI_API_KEY` required |
| Ollama | ✅ Full | Local server at `OLLAMA_HOST` |
| Anthropic | 🔜 Planned | `anthropic/<model>` |
| Mistral | 🔜 Planned | `mistral/<model>` |
| Groq | 🔜 Planned | `groq/<model>` |

---

## Tool Support Matrix

| Tool | Status | Notes |
|------|--------|-------|
| `filesystem` | ✅ Full | Read-only; respects size limits |
| `github` | ✅ Full | `GITHUB_TOKEN` required |
| `web` | 🔜 Planned | HTTP fetch |
| `shell` | 🔜 Planned | Run shell commands (sandboxed) |
| `database` | 🔜 Planned | SQL query support |

---

## Memory Backend Support Matrix

| Backend | Status | Notes |
|---------|--------|-------|
| `local` | ✅ Full | `~/.promptfile/memory/<name>.json` |
| `redis` | 🔜 Planned | Redis key-value store |
| `vector` | 🔜 Planned | Vector similarity search |

---

*Promptfile v0.1 — [github.com/edujbarrios/promptfile](https://github.com/edujbarrios/promptfile)*
