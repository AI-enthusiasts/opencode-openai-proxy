/**
 * OpenAI API types for the proxy.
 * Based on OpenAI Chat Completions API format.
 */

// ============================================================================
// Request Types
// ============================================================================

export interface ChatCompletionRequest {
  model: string
  messages: OpenAIMessage[]
  stream?: boolean
  temperature?: number
  max_tokens?: number
  top_p?: number
  frequency_penalty?: number
  presence_penalty?: number
  stop?: string | string[]
  tools?: OpenAITool[]
  tool_choice?: "none" | "auto" | "required" | { type: "function"; function: { name: string } }
}

export type OpenAIMessage =
  | OpenAISystemMessage
  | OpenAIUserMessage
  | OpenAIAssistantMessage
  | OpenAIToolMessage

export interface OpenAISystemMessage {
  role: "system"
  content: string
}

export interface OpenAIUserMessage {
  role: "user"
  content: string | OpenAIContentPart[]
}

export interface OpenAIAssistantMessage {
  role: "assistant"
  content: string | null
  tool_calls?: OpenAIToolCall[]
}

export interface OpenAIToolMessage {
  role: "tool"
  tool_call_id: string
  content: string
}

export interface OpenAIContentPart {
  type: "text" | "image_url"
  text?: string
  image_url?: { url: string; detail?: "auto" | "low" | "high" }
}

export interface OpenAITool {
  type: "function"
  function: {
    name: string
    description?: string
    parameters?: Record<string, unknown>
  }
}

export interface OpenAIToolCall {
  id: string
  type: "function"
  function: {
    name: string
    arguments: string // JSON string
  }
}

// ============================================================================
// Response Types (Non-streaming)
// ============================================================================

export interface ChatCompletion {
  id: string
  object: "chat.completion"
  created: number
  model: string
  choices: ChatCompletionChoice[]
  usage: Usage
}

export interface ChatCompletionChoice {
  index: number
  message: {
    role: "assistant"
    content: string | null
    tool_calls?: OpenAIToolCall[]
  }
  finish_reason: FinishReason
}

export type FinishReason = "stop" | "tool_calls" | "length" | "content_filter"

export interface Usage {
  prompt_tokens: number
  completion_tokens: number
  total_tokens: number
}

// ============================================================================
// Streaming Types
// ============================================================================

export interface ChatCompletionChunk {
  id: string
  object: "chat.completion.chunk"
  created: number
  model: string
  choices: ChatCompletionChunkChoice[]
  usage?: Usage // Only in final chunk when stream_options.include_usage is true
}

export interface ChatCompletionChunkChoice {
  index: number
  delta: ChatCompletionDelta
  finish_reason: FinishReason | null
}

export interface ChatCompletionDelta {
  role?: "assistant"
  content?: string
  tool_calls?: ChatCompletionDeltaToolCall[]
}

export interface ChatCompletionDeltaToolCall {
  index: number
  id?: string
  type?: "function"
  function?: {
    name?: string
    arguments?: string
  }
}
