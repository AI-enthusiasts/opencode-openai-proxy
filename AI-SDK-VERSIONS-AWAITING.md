# AI SDK Versions Awaiting Stable Release

## Context

AI SDK 5 (`ai@5.x`) requires providers with `specificationVersion: "v2"`.
Stable releases of most @ai-sdk/* providers still use `specificationVersion: "v3"` (older format).
We use canary versions until stable releases with v2 are available.

## Awaiting Stable Releases (as of 2026-01-23)

| Package | Current | Waiting For |
|---------|---------|-------------|
| `@ai-sdk/anthropic` | `^2.0.0-canary.19` | Stable with specificationVersion v2 |
| `@ai-sdk/google` | `^2.0.0-canary.20` | Stable with specificationVersion v2 |
| `@ai-sdk/google-vertex` | `^3.0.0-canary.20` | Stable with specificationVersion v2 |
| `@ai-sdk/openai` | `^2.0.0-canary.20` | Stable with specificationVersion v2 |

## Already Migrated to Stable

| Package | Version | Notes |
|---------|---------|-------|
| `@ai-sdk/openai-compatible` | `^1.0.31` | Has v2, streaming bug fixed |

## How to Check for Updates

```bash
# Check if stable has specificationVersion v2
npm view @ai-sdk/anthropic dist.tarball | xargs curl -sL | tar -xzOf - package/dist/index.js | grep -o 'specificationVersion = "v[0-9]"' | head -1

# Expected output when ready: specificationVersion = "v2"
# Current stable output: specificationVersion = "v3"
```

## When to Update

When a provider's stable release shows `specificationVersion = "v2"`:

1. Update package.json to stable version (e.g., `^3.0.0` or `^4.0.0`)
2. Run `bun install`
3. Test with relevant models
4. Remove entry from "Awaiting" table above

## References

- Vercel AI SDK releases: https://github.com/vercel/ai/releases
- Issue: canary.19 had streaming bug (`type: "text"` vs `type: "text-delta"`)
