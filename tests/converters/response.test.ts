import { describe, it, expect } from "bun:test"
import { convertResponse } from "../../src/converters/response"

describe("convertResponse", () => {
  it("converts basic text response", () => {
    const result = {
      text: "Hello! How can I help you?",
      toolCalls: [],
      finishReason: "stop",
      usage: {
        inputTokens: 10,
        outputTokens: 8,
      },
    }

    const response = convertResponse(result, "anthropic/claude-sonnet-4-20250514")

    expect(response.object).toBe("chat.completion")
    expect(response.model).toBe("anthropic/claude-sonnet-4-20250514")
    expect(response.id).toMatch(/^chatcmpl-/)
    expect(response.choices.length).toBe(1)
    expect(response.choices[0].message.role).toBe("assistant")
    expect(response.choices[0].message.content).toBe("Hello! How can I help you?")
    expect(response.choices[0].finish_reason).toBe("stop")
    expect(response.usage).toEqual({
      prompt_tokens: 10,
      completion_tokens: 8,
      total_tokens: 18,
    })
  })

  it("converts response with tool calls", () => {
    const result = {
      text: "",
      toolCalls: [
        {
          toolCallId: "call_123",
          toolName: "get_weather",
          input: { location: "San Francisco" },
        },
      ],
      finishReason: "tool-calls",
      usage: {
        inputTokens: 20,
        outputTokens: 15,
      },
    }

    const response = convertResponse(result, "anthropic/claude-sonnet-4-20250514")

    expect(response.choices[0].message.tool_calls).toBeDefined()
    expect(response.choices[0].message.tool_calls!.length).toBe(1)
    expect(response.choices[0].message.tool_calls![0]).toEqual({
      id: "call_123",
      type: "function",
      function: {
        name: "get_weather",
        arguments: '{"location":"San Francisco"}',
      },
    })
    expect(response.choices[0].finish_reason).toBe("tool_calls")
  })

  it("converts finish_reason correctly", () => {
    const baseResult = {
      text: "test",
      toolCalls: [],
      usage: { inputTokens: 1, outputTokens: 1 },
    }

    expect(convertResponse({ ...baseResult, finishReason: "stop" }, "m").choices[0].finish_reason).toBe("stop")
    expect(convertResponse({ ...baseResult, finishReason: "length" }, "m").choices[0].finish_reason).toBe("length")
    expect(convertResponse({ ...baseResult, finishReason: "content-filter" }, "m").choices[0].finish_reason).toBe("content_filter")
    expect(convertResponse({ ...baseResult, finishReason: "unknown" }, "m").choices[0].finish_reason).toBe("stop")
  })

  it("sets tool_calls finish_reason when tool calls present", () => {
    const result = {
      text: "Let me check that for you",
      toolCalls: [
        {
          toolCallId: "call_456",
          toolName: "search",
          input: { query: "test" },
        },
      ],
      finishReason: "stop",
      usage: { inputTokens: 1, outputTokens: 1 },
    }

    const response = convertResponse(result, "model")

    expect(response.choices[0].finish_reason).toBe("tool_calls")
  })

  it("generates unique completion IDs", () => {
    const result = {
      text: "test",
      toolCalls: [],
      finishReason: "stop",
      usage: { inputTokens: 1, outputTokens: 1 },
    }

    const response1 = convertResponse(result, "model")
    const response2 = convertResponse(result, "model")

    expect(response1.id).not.toBe(response2.id)
  })

  it("sets created timestamp", () => {
    const result = {
      text: "test",
      toolCalls: [],
      finishReason: "stop",
      usage: { inputTokens: 1, outputTokens: 1 },
    }

    const before = Math.floor(Date.now() / 1000)
    const response = convertResponse(result, "model")
    const after = Math.floor(Date.now() / 1000)

    expect(response.created).toBeGreaterThanOrEqual(before)
    expect(response.created).toBeLessThanOrEqual(after)
  })

  it("handles null content", () => {
    const result = {
      text: "",
      toolCalls: [],
      finishReason: "stop",
      usage: { inputTokens: 1, outputTokens: 1 },
    }

    const response = convertResponse(result, "model")

    expect(response.choices[0].message.content).toBe(null)
  })
})
