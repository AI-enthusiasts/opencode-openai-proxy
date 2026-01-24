import { Hono } from "hono"
import { getRuntime } from "../runtime"

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

models.get("/", async (c) => {
  const runtime = getRuntime()
  const providers = await runtime.listProviders()

  const modelList: OpenAIModel[] = []
  const created = Math.floor(Date.now() / 1000)

  for (const [providerID, providerConfig] of Object.entries(providers)) {
    const config = providerConfig as { models?: Record<string, unknown> }
    if (config.models) {
      for (const modelID of Object.keys(config.models)) {
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

export { models }
