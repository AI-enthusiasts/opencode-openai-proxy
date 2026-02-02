import { Hono } from "hono"
import { getRuntime, resetRuntime } from "../runtime"

interface OpenAIModel {
  id: string
  object: "model"
  created: number
  owned_by: string
}

interface OpenAIModelsResponse {
  object: "list"
  data: OpenAIModel[]
}

const models = new Hono()

async function listProvidersWithRetry(): Promise<Record<string, unknown>> {
  const runtime = getRuntime()
  try {
    return await runtime.listProviders()
  } catch {
    resetRuntime()
    const retryRuntime = getRuntime()
    return await retryRuntime.listProviders()
  }
}

models.get("/", async (c) => {
  const providers = await listProvidersWithRetry()

  const modelList: OpenAIModel[] = []
  const created = Math.floor(Date.now() / 1000)

  for (const [providerID, providerConfig] of Object.entries(providers)) {
    const config = providerConfig as { info?: { models?: Record<string, unknown> } }
    const models = config.info?.models
    if (models) {
      for (const modelID of Object.keys(models)) {
        modelList.push({
          id: `${providerID}/${modelID}`,
          object: "model",
          created,
          owned_by: providerID,
        })
      }
    }
  }

  const response: OpenAIModelsResponse = {
    object: "list",
    data: modelList,
  }

  return c.json(response)
})

// GET /v1/models/:model - Retrieve a specific model
models.get("/:model{.+}", async (c) => {
  const modelId = c.req.param("model")
  const runtime = getRuntime()
  const providers = await runtime.listProviders()

  // Parse provider/model from the ID
  const slashIndex = modelId.indexOf("/")
  if (slashIndex === -1) {
    return c.json(
      {
        error: {
          message: `The model '${modelId}' does not exist`,
          type: "invalid_request_error",
          param: "model",
          code: "model_not_found",
        },
      },
      404
    )
  }

  const providerID = modelId.slice(0, slashIndex)
  const modelName = modelId.slice(slashIndex + 1)

  const provider = providers[providerID] as { info?: { models?: Record<string, unknown> } } | undefined
  const modelInfo = provider?.info?.models?.[modelName]

  if (!modelInfo) {
    return c.json(
      {
        error: {
          message: `The model '${modelId}' does not exist`,
          type: "invalid_request_error",
          param: "model",
          code: "model_not_found",
        },
      },
      404
    )
  }

  const response: OpenAIModel = {
    id: modelId,
    object: "model",
    created: Math.floor(Date.now() / 1000),
    owned_by: providerID,
  }

  return c.json(response)
})

export { models }
