import { Hono } from "hono"
import { mapToOpenAIError } from "./errors"
import { completions } from "./routes/completions"

const app = new Hono()

app.onError((err, c) => {
  const { status, response } = mapToOpenAIError(err)
  return c.json(response, status)
})

app.get("/health", (c) => {
  return c.json({ status: "ok" })
})

app.route("/v1/chat/completions", completions)

app.get("/v1/models", (c) => {
  return c.json(
    { error: { message: "Not implemented", type: "api_error", code: null } },
    501
  )
})

const port = parseInt(process.env.PORT || "8080", 10)

export default {
  port,
  fetch: app.fetch,
}

console.log(`Server starting on port ${port}`)
