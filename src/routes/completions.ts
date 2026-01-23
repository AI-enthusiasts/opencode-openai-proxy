import { Hono } from "hono"
import { generateText, type LanguageModel } from "ai"
import type { ChatCompletionRequest } from "../types"
import { getRuntime, parseModel } from "../runtime"
import { convertMessages, convertTools } from "../converters/request"
import { convertResponse } from "../converters/response"

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

  if (body.stream) {
    return c.json(
      { error: { message: "Streaming not implemented yet", type: "api_error", code: null } },
      501
    )
  }

  const { providerID, modelID } = parseModel(body.model)
  const runtime = getRuntime()
  const languageModel = (await runtime.getLanguageModel(providerID, modelID)) as LanguageModel

  const toolCallMap = new Map<string, string>()
  const messages = convertMessages(body.messages, toolCallMap)
  const tools = convertTools(body.tools)

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
