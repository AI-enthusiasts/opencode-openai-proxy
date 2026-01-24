import type { ChatCompletionChunk, FinishReason, Usage } from "../types"

/**
 * Stream converter state - tracks tool call indices for proper OpenAI format
 */
interface StreamState {
  id: string
  model: string
  created: number
  sentRole: boolean
  toolCallIndices: Map<string, number>
  nextToolIndex: number
}

export function createStreamState(model: string): StreamState {
  return {
    id: generateChunkId(),
    model,
    created: Math.floor(Date.now() / 1000),
    sentRole: false,
    toolCallIndices: new Map(),
    nextToolIndex: 0,
  }
}

function generateChunkId(): string {
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
  let id = "chatcmpl-"
  for (let i = 0; i < 24; i++) {
    id += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return id
}

/**
 * Convert Vercel AI SDK stream part to OpenAI chunk.
 * Returns null if the part should not produce a chunk.
 */
export function convertStreamPart(
  part: { type: string; [key: string]: unknown },
  state: StreamState
): ChatCompletionChunk | null {
  switch (part.type) {
    case "text-delta": {
      const chunk = createChunk(state, {
        content: part.textDelta as string,
        // First chunk must include role
        ...(state.sentRole ? {} : { role: "assistant" }),
      })
      state.sentRole = true
      return chunk
    }

    case "tool-call": {
      // Full tool call - send id, type, name, and complete arguments
      const toolCallId = part.toolCallId as string
      let index = state.toolCallIndices.get(toolCallId)
      if (index === undefined) {
        index = state.nextToolIndex++
        state.toolCallIndices.set(toolCallId, index)
      }

      const chunk = createChunk(state, {
        ...(state.sentRole ? {} : { role: "assistant" }),
        tool_calls: [
          {
            index,
            id: toolCallId,
            type: "function" as const,
            function: {
              name: part.toolName as string,
              arguments: JSON.stringify(part.args),
            },
          },
        ],
      })
      state.sentRole = true
      return chunk
    }

    case "tool-input-start": {
      // Start of streaming tool call - send id, type, name
      const toolCallId = part.toolCallId as string
      let index = state.toolCallIndices.get(toolCallId)
      if (index === undefined) {
        index = state.nextToolIndex++
        state.toolCallIndices.set(toolCallId, index)
      }

      const chunk = createChunk(state, {
        ...(state.sentRole ? {} : { role: "assistant" }),
        tool_calls: [
          {
            index,
            id: toolCallId,
            type: "function" as const,
            function: {
              name: part.toolName as string,
            },
          },
        ],
      })
      state.sentRole = true
      return chunk
    }

    case "tool-input-delta": {
      // Streaming tool arguments
      const toolCallId = part.toolCallId as string
      const index = state.toolCallIndices.get(toolCallId)
      if (index === undefined) {
        return null // Should not happen if tool-input-start was received
      }

      return createChunk(state, {
        tool_calls: [
          {
            index,
            function: {
              arguments: part.argsTextDelta as string,
            },
          },
        ],
      })
    }

    case "finish": {
      const finishReason = convertFinishReason(part.finishReason as string)
      const usage = part.usage as { inputTokens?: number; outputTokens?: number } | undefined

      return createFinishChunk(state, finishReason, usage)
    }

    // Parts that don't produce chunks
    case "start":
    case "start-step":
    case "text-start":
    case "text-end":
    case "tool-input-end":
    case "finish-step":
    case "reasoning-start":
    case "reasoning-delta":
    case "reasoning-end":
    case "source":
    case "file":
    case "tool-result":
    case "raw":
      return null

    // Error and abort are handled separately
    case "error":
    case "tool-error":
    case "abort":
      return null

    default:
      return null
  }
}

function createChunk(
  state: StreamState,
  delta: {
    role?: "assistant"
    content?: string
    tool_calls?: Array<{
      index: number
      id?: string
      type?: "function"
      function?: {
        name?: string
        arguments?: string
      }
    }>
  }
): ChatCompletionChunk {
  return {
    id: state.id,
    object: "chat.completion.chunk",
    created: state.created,
    model: state.model,
    choices: [
      {
        index: 0,
        delta,
        finish_reason: null,
      },
    ],
  }
}

function createFinishChunk(
  state: StreamState,
  finishReason: FinishReason,
  usage?: { inputTokens?: number; outputTokens?: number }
): ChatCompletionChunk {
  const chunk: ChatCompletionChunk = {
    id: state.id,
    object: "chat.completion.chunk",
    created: state.created,
    model: state.model,
    choices: [
      {
        index: 0,
        delta: {},
        finish_reason: finishReason,
      },
    ],
  }

  if (usage) {
    chunk.usage = {
      prompt_tokens: usage.inputTokens ?? 0,
      completion_tokens: usage.outputTokens ?? 0,
      total_tokens: (usage.inputTokens ?? 0) + (usage.outputTokens ?? 0),
    }
  }

  return chunk
}

function convertFinishReason(reason: string): FinishReason {
  switch (reason) {
    case "stop":
      return "stop"
    case "tool-calls":
      return "tool_calls"
    case "length":
      return "length"
    case "content-filter":
      return "content_filter"
    default:
      return "stop"
  }
}

/**
 * Create an error chunk for mid-stream errors.
 * OpenAI clients expect error events as SSE data, not HTTP status codes.
 */
export function createErrorChunk(error: unknown): { error: { message: string; type: string; code: string | null } } {
  const message = error instanceof Error ? error.message : String(error)
  return {
    error: {
      message,
      type: "api_error",
      code: null,
    },
  }
}
