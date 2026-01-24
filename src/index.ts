import { Hono } from "hono"
import { mapToOpenAIError } from "./errors"
import { completions } from "./routes/completions"
import { models } from "./routes/models"

const app = new Hono()

app.onError((err, c) => {
  const { status, response } = mapToOpenAIError(err)
  return c.json(response, status)
})

app.get("/health", (c) => {
  return c.json({ status: "ok" })
})

app.route("/v1/chat/completions", completions)
app.route("/v1/models", models)

const port = parseInt(process.env.PORT || "8080", 10)

export default {
  port,
  fetch: app.fetch,
}

console.log(`Server starting on port ${port}`)
