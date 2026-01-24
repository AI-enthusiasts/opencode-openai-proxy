import { Hono } from "hono"
import { streamSSE } from "hono/streaming"
import { generateText, streamText, type LanguageModel } from "ai"
import type { ChatCompletionRequest } from "../types"
import { getRuntime, parseModel } from "../runtime"
import { convertMessages, convertTools } from "../converters/request"
import { convertResponse } from "../converters/response"
import { createStreamState, convertStreamPart, createErrorChunk } from "../converters/stream"

const completions = new Hono()

completions.post("/", async (c) => {
  const body = await c.req.json<ChatCompletionRequest>()

  if (!body.model) {
    return c.json(
      { error: { message: "model is required", type: "invalid_request_error", code: null } },
      400
    )
  }

  if (!body.messages || body.messages.length === 0) {
    return c.json(
      { error: { message: "messages is required", type: "invalid_request_error", code: null } },
      400
    )
  }

  const { providerID, modelID } = parseModel(body.model)
  const runtime = getRuntime()
  const languageModel = (await runtime.getLanguageModel(providerID, modelID)) as LanguageModel

  const toolCallMap = new Map<string, string>()
  const messages = convertMessages(body.messages, toolCallMap)
  const tools = convertTools(body.tools)

  // Streaming mode
  if (body.stream) {
    return streamSSE(c, async (stream) => {
      const state = createStreamState(body.model)

      try {
        const result = streamText({
          model: languageModel,
          messages,
          tools,
          temperature: body.temperature,
          maxOutputTokens: body.max_tokens,
          topP: body.top_p,
          frequencyPenalty: body.frequency_penalty,
          presencePenalty: body.presence_penalty,
          stopSequences: body.stop ? (Array.isArray(body.stop) ? body.stop : [body.stop]) : undefined,
        })

        for await (const part of result.fullStream) {
          // Handle error parts
          if (part.type === "error" || part.type === "tool-error") {
            const errorChunk = createErrorChunk(part.error)
            await stream.writeSSE({ data: JSON.stringify(errorChunk) })
            return // Close stream after error, no [DONE]
          }

          const chunk = convertStreamPart(part, state)
          if (chunk) {
            await stream.writeSSE({ data: JSON.stringify(chunk) })
          }
        }

        // Send [DONE] marker
        await stream.writeSSE({ data: "[DONE]" })
      } catch (error) {
        // Mid-stream error - send as SSE event, not HTTP status
        const errorChunk = createErrorChunk(error)
        await stream.writeSSE({ data: JSON.stringify(errorChunk) })
        // No [DONE] after error
      }
    })
  }

  // Non-streaming mode
  const result = await generateText({
    model: languageModel,
    messages,
    tools,
    temperature: body.temperature,
    maxOutputTokens: body.max_tokens,
    topP: body.top_p,
    frequencyPenalty: body.frequency_penalty,
    presencePenalty: body.presence_penalty,
    stopSequences: body.stop ? (Array.isArray(body.stop) ? body.stop : [body.stop]) : undefined,
  })

  const response = convertResponse(result, body.model)
  return c.json(response)
})

export { completions }
