import { describe, it, expect } from "bun:test"
import { createStreamState, convertStreamPart, createErrorChunk } from "../../src/converters/stream"

describe("createStreamState", () => {
  it("creates state with model and generated id", () => {
    const state = createStreamState("anthropic/claude-sonnet-4-20250514")
    
    expect(state.model).toBe("anthropic/claude-sonnet-4-20250514")
    expect(state.id).toMatch(/^chatcmpl-[a-zA-Z0-9]{24}$/)
    expect(state.created).toBeGreaterThan(0)
    expect(state.sentRole).toBe(false)
    expect(state.nextToolIndex).toBe(0)
  })
})

describe("convertStreamPart", () => {
  describe("text-delta", () => {
    it("converts text-delta with role on first chunk", () => {
      const state = createStreamState("test-model")
      const chunk = convertStreamPart({ type: "text-delta", text: "Hello" }, state)
      
      expect(chunk).not.toBeNull()
      expect(chunk!.object).toBe("chat.completion.chunk")
      expect(chunk!.model).toBe("test-model")
      expect(chunk!.choices[0].delta.role).toBe("assistant")
      expect(chunk!.choices[0].delta.content).toBe("Hello")
      expect(chunk!.choices[0].finish_reason).toBeNull()
    })

    it("omits role on subsequent chunks", () => {
      const state = createStreamState("test-model")
      convertStreamPart({ type: "text-delta", text: "Hello" }, state)
      const chunk = convertStreamPart({ type: "text-delta", text: " world" }, state)
      
      expect(chunk!.choices[0].delta.role).toBeUndefined()
      expect(chunk!.choices[0].delta.content).toBe(" world")
    })
  })

  describe("tool-call", () => {
    it("converts complete tool-call", () => {
      const state = createStreamState("test-model")
      const chunk = convertStreamPart({
        type: "tool-call",
        toolCallId: "call_123",
        toolName: "get_weather",
        args: { location: "NYC" },
      }, state)
      
      expect(chunk).not.toBeNull()
      expect(chunk!.choices[0].delta.role).toBe("assistant")
      expect(chunk!.choices[0].delta.tool_calls).toHaveLength(1)
      expect(chunk!.choices[0].delta.tool_calls![0]).toEqual({
        index: 0,
        id: "call_123",
        type: "function",
        function: {
          name: "get_weather",
          arguments: '{"location":"NYC"}',
        },
      })
    })

    it("assigns sequential indices to multiple tool calls", () => {
      const state = createStreamState("test-model")
      
      const chunk1 = convertStreamPart({
        type: "tool-call",
        toolCallId: "call_1",
        toolName: "tool_a",
        args: {},
      }, state)
      
      const chunk2 = convertStreamPart({
        type: "tool-call",
        toolCallId: "call_2",
        toolName: "tool_b",
        args: {},
      }, state)
      
      expect(chunk1!.choices[0].delta.tool_calls![0].index).toBe(0)
      expect(chunk2!.choices[0].delta.tool_calls![0].index).toBe(1)
    })
  })

  describe("tool-input streaming", () => {
    it("converts tool-input-start with id and name", () => {
      const state = createStreamState("test-model")
      const chunk = convertStreamPart({
        type: "tool-input-start",
        toolCallId: "call_123",
        toolName: "get_weather",
      }, state)
      
      expect(chunk).not.toBeNull()
      expect(chunk!.choices[0].delta.tool_calls![0]).toEqual({
        index: 0,
        id: "call_123",
        type: "function",
        function: {
          name: "get_weather",
        },
      })
    })

    it("converts tool-input-delta with arguments fragment", () => {
      const state = createStreamState("test-model")
      
      // First start the tool call
      convertStreamPart({
        type: "tool-input-start",
        toolCallId: "call_123",
        toolName: "get_weather",
      }, state)
      
      // Then send delta
      const chunk = convertStreamPart({
        type: "tool-input-delta",
        toolCallId: "call_123",
        toolName: "get_weather",
        inputTextDelta: '{"loc',
      }, state)
      
      expect(chunk).not.toBeNull()
      expect(chunk!.choices[0].delta.tool_calls![0]).toEqual({
        index: 0,
        function: {
          arguments: '{"loc',
        },
      })
    })

    it("returns null for tool-input-delta without prior start", () => {
      const state = createStreamState("test-model")
      const chunk = convertStreamPart({
        type: "tool-input-delta",
        toolCallId: "unknown_call",
        toolName: "get_weather",
        inputTextDelta: '{"loc',
      }, state)
      
      expect(chunk).toBeNull()
    })
  })

  describe("finish", () => {
    it("converts finish with stop reason", () => {
      const state = createStreamState("test-model")
      const chunk = convertStreamPart({
        type: "finish",
        finishReason: "stop",
        usage: { inputTokens: 10, outputTokens: 20 },
      }, state)
      
      expect(chunk).not.toBeNull()
      expect(chunk!.choices[0].delta).toEqual({})
      expect(chunk!.choices[0].finish_reason).toBe("stop")
      expect(chunk!.usage).toEqual({
        prompt_tokens: 10,
        completion_tokens: 20,
        total_tokens: 30,
      })
    })

    it("converts tool-calls finish reason", () => {
      const state = createStreamState("test-model")
      const chunk = convertStreamPart({
        type: "finish",
        finishReason: "tool-calls",
      }, state)
      
      expect(chunk!.choices[0].finish_reason).toBe("tool_calls")
    })

    it("converts length finish reason", () => {
      const state = createStreamState("test-model")
      const chunk = convertStreamPart({
        type: "finish",
        finishReason: "length",
      }, state)
      
      expect(chunk!.choices[0].finish_reason).toBe("length")
    })

    it("converts content-filter finish reason", () => {
      const state = createStreamState("test-model")
      const chunk = convertStreamPart({
        type: "finish",
        finishReason: "content-filter",
      }, state)
      
      expect(chunk!.choices[0].finish_reason).toBe("content_filter")
    })
  })

  describe("ignored parts", () => {
    const ignoredTypes = [
      "start",
      "start-step",
      "text-start",
      "text-end",
      "tool-input-end",
      "finish-step",
      "reasoning-start",
      "reasoning-delta",
      "reasoning-end",
      "source",
      "file",
      "tool-result",
      "raw",
      "error",
      "tool-error",
      "abort",
    ]

    for (const type of ignoredTypes) {
      it(`returns null for ${type}`, () => {
        const state = createStreamState("test-model")
        const chunk = convertStreamPart({ type }, state)
        expect(chunk).toBeNull()
      })
    }
  })

  describe("chunk consistency", () => {
    it("uses same id for all chunks in a stream", () => {
      const state = createStreamState("test-model")
      
      const chunk1 = convertStreamPart({ type: "text-delta", text: "a" }, state)
      const chunk2 = convertStreamPart({ type: "text-delta", text: "b" }, state)
      const chunk3 = convertStreamPart({ type: "finish", finishReason: "stop" }, state)
      
      expect(chunk1!.id).toBe(chunk2!.id)
      expect(chunk2!.id).toBe(chunk3!.id)
    })

    it("uses same created timestamp for all chunks", () => {
      const state = createStreamState("test-model")
      
      const chunk1 = convertStreamPart({ type: "text-delta", text: "a" }, state)
      const chunk2 = convertStreamPart({ type: "finish", finishReason: "stop" }, state)
      
      expect(chunk1!.created).toBe(chunk2!.created)
    })
  })
})

describe("createErrorChunk", () => {
  it("creates error chunk from Error instance", () => {
    const chunk = createErrorChunk(new Error("Something went wrong"))
    
    expect(chunk).toEqual({
      error: {
        message: "Something went wrong",
        type: "api_error",
        code: null,
      },
    })
  })

  it("creates error chunk from string", () => {
    const chunk = createErrorChunk("Connection failed")
    
    expect(chunk).toEqual({
      error: {
        message: "Connection failed",
        type: "api_error",
        code: null,
      },
    })
  })

  it("creates error chunk from unknown type", () => {
    const chunk = createErrorChunk({ custom: "error" })
    
    expect(chunk.error.message).toBe("[object Object]")
  })
})
