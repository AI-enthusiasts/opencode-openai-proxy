# OpenCode OpenAI Proxy — Architecture & Routing

## Project Overview
- **Framework**: Hono (lightweight web framework)
- **Language**: TypeScript
- **Runtime**: Bun
- **Purpose**: OpenAI-compatible proxy that routes requests to multiple LLM providers (OpenAI, Anthropic, Google, Google Vertex) using OpenCode OAuth credentials

## File Structure (Key Files)

```
src/
├── index.ts                    # Main Hono app, route registration
├── types.ts                    # OpenAI API types (ChatCompletionRequest, etc.)
├── runtime.ts                  # OpencodeAI instance, provider/model parsing
├── errors.ts                   # Error mapping to OpenAI format
├── routes/
│   ├── completions.ts          # POST /v1/chat/completions handler
│   └── models.ts               # GET /v1/models endpoints
└── converters/
    ├── request.ts              # Convert OpenAI → AI SDK format
    ├── response.ts             # Convert AI SDK → OpenAI format
    └── stream.ts               # SSE streaming conversion
```

## Current Routing Architecture

### Entry Point (src/index.ts)
```typescript
app.route("/v1/chat/completions", completions)  // Hono sub-router
app.route("/v1/models", models)                 // Hono sub-router
```

**Key Pattern**: Uses Hono's `route()` method to mount sub-routers at specific paths.

### Completions Handler (src/routes/completions.ts)
- **Route**: `POST /v1/chat/completions` (mounted as sub-router)
- **Handler**: `completions.post("/")`
- **Flow**:
  1. Parse request body as `ChatCompletionRequest`
  2. Extract `model` field (format: `provider/modelID`)
  3. Call `parseModel(body.model)` → `{ providerID, modelID }`
  4. Get language model via `runtime.getLanguageModel(providerID, modelID)`
  5. Convert OpenAI messages → AI SDK format
  6. Call `streamText()` or `generateText()` based on `body.stream`
  7. Convert response back to OpenAI format

### Models Handler (src/routes/models.ts)
- **Routes**:
  - `GET /v1/models` — list all models from all providers
  - `GET /v1/models/:model` — get specific model info
- **Format**: Returns models as `provider/modelID` (e.g., `openai/gpt-4.1-nano`)

## Provider Selection Mechanism

### Model Name Format
**Current**: `provider/modelID`
- Example: `openai/gpt-4.1-nano`, `anthropic/claude-3-5-sonnet`, `google/gemini-2.0-flash`

### Parsing (src/runtime.ts)
```typescript
export function parseModel(model: string): { providerID: string; modelID: string } {
  const [providerID, ...rest] = model.split("/")
  if (!providerID || rest.length === 0) {
    throw new Error(`Invalid model format: "${model}". Expected "provider/model"`)
  }
  return { providerID, modelID: rest.join("/") }
}
```

**Key Point**: Splits on first `/`, allows model names with `/` (e.g., `google/gemini-2.0-flash-001`)

### Runtime Integration (src/runtime.ts)
```typescript
export function getRuntime(): OpencodeAIInstance {
  if (!instance) {
    instance = new OpencodeAI({ workspaceDir: process.cwd() })
  }
  return instance
}

// Usage in completions.ts:
const { providerID, modelID } = parseModel(body.model)
const runtime = getRuntime()
const languageModel = await runtime.getLanguageModel(providerID, modelID)
```

**OpencodeAI** (from `@tarquinen/opencode-auth-provider`):
- Manages OAuth credentials for each provider
- `getLanguageModel(providerID, modelID)` returns AI SDK language model instance
- Handles authentication transparently

## Authentication

### OAuth Provider Detection (src/runtime.ts)
```typescript
export async function isOAuthProvider(providerID: string): Promise<boolean> {
  const runtime = getRuntime()
  const provider = await runtime.getProvider(providerID)
  if (!provider?.options) return false
  // OAuth providers have apiKey="" and a custom fetch function
  return provider.options.apiKey === "" && typeof provider.options.fetch === "function"
}
```

### Special Handling for Anthropic OAuth (src/routes/completions.ts)
```typescript
const needsSystemPrefix = providerID === "anthropic" && await isOAuthProvider(providerID)
const system = needsSystemPrefix ? CLAUDE_CODE_SYSTEM_PREFIX : undefined
```

**Key Point**: Anthropic OAuth requires Claude Code system prompt prefix.

## Streaming Implementation

### SSE Streaming (src/routes/completions.ts)
```typescript
if (body.stream) {
  return streamSSE(c, async (stream) => {
    const state = createStreamState(body.model)
    const result = streamText({ model, system, messages, tools, ... })
    
    for await (const part of result.fullStream) {
      const chunk = convertStreamPart(part, state)
      await stream.writeSSE({ data: JSON.stringify(chunk) })
    }
    await stream.writeSSE({ data: "[DONE]" })
  })
}
```

## Error Handling

### Global Error Handler (src/index.ts)
```typescript
app.onError((err, c) => {
  const { status, response } = mapToOpenAIError(err)
  return c.json(response, status)
})
```

Maps all errors to OpenAI error format.

## Dependencies

### AI SDK Providers
- `@ai-sdk/openai` — OpenAI models
- `@ai-sdk/anthropic` — Anthropic models
- `@ai-sdk/google` — Google Gemini models
- `@ai-sdk/google-vertex` — Google Vertex AI models
- `@ai-sdk/openai-compatible` — Generic OpenAI-compatible endpoints

### Auth
- `@tarquinen/opencode-auth-provider` — OpenCode OAuth credential management

### Framework
- `hono` — Web framework
- `ai` — Vercel AI SDK (unified LLM interface)

## Design Patterns

1. **Sub-router Pattern**: Routes mounted via `app.route()` for modularity
2. **Provider Abstraction**: OpencodeAI handles all provider-specific auth
3. **Format Conversion**: Separate converter modules for request/response/streaming
4. **Error Mapping**: Centralized error handler converts to OpenAI format
5. **Lazy Runtime**: Singleton OpencodeAI instance created on first use

## Current Limitations & Extension Points

### For Dynamic Provider-Based Routes
**Current**: Model name format `provider/modelID` determines provider
**Proposed**: URL path `/v1/{provider}/chat/completions` extracts provider from path

**Where to Add**:
1. `src/index.ts` — Add new route: `app.route("/v1/:provider/chat/completions", dynamicCompletions)`
2. Create `src/routes/dynamic-completions.ts` — Extract provider from path param
3. Reuse existing `completions.ts` logic, but parse provider from URL instead of model name

**Key Consideration**: Model name still needs provider prefix for AI SDK (e.g., `openai/gpt-4.1-nano`). URL provider is just routing hint.
