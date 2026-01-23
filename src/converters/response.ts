import type { ChatCompletion, FinishReason, OpenAIToolCall } from "../types"

interface GenerateTextResultLike {
  text: string
  toolCalls?: Array<{
    toolCallId: string
    toolName: string
    input: unknown
  }>
  finishReason: string
  usage: {
    inputTokens: number | undefined
    outputTokens: number | undefined
  }
}

export function convertResponse(
  result: GenerateTextResultLike,
  model: string
): ChatCompletion {
  const hasToolCalls = result.toolCalls && result.toolCalls.length > 0

  return {
    id: generateCompletionId(),
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [
      {
        index: 0,
        message: {
          role: "assistant",
          content: result.text || null,
          ...(hasToolCalls && {
            tool_calls: convertToolCalls(result.toolCalls!),
          }),
        },
        finish_reason: convertFinishReason(result.finishReason, hasToolCalls),
      },
    ],
    usage: {
      prompt_tokens: result.usage.inputTokens ?? 0,
      completion_tokens: result.usage.outputTokens ?? 0,
      total_tokens: (result.usage.inputTokens ?? 0) + (result.usage.outputTokens ?? 0),
    },
  }
}

function generateCompletionId(): string {
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
  let id = "chatcmpl-"
  for (let i = 0; i < 24; i++) {
    id += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return id
}

function convertToolCalls(
  toolCalls: Array<{ toolCallId: string; toolName: string; input: unknown }>
): OpenAIToolCall[] {
  return toolCalls.map((tc) => ({
    id: tc.toolCallId,
    type: "function" as const,
    function: {
      name: tc.toolName,
      arguments: JSON.stringify(tc.input),
    },
  }))
}

function convertFinishReason(reason: string, hasToolCalls?: boolean): FinishReason {
  if (hasToolCalls) {
    return "tool_calls"
  }

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
