import { Hono } from "hono"
import { mapToOpenAIError } from "./errors"
import { completions, providerCompletions } from "./routes/completions"
import { models } from "./routes/models"

const app = new Hono()

app.onError((err, c) => {
  const { status, response } = mapToOpenAIError(err)
  return c.json(response, status)
})

app.get("/health", (c) => {
  return c.json({ status: "ok" })
})

// Classic: POST /v1/chat/completions with model="provider/model"
app.route("/v1/chat/completions", completions)

// Provider-scoped: POST /v1/:provider/chat/completions with model="model"
// Allows litellm's openai/ provider to work without custom_llm_provider hacks
app.route("/v1/:provider/chat/completions", providerCompletions)

app.route("/v1/models", models)

const port = parseInt(process.env.PORT || "8080", 10)

export default {
  port,
  fetch: app.fetch,
}

console.log(`Server starting on port ${port}`)
