# Promptfile Specification v0.2
<!-- Dockerfile for AI workflows — text, vision, audio, and video -->

## Overview

A **Promptfile** defines a reproducible, self-contained AI workflow. It specifies the model, system prompt, context, multimodal inputs, tools, memory, workflow steps, generation tasks, evaluation criteria, and output format — all in a single declarative file.

Promptfiles support all AI modalities: **text/LLM**, **vision (VLM)**, **audio input**, **image generation**, **audio generation**, and **video generation**.

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

**Required.** Specifies the AI model and provider.

```
FROM <model>
FROM <provider>/<model> [options...]
```

#### Text / LLM

| Syntax | Provider | Notes |
|--------|----------|-------|
| `FROM gpt-4o` | OpenAI (auto-detected) | |
| `FROM openai/gpt-4o` | OpenAI (explicit) | |
| `FROM anthropic/claude-3-5-sonnet-20241022` | Anthropic | |
| `FROM qwen3:32b` | Ollama (auto-detected) | Local model |
| `FROM ollama/llama3` | Ollama (explicit) | Local model |
| `FROM mistral/mistral-large-latest` | Mistral AI | |
| `FROM groq/llama-3.1-70b-versatile` | Groq | Ultra-fast |
| `FROM gemini/gemini-1.5-pro` | Google Gemini | |
| `FROM together/<model>` | Together AI | |
| `FROM deepseek/deepseek-chat` | DeepSeek | |
| `FROM perplexity/<model>` | Perplexity | |
| `FROM fireworks/<model>` | Fireworks AI | |

#### Vision Language Models (VLM)

Use any VLM-capable model with `IMAGE` directives to attach images.

| Model | Vision |
|-------|--------|
| `openai/gpt-4o` | ✅ |
| `anthropic/claude-3-5-sonnet-20241022` | ✅ |
| `ollama/llava` | ✅ (local) |
| `gemini/gemini-1.5-pro` | ✅ |

#### Audio-capable models

| Model | Audio input |
|-------|-------------|
| `openai/gpt-4o-audio-preview` | ✅ |

#### Image generation models

| Model | Notes |
|-------|-------|
| `openai/dall-e-3` | DALL-E 3 |
| `openai/dall-e-2` | DALL-E 2 |
| `replicate/<owner>/<model>` | Stable Diffusion, Flux, etc. |

#### Audio generation models

| Model | Notes |
|-------|-------|
| `openai/tts-1` | OpenAI TTS |
| `openai/tts-1-hd` | OpenAI TTS HD |
| `replicate/meta/musicgen` | Meta MusicGen |
| `replicate/suno-ai/bark` | Suno Bark |

#### Video generation models

| Model | Notes |
|-------|-------|
| `replicate/anotherjesse/zeroscope-v2-xl` | Zeroscope v2 |
| `replicate/lucataco/animate-diff` | AnimateDiff |
| `replicate/stability-ai/stable-video-diffusion` | SVD |

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

### `IMAGE`

Attaches an image to the next user message. Supported by vision language models (VLMs).

```
IMAGE <path_or_url> [--detail auto|low|high]
```

| Option | Values | Default |
|--------|--------|---------|
| `--detail` | `auto`, `low`, `high` | `auto` |

```
IMAGE ./screenshot.png
IMAGE ./diagram.png --detail high
IMAGE https://example.com/photo.jpg --detail low
```

- **Local files** are read and base64-encoded as data URIs automatically.
- **Remote URLs** are passed directly to the model.
- Multiple `IMAGE` directives attach multiple images in a single user message.
- Combine with `RUN` steps to ask the model about the images.

```
FROM openai/gpt-4o

IMAGE ./ui.png --detail high

RUN describe the UI layout and identify accessibility issues
```

---

### `AUDIO`

Attaches an audio file to the next user message. Supported by audio-capable models such as `openai/gpt-4o-audio-preview`.

```
AUDIO <path_or_url> [--format mp3|wav|ogg|flac|webm]
```

| Option | Values | Default |
|--------|--------|---------|
| `--format` | `mp3`, `wav`, `ogg`, `flac`, `webm` | `mp3` |

```
AUDIO ./recording.mp3
AUDIO ./speech.wav --format wav
```

Local files are base64-encoded before being sent to the model.

---

### `VIDEO`

Attaches a video URL reference to the next user message. Support varies by provider.

```
VIDEO <url>
```

```
VIDEO https://example.com/clip.mp4
```

---

### `MEMORY`

Configures a persistent memory backend.

```
MEMORY <backend> [<name>] [options...]
```

| Backend | Description |
|---------|-------------|
| `local` | JSON file under `~/.promptfile/memory/<name>.json` |

```
MEMORY local
MEMORY local myproject
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

### `GENERATE`

Submits a generation prompt to a media-generation model and saves the result.

```
GENERATE <modality> <prompt> [options...]
```

| Modality | Description |
|----------|-------------|
| `image` | Generate a raster image (PNG/JPEG/WebP) |
| `audio` | Generate an audio file (MP3/WAV/OGG) |
| `video` | Generate a video file (MP4/WebM) |

| Option | Description |
|--------|-------------|
| `--output <path>` | Path to save the generated file |
| `--size` | Image size (DALL-E 3: `1024x1024`, `1792x1024`, `1024x1792`) |
| `--quality` | Image quality: `standard` or `hd` (DALL-E 3 only) |
| `--style` | Image style: `vivid` or `natural` (DALL-E 3 only) |
| `--voice` | TTS voice: `alloy`, `echo`, `fable`, `onyx`, `nova`, `shimmer` |
| `--format` | Audio format: `mp3`, `opus`, `aac`, `flac`, `wav`, `pcm` |

```
GENERATE image "a photorealistic sunset" --size 1792x1024 --output ./output/image.png
GENERATE audio "Hello from Promptfile!" --voice nova --output ./output/speech.mp3
GENERATE video "astronaut on the moon" --output ./output/video.mp4
```

Provider examples:

```
FROM openai/dall-e-3
GENERATE image "a serene Japanese garden at dawn" --quality hd --output ./art.png
```

```
FROM openai/tts-1-hd
GENERATE audio "This message was generated by AI." --voice shimmer --output ./speech.mp3
```

```
FROM replicate/meta/musicgen
GENERATE audio "upbeat jazz with walking bass, 30 seconds" --output ./music.mp3
```

```
FROM replicate/anotherjesse/zeroscope-v2-xl
GENERATE video "timelapse of clouds over mountains" --output ./video.mp4
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
LABEL modality=vision
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

## Complete Example — Vision Analysis

```promptfile
FROM openai/gpt-4o

LABEL version=1.0
LABEL workflow=vision-ui-review
LABEL modality=vision

SYSTEM """
You are a UX expert. Analyze UI screenshots for usability and accessibility.
"""

IMAGE ./screenshots/dashboard.png --detail high

RUN describe the UI layout and all visible components
RUN identify accessibility issues (contrast, font size, missing labels)
RUN suggest the top 3 improvements with rationale

EVAL non-empty

EXPORT markdown ./output/ui-review.md
```

---

## Complete Example — Code Review

```promptfile
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
| `OPENAI_API_KEY` | OpenAI API key (chat, vision, DALL-E, TTS) |
| `ANTHROPIC_API_KEY` | Anthropic API key (Claude Vision) |
| `REPLICATE_API_TOKEN` | Replicate API token (open image/audio/video models) |
| `OLLAMA_HOST` | Ollama base URL (default: `http://localhost:11434`) |
| `MISTRAL_API_KEY` | Mistral AI API key |
| `GROQ_API_KEY` | Groq API key |
| `GEMINI_API_KEY` | Google Gemini API key |
| `TOGETHER_API_KEY` | Together AI API key |
| `DEEPSEEK_API_KEY` | DeepSeek API key |
| `PERPLEXITY_API_KEY` | Perplexity AI API key |
| `FIREWORKS_API_KEY` | Fireworks AI API key |
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
8. Attach multimodal inputs: `IMAGE`, `AUDIO`, `VIDEO` (added to user message)
9. For each `RUN` step:
   - Append the instruction as a user message
   - Call the model (with tools if registered)
   - Append the response as an assistant message
   - Persist to memory if configured
10. For each `GENERATE` step:
    - Resolve a generation adapter
    - Submit the prompt to the provider
    - Download and save the result if `--output` is specified
11. Run `EVAL` checks over all RUN outputs
12. Write `EXPORT` files

---

## Provider Support Matrix

### Chat / VLM

| Provider | Status | Notes |
|----------|--------|-------|
| OpenAI | ✅ Full | `OPENAI_API_KEY`; GPT-4o supports vision |
| Anthropic | ✅ Full | `ANTHROPIC_API_KEY`; Claude 3+ supports vision |
| Ollama | ✅ Full | Local server; LLaVA supports vision |
| Mistral | ✅ Full | `MISTRAL_API_KEY` |
| Groq | ✅ Full | `GROQ_API_KEY` |
| Google Gemini | ✅ Full | `GEMINI_API_KEY` |
| Together AI | ✅ Full | `TOGETHER_API_KEY` |
| DeepSeek | ✅ Full | `DEEPSEEK_API_KEY` |
| Perplexity | ✅ Full | `PERPLEXITY_API_KEY` |
| Fireworks AI | ✅ Full | `FIREWORKS_API_KEY` |

### Generation

| Provider | Modality | Status | Notes |
|----------|----------|--------|-------|
| `openai/dall-e-3` | Image | ✅ Full | `OPENAI_API_KEY` |
| `openai/dall-e-2` | Image | ✅ Full | `OPENAI_API_KEY` |
| `openai/tts-1` | Audio | ✅ Full | `OPENAI_API_KEY` |
| `openai/tts-1-hd` | Audio | ✅ Full | `OPENAI_API_KEY` |
| `replicate/*` | Image/Audio/Video | ✅ Full | `REPLICATE_API_TOKEN` |
| fal.ai | Image/Video | 🔜 Planned | — |
| ElevenLabs | Audio | 🔜 Planned | — |
| Suno (native) | Audio | 🔜 Planned | — |
| Runway | Video | 🔜 Planned | — |

### Tool

| Tool | Status | Notes |
|------|--------|-------|
| `filesystem` | ✅ Full | Read-only; respects size limits |
| `github` | ✅ Full | `GITHUB_TOKEN` required |
| `web` | 🔜 Planned | HTTP fetch |
| `shell` | 🔜 Planned | Run shell commands (sandboxed) |

### Memory

| Backend | Status | Notes |
|---------|--------|-------|
| `local` | ✅ Full | `~/.promptfile/memory/<name>.json` |
| `redis` | 🔜 Planned | Redis key-value store |
| `vector` | 🔜 Planned | Vector similarity search |

---

*Promptfile v0.2 — [github.com/edujbarrios/promptfile](https://github.com/edujbarrios/promptfile)*
