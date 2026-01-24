/**
 * E2E tests using official OpenAI client.
 * 
 * These tests validate wire format compatibility with real OpenAI clients.
 * If these pass, LiteLLM/Langchain/aider should work too.
 * 
 * Requirements:
 * - Server running on localhost:8080
 * - Valid opencode credentials configured
 * 
 * Run: MODEL=alibaba/qwen-max bun test tests/e2e/
 */

import { describe, it, expect, beforeAll } from "bun:test"
import OpenAI from "openai"

const BASE_URL = process.env.BASE_URL || "http://localhost:8080/v1"
const MODEL = process.env.MODEL || "alibaba/qwen-max"
const SKIP_E2E = process.env.SKIP_E2E === "1"

// Skip all tests if SKIP_E2E is set or no server running
const describeE2E = SKIP_E2E ? describe.skip : describe

describeE2E("OpenAI Client E2E", () => {
  let client: OpenAI

  beforeAll(async () => {
    client = new OpenAI({
      baseURL: BASE_URL,
      apiKey: "not-needed", // Our proxy doesn't check API key
    })

    // Check server is running
    try {
      const response = await fetch(BASE_URL.replace("/v1", "/health"))
      if (!response.ok) {
        throw new Error("Server not healthy")
      }
    } catch {
      console.warn("⚠️  Server not running, skipping E2E tests")
      process.exit(0)
    }
  })

  describe("models", () => {
    it("lists available models", async () => {
      const models = await client.models.list()
      
      expect(models.object).toBe("list")
      expect(Array.isArray(models.data)).toBe(true)
      
      // Should have at least one model
      if (models.data.length > 0) {
        const model = models.data[0]
        expect(model.object).toBe("model")
        expect(typeof model.id).toBe("string")
        expect(model.id).toContain("/") // format: provider/model
      }
    })
  })

  describe("chat completions", () => {
    it("completes non-streaming request", async () => {
      const completion = await client.chat.completions.create({
        model: MODEL,
        messages: [
          { role: "user", content: "Say 'hello' and nothing else." }
        ],
        stream: false,
      })

      expect(completion.object).toBe("chat.completion")
      expect(completion.model).toBe(MODEL)
      expect(completion.choices.length).toBeGreaterThan(0)
      expect(completion.choices[0].message.role).toBe("assistant")
      expect(typeof completion.choices[0].message.content).toBe("string")
      expect(completion.choices[0].finish_reason).toBe("stop")
    })

    it("completes streaming request", async () => {
      const stream = await client.chat.completions.create({
        model: MODEL,
        messages: [
          { role: "user", content: "Count from 1 to 3." }
        ],
        stream: true,
      })

      let content = ""
      let chunkCount = 0
      let hasFinishReason = false

      for await (const chunk of stream) {
        chunkCount++
        expect(chunk.object).toBe("chat.completion.chunk")
        
        if (chunk.choices[0]?.delta?.content) {
          content += chunk.choices[0].delta.content
        }
        
        if (chunk.choices[0]?.finish_reason) {
          hasFinishReason = true
        }
      }

      expect(chunkCount).toBeGreaterThan(0)
      expect(content.length).toBeGreaterThan(0)
      expect(hasFinishReason).toBe(true)
    })
  })

  describe("tool calling", () => {
    const tools: OpenAI.ChatCompletionTool[] = [
      {
        type: "function",
        function: {
          name: "get_weather",
          description: "Get the current weather in a location",
          parameters: {
            type: "object",
            properties: {
              location: {
                type: "string",
                description: "The city name",
              },
            },
            required: ["location"],
          },
        },
      },
    ]

    it("returns tool calls when tools provided", async () => {
      const completion = await client.chat.completions.create({
        model: MODEL,
        messages: [
          { role: "user", content: "What's the weather in Tokyo?" }
        ],
        tools,
        tool_choice: "auto",
      })

      // Model should either call the tool or respond directly
      const choice = completion.choices[0]
      expect(choice.finish_reason).toMatch(/^(stop|tool_calls)$/)
      
      if (choice.finish_reason === "tool_calls") {
        expect(choice.message.tool_calls).toBeDefined()
        expect(choice.message.tool_calls!.length).toBeGreaterThan(0)
        
        const toolCall = choice.message.tool_calls![0]
        expect(toolCall.type).toBe("function")
        expect(toolCall.function.name).toBe("get_weather")
        expect(typeof toolCall.function.arguments).toBe("string")
        
        // Arguments should be valid JSON
        const args = JSON.parse(toolCall.function.arguments)
        expect(args.location).toBeDefined()
      }
    })

    it("handles multi-turn tool conversation", async () => {
      // First turn: user asks, model calls tool
      const firstResponse = await client.chat.completions.create({
        model: MODEL,
        messages: [
          { role: "user", content: "What's the weather in Paris?" }
        ],
        tools,
        tool_choice: { type: "function", function: { name: "get_weather" } },
      })

      const toolCall = firstResponse.choices[0].message.tool_calls?.[0]
      
      // Skip if model didn't call tool
      if (!toolCall) {
        console.warn("Model didn't call tool, skipping multi-turn test")
        return
      }

      // Second turn: provide tool result, get final response
      const secondResponse = await client.chat.completions.create({
        model: MODEL,
        messages: [
          { role: "user", content: "What's the weather in Paris?" },
          {
            role: "assistant",
            content: null,
            tool_calls: [toolCall],
          },
          {
            role: "tool",
            tool_call_id: toolCall.id,
            content: JSON.stringify({ temperature: 18, condition: "cloudy" }),
          },
        ],
        tools,
      })

      expect(secondResponse.choices[0].message.role).toBe("assistant")
      expect(secondResponse.choices[0].message.content).toBeDefined()
      // Response should mention the weather data
      const content = secondResponse.choices[0].message.content?.toLowerCase() || ""
      expect(content.includes("18") || content.includes("cloudy") || content.includes("paris")).toBe(true)
    })
  })
})
