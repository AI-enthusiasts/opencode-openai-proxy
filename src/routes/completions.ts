import { Hono } from "hono"
import { streamSSE } from "hono/streaming"
import type { Context } from "hono"
import { generateText, streamText, type LanguageModel } from "ai"
import type { ChatCompletionRequest } from "../types"
import { getRuntime, parseModel, isOAuthProvider } from "../runtime"
import { convertMessages, convertTools } from "../converters/request"
import { convertResponse } from "../converters/response"
import { createStreamState, convertStreamPart, createErrorChunk } from "../converters/stream"

const CLAUDE_CODE_SYSTEM_PREFIX = "You are Claude Code, Anthropic's official CLI for Claude."

/**
 * Core completion handler shared by both routing modes:
 * - /v1/chat/completions (provider from model name: "openai/gpt-4.1-nano")
 * - /v1/:provider/chat/completions (provider from URL, model without prefix)
 */
async function handleCompletion(c: Context, providerID: string, modelID: string, body: ChatCompletionRequest) {
  const runtime = getRuntime()
  const languageModel = (await runtime.getLanguageModel(providerID, modelID)) as LanguageModel

  const toolCallMap = new Map<string, string>()
  const messages = convertMessages(body.messages, toolCallMap)
  const tools = convertTools(body.tools)

  // Anthropic OAuth requires Claude Code system prompt prefix
  const needsSystemPrefix = providerID === "anthropic" && await isOAuthProvider(providerID)
  const system = needsSystemPrefix ? CLAUDE_CODE_SYSTEM_PREFIX : undefined

  // Canonical model name for response (always "provider/model")
  const fullModelName = `${providerID}/${modelID}`

  if (body.stream) {
    return streamSSE(c, async (stream) => {
      const state = createStreamState(fullModelName)

      try {
        const result = streamText({
          model: languageModel,
          system,
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
          if (part.type === "error" || part.type === "tool-error") {
            const errorChunk = createErrorChunk(part.error)
            await stream.writeSSE({ data: JSON.stringify(errorChunk) })
            return
          }

          const chunk = convertStreamPart(part, state)
          if (chunk) {
            await stream.writeSSE({ data: JSON.stringify(chunk) })
          }
        }

        await stream.writeSSE({ data: "[DONE]" })
      } catch (error) {
        const errorChunk = createErrorChunk(error)
        await stream.writeSSE({ data: JSON.stringify(errorChunk) })
      }
    })
  }

  const result = await generateText({
    model: languageModel,
    system,
    messages,
    tools,
    temperature: body.temperature,
    maxOutputTokens: body.max_tokens,
    topP: body.top_p,
    frequencyPenalty: body.frequency_penalty,
    presencePenalty: body.presence_penalty,
    stopSequences: body.stop ? (Array.isArray(body.stop) ? body.stop : [body.stop]) : undefined,
  })

  const response = convertResponse(result, fullModelName)
  return c.json(response)
}

/**
 * Classic route: POST /v1/chat/completions
 * Model format: "provider/model" (e.g. "openai/gpt-4.1-nano")
 */
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
  return handleCompletion(c, providerID, modelID, body)
})

/**
 * Provider-scoped route: POST /v1/:provider/chat/completions
 * Provider from URL path, model in body without prefix (e.g. "gpt-4.1-nano").
 * If model still has a prefix, it is used as-is for backwards compatibility.
 */
const providerCompletions = new Hono<{ Variables: { provider: string } }>()

providerCompletions.post("/", async (c) => {
  const providerID = c.req.param("provider")
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

  // If model contains "/", client sent full "provider/model" — use as-is
  // Otherwise, model is just the model name — combine with URL provider
  let resolvedProvider = providerID
  let resolvedModel = body.model
  if (body.model.includes("/")) {
    const parsed = parseModel(body.model)
    resolvedProvider = parsed.providerID
    resolvedModel = parsed.modelID
  }

  return handleCompletion(c, resolvedProvider, resolvedModel, body)
})

export { completions, providerCompletions }
