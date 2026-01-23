import type { CoreMessage, ToolSet, JSONValue } from "ai"
import { jsonSchema } from "ai"
import type {
  OpenAIMessage,
  OpenAITool,
  OpenAIAssistantMessage,
  OpenAIToolMessage,
  OpenAIUserMessage,
  OpenAIContentPart,
} from "../types"

export function convertMessages(
  messages: OpenAIMessage[],
  toolCallMap: Map<string, string> = new Map()
): CoreMessage[] {
  return messages.map((msg) => convertMessage(msg, toolCallMap))
}

function convertMessage(
  msg: OpenAIMessage,
  toolCallMap: Map<string, string>
): CoreMessage {
  switch (msg.role) {
    case "system":
      return { role: "system", content: msg.content }

    case "user":
      return { role: "user", content: convertUserContent(msg) }

    case "assistant":
      return convertAssistantMessage(msg, toolCallMap)

    case "tool":
      return convertToolMessage(msg, toolCallMap)
  }
}

function convertUserContent(msg: OpenAIUserMessage): string | Array<{ type: "text"; text: string }> {
  if (typeof msg.content === "string") {
    return msg.content
  }
  return msg.content
    .filter((part): part is OpenAIContentPart & { type: "text" } => part.type === "text")
    .map((part) => ({ type: "text" as const, text: part.text || "" }))
}

function convertAssistantMessage(
  msg: OpenAIAssistantMessage,
  toolCallMap: Map<string, string>
): CoreMessage {
  if (!msg.tool_calls || msg.tool_calls.length === 0) {
    return { role: "assistant", content: msg.content || "" }
  }

  const content: Array<{ type: "text"; text: string } | { type: "tool-call"; toolCallId: string; toolName: string; input: unknown }> = []

  if (msg.content) {
    content.push({ type: "text", text: msg.content })
  }

  for (const toolCall of msg.tool_calls) {
    toolCallMap.set(toolCall.id, toolCall.function.name)
    content.push({
      type: "tool-call",
      toolCallId: toolCall.id,
      toolName: toolCall.function.name,
      input: JSON.parse(toolCall.function.arguments),
    })
  }

  return { role: "assistant", content }
}

function convertToolMessage(
  msg: OpenAIToolMessage,
  toolCallMap: Map<string, string>
): CoreMessage {
  const toolName = toolCallMap.get(msg.tool_call_id)
  if (!toolName) {
    throw new Error(`Unknown tool_call_id: ${msg.tool_call_id}. Tool result must follow an assistant message with matching tool_calls.`)
  }

  // ai@5 requires output to be { type: "json" | "text", value: ... }
  let output: { type: "json"; value: JSONValue } | { type: "text"; value: string }
  try {
    const parsed = JSON.parse(msg.content) as JSONValue
    output = { type: "json", value: parsed }
  } catch {
    output = { type: "text", value: msg.content }
  }

  return {
    role: "tool",
    content: [
      {
        type: "tool-result",
        toolCallId: msg.tool_call_id,
        toolName,
        output,
      },
    ],
  }
}

export function convertTools(tools?: OpenAITool[]): ToolSet | undefined {
  if (!tools || tools.length === 0) {
    return undefined
  }

  const toolSet: ToolSet = {}

  for (const tool of tools) {
    toolSet[tool.function.name] = {
      description: tool.function.description,
      inputSchema: jsonSchema(tool.function.parameters || { type: "object" }),
    }
  }

  return toolSet
}
