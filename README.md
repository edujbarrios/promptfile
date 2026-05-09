# Promptfile

> **Dockerfile for AI workflows** — define, run, and share reproducible AI pipelines with a single declarative file.

```promptfile
FROM openai/gpt-4o

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

It's a **developer-first standard** for defining reproducible AI pipelines across **all modalities**:

- 📄 **One file** — model, prompt, context, tools, memory, evals, and exports
- 🔁 **Reproducible** — same file, same output, every time
- 🔌 **Composable** — chain steps, include shared base configs, parameterize with ARGs
- 🛠️ **CLI-first** — `pf run`, `pf validate`, `pf init`
- 🌐 **Multi-provider** — OpenAI, Anthropic, Ollama, Mistral, Groq, Gemini, Replicate, and more
- 🖼️ **Vision** — attach images to any VLM (GPT-4o, Claude 3, LLaVA, Gemini Vision)
- 🎵 **Audio** — generate speech, music, and sound with TTS and open music models
- 🎬 **Video** — generate video with Replicate-hosted models
- 🎨 **Image generation** — DALL-E 3, Stable Diffusion, Flux, and more

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
pf init vision
pf init image-gen
pf init audio-gen
pf init music-gen
pf init video-gen
```

### 2. Run it

```bash
export OPENAI_API_KEY=sk-...
pf run
```

### 3. Validate without running

```bash
pf validate
```

---

## Promptfile Reference

### `FROM` — Model Selection

The `FROM` directive selects the AI model. The format is `FROM <provider>/<model>` or just `FROM <model>` (auto-detected).

```promptfile
# Text / LLM
FROM gpt-4o                        # OpenAI (auto-detected)
FROM openai/gpt-4o                 # OpenAI (explicit)
FROM anthropic/claude-3-5-sonnet-20241022  # Anthropic
FROM qwen3:32b                     # Ollama local (auto-detected)
FROM ollama/llama3                 # Ollama (explicit)
FROM mistral/mistral-large-latest  # Mistral AI
FROM groq/llama-3.1-70b-versatile  # Groq (fast inference)
FROM gemini/gemini-1.5-pro         # Google Gemini
FROM together/meta-llama/Llama-3-70b-chat-hf  # Together AI
FROM deepseek/deepseek-chat        # DeepSeek

# Vision Language Models (attach images with IMAGE directive)
FROM openai/gpt-4o                 # GPT-4o with vision
FROM anthropic/claude-3-5-sonnet-20241022  # Claude Vision
FROM openai/gpt-4o-audio-preview   # Audio input/output

# Image generation
FROM openai/dall-e-3               # DALL-E 3
FROM openai/dall-e-2               # DALL-E 2

# Audio generation (TTS)
FROM openai/tts-1                  # OpenAI TTS
FROM openai/tts-1-hd               # OpenAI TTS HD

# Open model generation via Replicate
FROM replicate/meta/musicgen               # Meta MusicGen (music)
FROM replicate/suno-ai/bark                # Suno Bark (audio)
FROM replicate/stability-ai/stable-diffusion-3  # Stable Diffusion 3 (image)
FROM replicate/black-forest-labs/flux-schnell  # Flux Schnell (image)
FROM replicate/anotherjesse/zeroscope-v2-xl    # Zeroscope (video)
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

### `IMAGE` — Attach an Image (Vision)

Attach an image to the next user message. Accepted by any vision language model.

```promptfile
IMAGE ./screenshot.png              # local file (auto base64-encoded)
IMAGE https://example.com/photo.jpg # remote URL
IMAGE ./diagram.png --detail high   # detail: auto | low | high
```

Use `IMAGE` with `FROM openai/gpt-4o`, `FROM anthropic/claude-3-5-sonnet-20241022`,
or any other VLM, then add `RUN` steps:

```promptfile
FROM openai/gpt-4o

IMAGE ./ui-screenshot.png --detail high

RUN describe the UI layout and identify any accessibility issues
RUN suggest three concrete improvements
```

Multiple `IMAGE` directives attach multiple images in a single user message.

### `AUDIO` — Attach Audio Input

Attach an audio file to the next user message. Accepted by audio-capable models.

```promptfile
AUDIO ./recording.mp3               # local file (auto base64-encoded)
AUDIO ./speech.wav --format wav     # explicit format
```

Use with `FROM openai/gpt-4o-audio-preview`:

```promptfile
FROM openai/gpt-4o-audio-preview

AUDIO ./interview.mp3

RUN transcribe the audio
RUN summarize the key points discussed
```

### `VIDEO` — Attach Video Reference

Attach a video URL reference to the next user message.

```promptfile
VIDEO https://example.com/clip.mp4
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

### `GENERATE` — Generate Media

Submit a generation prompt to an image, audio, or video generation model.

```promptfile
# Image generation (DALL-E 3)
GENERATE image "a photorealistic sunset over rolling hills" --size 1792x1024 --quality hd --output ./output/image.png

# Audio / TTS (openai/tts-1-hd)
GENERATE audio "Hello! This message was generated by Promptfile." --voice nova --output ./output/speech.mp3

# Music generation (replicate/meta/musicgen)
GENERATE audio "upbeat jazz with walking bass, 30 seconds" --output ./output/music.mp3

# Video generation (replicate)
GENERATE video "astronaut riding a horse on the moon" --output ./output/video.mp4
```

`GENERATE` options:

| Option | Description |
|--------|-------------|
| `--output <path>` | Path to save the generated file |
| `--size` | Image size (DALL-E 3: `1024x1024`, `1792x1024`, `1024x1792`) |
| `--quality` | Image quality (DALL-E 3: `standard` or `hd`) |
| `--style` | Image style (DALL-E 3: `vivid` or `natural`) |
| `--voice` | TTS voice (`alloy`, `echo`, `fable`, `onyx`, `nova`, `shimmer`) |
| `--format` | Audio format (`mp3`, `opus`, `aac`, `flac`, `wav`) |

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
LABEL modality=vision
```

### `INCLUDE` — Reusable Base Configs

```promptfile
INCLUDE ./base.promptfile
```

---

## Full Examples

### Vision: Analyze a UI Screenshot

```promptfile
FROM openai/gpt-4o

LABEL workflow=vision-ui-review

SYSTEM """
You are a UX expert. Analyze UI screenshots for usability, accessibility, and design quality.
"""

IMAGE ./screenshots/dashboard.png --detail high

RUN describe the UI layout and all visible components
RUN identify accessibility issues (contrast, font size, missing labels)
RUN suggest the top 3 improvements with rationale

EVAL non-empty
EXPORT markdown ./output/ui-review.md
```

### Image Generation: DALL-E 3

```promptfile
FROM openai/dall-e-3

LABEL workflow=image-generation

ARG prompt=a serene Japanese tea garden at dawn, watercolor style

GENERATE image ${prompt} --size 1792x1024 --quality hd --output ./output/teagarden.png
```

### Audio Generation: TTS

```promptfile
FROM openai/tts-1-hd

LABEL workflow=narration

ARG script=Welcome to the future of AI workflows. Promptfile makes it declarative.

GENERATE audio ${script} --voice nova --format mp3 --output ./output/narration.mp3
```

### Music Generation: Replicate MusicGen

```promptfile
FROM replicate/meta/musicgen

LABEL workflow=music-generation

ARG style=cinematic orchestral intro, epic, 20 seconds

GENERATE audio ${style} --output ./output/intro.mp3
```

### Video Generation: Replicate Zeroscope

```promptfile
FROM replicate/anotherjesse/zeroscope-v2-xl

LABEL workflow=video-generation

ARG scene=a timelapse of clouds over snow-capped mountains at golden hour

GENERATE video ${scene} --output ./output/timelapse.mp4
```

### Code Review (classic text workflow)

```promptfile
FROM openai/gpt-4o

LABEL version=1.0
LABEL workflow=code-review

SET temperature 0.2

SYSTEM """
You are an expert code reviewer. Be specific and actionable.
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
             vision | image-gen | audio-gen | music-gen | video-gen

pf parse [file]        Print the parsed AST as JSON (debug)
```

---

## Environment Variables

| Variable | Description |
|----------|-------------|
| `OPENAI_API_KEY` | OpenAI API key (chat, vision, DALL-E, TTS) |
| `ANTHROPIC_API_KEY` | Anthropic API key (Claude Vision) |
| `REPLICATE_API_TOKEN` | Replicate API token (open models: image/audio/video) |
| `OLLAMA_HOST` | Ollama base URL (default: `http://localhost:11434`) |
| `MISTRAL_API_KEY` | Mistral AI API key |
| `GROQ_API_KEY` | Groq API key |
| `GEMINI_API_KEY` | Google Gemini API key |
| `TOGETHER_API_KEY` | Together AI API key |
| `DEEPSEEK_API_KEY` | DeepSeek API key |
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

## Provider Support Matrix

### Chat / Vision Language Models

| Provider | Status | Env Variable | Notes |
|----------|--------|--------------|-------|
| OpenAI | ✅ Full | `OPENAI_API_KEY` | GPT-4o supports vision |
| Anthropic | ✅ Full | `ANTHROPIC_API_KEY` | Claude 3+ supports vision |
| Ollama | ✅ Full | `OLLAMA_HOST` | Local; LLaVA supports vision |
| Mistral | ✅ Full | `MISTRAL_API_KEY` | OpenAI-compatible |
| Groq | ✅ Full | `GROQ_API_KEY` | Ultra-fast inference |
| Google Gemini | ✅ Full | `GEMINI_API_KEY` | Via OpenAI-compatible endpoint |
| Together AI | ✅ Full | `TOGETHER_API_KEY` | Hundreds of open models |
| DeepSeek | ✅ Full | `DEEPSEEK_API_KEY` | OpenAI-compatible |
| Perplexity | ✅ Full | `PERPLEXITY_API_KEY` | Search-augmented |
| Fireworks AI | ✅ Full | `FIREWORKS_API_KEY` | Fast open models |

### Image Generation

| Provider / Model | Status | Notes |
|-----------------|--------|-------|
| `openai/dall-e-3` | ✅ Full | `OPENAI_API_KEY` |
| `openai/dall-e-2` | ✅ Full | `OPENAI_API_KEY` |
| `replicate/stability-ai/stable-diffusion-3` | ✅ Full | `REPLICATE_API_TOKEN` |
| `replicate/black-forest-labs/flux-schnell` | ✅ Full | `REPLICATE_API_TOKEN` |
| fal.ai | 🔜 Planned | — |

### Audio Generation

| Provider / Model | Status | Notes |
|-----------------|--------|-------|
| `openai/tts-1` | ✅ Full | `OPENAI_API_KEY` |
| `openai/tts-1-hd` | ✅ Full | `OPENAI_API_KEY` |
| `replicate/meta/musicgen` | ✅ Full | `REPLICATE_API_TOKEN` |
| `replicate/suno-ai/bark` | ✅ Full | `REPLICATE_API_TOKEN` |
| `replicate/riffusion/riffusion` | ✅ Full | `REPLICATE_API_TOKEN` |
| ElevenLabs | 🔜 Planned | — |
| Suno (native API) | 🔜 Planned | — |

### Video Generation

| Provider / Model | Status | Notes |
|-----------------|--------|-------|
| `replicate/anotherjesse/zeroscope-v2-xl` | ✅ Full | `REPLICATE_API_TOKEN` |
| `replicate/lucataco/animate-diff` | ✅ Full | `REPLICATE_API_TOKEN` |
| `replicate/stability-ai/stable-video-diffusion` | ✅ Full | `REPLICATE_API_TOKEN` |
| Runway | 🔜 Planned | — |
| Sora | 🔜 Planned | — |

---

## Examples

See the [`examples/`](./examples) directory:

| File | Description |
|------|-------------|
| `architect.promptfile` | Architecture analysis + ADR generation |
| `summarizer.promptfile` | Technical documentation summarizer |
| `reviewer.promptfile` | Automated code review |
| `vision.promptfile` | Image analysis with GPT-4o |
| `vision-compare.promptfile` | Compare multiple images |
| `image-generation.promptfile` | Generate images with DALL-E 3 |
| `audio-generation.promptfile` | Text-to-speech with OpenAI TTS |
| `audio-understanding.promptfile` | Transcribe and analyze audio |
| `music-generation.promptfile` | Generate music with MusicGen (Replicate) |
| `video-generation.promptfile` | Generate video with Zeroscope (Replicate) |

---

## Specification

The full Promptfile format specification is in [`docs/spec.md`](./docs/spec.md).

---

## Roadmap

- [ ] `INCLUDE` directive (base config inheritance)
- [ ] `TOOL web` (HTTP fetch)
- [ ] `TOOL shell` (sandboxed shell commands)
- [ ] `MEMORY redis` backend
- [ ] `MEMORY vector` backend (semantic search)
- [ ] `EVAL relevance` check (LLM-as-judge)
- [ ] Parallel RUN execution (`RUN PARALLEL`)
- [ ] Watch mode (`pf run --watch`)
- [ ] Registry for sharing Promptfiles
- [ ] ElevenLabs TTS adapter
- [ ] Suno native API adapter
- [ ] Runway video generation adapter
- [ ] fal.ai image/video adapter

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
