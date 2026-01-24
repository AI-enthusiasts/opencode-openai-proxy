# opencode-openai-proxy

OpenAI-compatible API proxy that uses OpenCode's OAuth credentials. Allows any OpenAI-compatible client to use Claude, GPT-4, Gemini, and other models through OpenCode's authentication.

## Features

- **OpenAI Chat Completions API** (`/v1/chat/completions`) - streaming and non-streaming
- **Tool calling** support with proper conversion
- **Multi-provider** - Anthropic, OpenAI, Google, Azure, Bedrock, Vertex, OpenRouter
- **Automatic OAuth refresh** - uses `@tarquinen/opencode-auth-provider`
- **Error mapping** - AI SDK errors converted to OpenAI error format

## Prerequisites

1. [Bun](https://bun.sh/) >= 1.1
2. [OpenCode](https://github.com/sst/opencode) configured with credentials (`~/.local/share/opencode/auth.json`)

## Installation

```bash
git clone https://github.com/AI-enthusiasts/opencode-openai-proxy.git
cd opencode-openai-proxy
bun install
```

## Usage

```bash
# Start the server
bun run start

# Or with hot reload
bun run dev
```

Server runs on `http://localhost:8080` by default. Set `PORT` env var to change.

## Docker

### Quick Start

```bash
# Build and run with docker-compose
# Linux/Mac:
docker compose up -d

# Windows with WSL Docker:
OPENCODE_DATA_DIR=/mnt/c/Users/$USER/.local/share/opencode docker compose up -d

# Check health
curl http://localhost:8080/health
```

### Prerequisites

OpenCode credentials must exist on the host machine:
```bash
# Login to providers (run on host, not in container)
opencode auth login anthropic
opencode auth login alibaba
```

Credentials are mounted from `~/.local/share/opencode/` as a read-only volume.

### Configuration

Environment variables:
- `PORT` - Host port to expose (default: 8080)
- `OPENCODE_DATA_DIR` - Path to OpenCode data directory (default: `~/.local/share/opencode`)

```bash
# Custom port
PORT=3000 docker compose up -d

# Custom credentials path
OPENCODE_DATA_DIR=/path/to/opencode docker compose up -d
```

### Build Only

```bash
docker build -t opencode-openai-proxy .
docker run -p 8080:8080 -v ~/.local/share/opencode:/data/opencode:ro -e OPENCODE_DATA_DIR=/data/opencode opencode-openai-proxy
```

## API

### POST /v1/chat/completions

Standard OpenAI Chat Completions format. Model format: `provider/model`

```bash
curl http://localhost:8080/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "anthropic/claude-sonnet-4-20250514",
    "messages": [{"role": "user", "content": "Hello!"}]
  }'
```

### Supported providers

- `anthropic/claude-*` - Anthropic Claude models
- `openai/gpt-*` - OpenAI models
- `google/gemini-*` - Google Gemini
- `github-copilot/gpt-*` - GitHub Copilot
- `openrouter/*` - OpenRouter models
- And more via `opencode.jsonc` configuration

### GET /health

Health check endpoint.

### GET /v1/models

Lists available models from configured providers.

## Configuration

The proxy uses OpenCode's configuration:

- `~/.config/opencode/opencode.jsonc` - global config
- `./opencode.jsonc` - workspace config (merged)
- `~/.local/share/opencode/auth.json` - credentials

## Development

```bash
# Run unit tests
bun test

# Run E2E tests (requires server running with credentials)
bun run test:e2e

# Run with watch mode
bun run dev
```

## Limitations

- Image inputs not fully tested

## Related

- [@tarquinen/opencode-auth-provider](https://github.com/Tarquinen/opencode-auth-provider) - Auth provider library
- [OpenCode](https://github.com/sst/opencode) - AI coding assistant

## License

MIT
