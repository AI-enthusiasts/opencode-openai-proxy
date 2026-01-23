import { describe, it, expect } from "bun:test"
import { convertMessages, convertTools } from "../../src/converters/request"
import type { OpenAIMessage, OpenAITool } from "../../src/types"

describe("convertMessages", () => {
  it("converts system message", () => {
    const messages: OpenAIMessage[] = [
      { role: "system", content: "You are a helpful assistant" },
    ]

    const result = convertMessages(messages)

    expect(result).toEqual([
      { role: "system", content: "You are a helpful assistant" },
    ])
  })

  it("converts user message with string content", () => {
    const messages: OpenAIMessage[] = [
      { role: "user", content: "Hello" },
    ]

    const result = convertMessages(messages)

    expect(result).toEqual([
      { role: "user", content: "Hello" },
    ])
  })

  it("converts user message with array content", () => {
    const messages: OpenAIMessage[] = [
      {
        role: "user",
        content: [
          { type: "text", text: "What is this?" },
        ],
      },
    ]

    const result = convertMessages(messages)

    expect(result).toEqual([
      { role: "user", content: [{ type: "text", text: "What is this?" }] },
    ])
  })

  it("converts assistant message without tool calls", () => {
    const messages: OpenAIMessage[] = [
      { role: "assistant", content: "Hello! How can I help?" },
    ]

    const result = convertMessages(messages)

    expect(result).toEqual([
      { role: "assistant", content: "Hello! How can I help?" },
    ])
  })

  it("converts assistant message with tool calls", () => {
    const messages: OpenAIMessage[] = [
      {
        role: "assistant",
        content: null,
        tool_calls: [
          {
            id: "call_123",
            type: "function",
            function: {
              name: "get_weather",
              arguments: '{"location":"San Francisco"}',
            },
          },
        ],
      },
    ]

    const toolCallMap = new Map<string, string>()
    const result = convertMessages(messages, toolCallMap)

    expect(result).toEqual([
      {
        role: "assistant",
        content: [
          {
            type: "tool-call",
            toolCallId: "call_123",
            toolName: "get_weather",
            input: { location: "San Francisco" },
          },
        ],
      },
    ])
    expect(toolCallMap.get("call_123")).toBe("get_weather")
  })

  it("converts tool message using toolCallMap", () => {
    const toolCallMap = new Map<string, string>()
    toolCallMap.set("call_123", "get_weather")

    const messages: OpenAIMessage[] = [
      {
        role: "tool",
        tool_call_id: "call_123",
        content: '{"temperature": 72, "condition": "sunny"}',
      },
    ]

    const result = convertMessages(messages, toolCallMap)

    expect(result).toEqual([
      {
        role: "tool",
        content: [
          {
            type: "tool-result",
            toolCallId: "call_123",
            toolName: "get_weather",
            output: { type: "json", value: { temperature: 72, condition: "sunny" } },
          },
        ],
      },
    ])
  })

  it("throws error for unknown tool_call_id", () => {
    const messages: OpenAIMessage[] = [
      {
        role: "tool",
        tool_call_id: "unknown_id",
        content: "result",
      },
    ]

    expect(() => convertMessages(messages)).toThrow("Unknown tool_call_id")
  })

  it("handles multi-turn conversation with tools", () => {
    const messages: OpenAIMessage[] = [
      { role: "user", content: "What's the weather in SF?" },
      {
        role: "assistant",
        content: null,
        tool_calls: [
          {
            id: "call_abc",
            type: "function",
            function: {
              name: "get_weather",
              arguments: '{"location":"San Francisco"}',
            },
          },
        ],
      },
      {
        role: "tool",
        tool_call_id: "call_abc",
        content: '{"temp": 65}',
      },
    ]

    const toolCallMap = new Map<string, string>()
    const result = convertMessages(messages, toolCallMap)

    expect(result.length).toBe(3)
    expect(result[2]).toEqual({
      role: "tool",
      content: [
        {
          type: "tool-result",
          toolCallId: "call_abc",
          toolName: "get_weather",
          output: { type: "json", value: { temp: 65 } },
        },
      ],
    })
  })
})

describe("convertTools", () => {
  it("returns undefined for empty tools", () => {
    expect(convertTools(undefined)).toBeUndefined()
    expect(convertTools([])).toBeUndefined()
  })

  it("converts tools to ToolSet format", () => {
    const tools: OpenAITool[] = [
      {
        type: "function",
        function: {
          name: "get_weather",
          description: "Get the weather for a location",
          parameters: {
            type: "object",
            properties: {
              location: { type: "string" },
            },
            required: ["location"],
          },
        },
      },
    ]

    const result = convertTools(tools)

    expect(result).toBeDefined()
    expect(result!["get_weather"]).toBeDefined()
    expect(result!["get_weather"].description).toBe("Get the weather for a location")
  })

  it("handles tools without parameters", () => {
    const tools: OpenAITool[] = [
      {
        type: "function",
        function: {
          name: "get_time",
          description: "Get current time",
        },
      },
    ]

    const result = convertTools(tools)

    expect(result).toBeDefined()
    expect(result!["get_time"]).toBeDefined()
  })
})
