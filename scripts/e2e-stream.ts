#!/usr/bin/env bun
/**
 * E2E streaming test - outputs inference in real-time to stdout.
 * 
 * Usage:
 *   bun run scripts/e2e-stream.ts
 *   
 * Environment:
 *   OPENCODE_DATA_DIR - Custom path to opencode data dir (default: ~/.local/share/opencode)
 *   MODEL - Model to use (default: anthropic/claude-sonnet-4-20250514)
 *   PORT - Server port (default: 8080)
 *   SKIP_STREAMING - Set to "1" to skip streaming test (for providers that don't support it)
 */

const MODEL = process.env.MODEL || "anthropic/claude-sonnet-4-20250514"
const PORT = process.env.PORT || "8080"
const BASE_URL = `http://localhost:${PORT}`

async function testStreaming() {
  console.log(`\n🚀 E2E Streaming Test`)
  console.log(`   Model: ${MODEL}`)
  console.log(`   Server: ${BASE_URL}`)
  console.log(`   Data dir: ${process.env.OPENCODE_DATA_DIR || "(default)"}\n`)
  console.log("─".repeat(60))
  console.log()

  const response = await fetch(`${BASE_URL}/v1/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      stream: true,
      messages: [
        {
          role: "user",
          content: "Write a haiku about programming. Be creative!",
        },
      ],
    }),
  })

  if (!response.ok) {
    const error = await response.text()
    console.error(`❌ HTTP ${response.status}: ${error}`)
    process.exit(1)
  }

  if (!response.body) {
    console.error("❌ No response body")
    process.exit(1)
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ""
  let fullText = ""
  let chunkCount = 0

  process.stdout.write("📝 Response: ")

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split("\n")
    buffer = lines.pop() || ""

    for (const line of lines) {
      if (!line.startsWith("data: ")) continue
      const data = line.slice(6)

      if (data === "[DONE]") {
        process.stdout.write("\n")
        continue
      }

      try {
        const chunk = JSON.parse(data)
        chunkCount++

        // Check for error
        if (chunk.error) {
          console.error(`\n❌ Error: ${chunk.error.message}`)
          process.exit(1)
        }

        // Extract content
        const delta = chunk.choices?.[0]?.delta
        if (delta?.content) {
          process.stdout.write(delta.content)
          fullText += delta.content
        }

        // Check finish reason
        const finishReason = chunk.choices?.[0]?.finish_reason
        if (finishReason) {
          process.stdout.write(`\n\n`)
        }
      } catch {
        // Ignore parse errors for partial data
      }
    }
  }

  console.log("─".repeat(60))
  console.log(`\n✅ Streaming complete!`)
  console.log(`   Chunks received: ${chunkCount}`)
  console.log(`   Total characters: ${fullText.length}`)
}

async function testNonStreaming() {
  console.log(`\n🔄 Non-streaming test...`)

  const response = await fetch(`${BASE_URL}/v1/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      stream: false,
      messages: [
        {
          role: "user",
          content: "Say 'Hello from non-streaming!' in exactly those words.",
        },
      ],
    }),
  })

  if (!response.ok) {
    const error = await response.text()
    console.error(`❌ HTTP ${response.status}: ${error}`)
    process.exit(1)
  }

  const result = await response.json()
  const content = result.choices?.[0]?.message?.content

  console.log(`   Response: ${content}`)
  console.log(`   Tokens: ${result.usage?.total_tokens || "N/A"}`)
  console.log(`✅ Non-streaming works!`)
}

async function main() {
  // Check server is running
  try {
    const health = await fetch(`${BASE_URL}/health`)
    if (!health.ok) throw new Error("Health check failed")
  } catch {
    console.error(`❌ Server not running at ${BASE_URL}`)
    console.error(`   Start it with: bun run start`)
    process.exit(1)
  }

  if (process.env.SKIP_STREAMING !== "1") {
    await testStreaming()
  } else {
    console.log(`\n⏭️  Skipping streaming test (SKIP_STREAMING=1)`)
  }
  await testNonStreaming()

  console.log(`\n🎉 All E2E tests passed!\n`)
}

main().catch((err) => {
  console.error(`\n❌ Fatal error: ${err.message}`)
  process.exit(1)
})
