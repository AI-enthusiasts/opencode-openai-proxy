#!/usr/bin/env node
/**
 * Patch rmk40/opencode-anthropic-auth index.mjs to add 1M context window support.
 *
 * Applies the logic from anomalyco PR #46 (feature/context-1m-detection)
 * adapted for the rmk branch's refactored code structure.
 *
 * Changes:
 * 1. Add LONG_CONTEXT_BETA constant after imports
 * 2. Add `let context1m = null` state in AnthropicAuthPlugin closure
 * 3. Modify buildRequestHeaders to accept `use1m` flag
 * 4. Extract eligible1m from body before transformRequestBody
 * 5. Pass use1m to buildRequestHeaders call
 * 6. Add retry logic when 1M beta is rejected
 *
 * Usage: node patches/add-1m-context.mjs <path-to-index.mjs>
 */

import { readFileSync, writeFileSync } from "node:fs";

const file = process.argv[2];
if (!file) {
  console.error("Usage: node add-1m-context.mjs <path-to-index.mjs>");
  process.exit(1);
}

let src = readFileSync(file, "utf-8");
let changes = 0;

// ── 1. Add LONG_CONTEXT_BETA constant after the backoff import line ──
const backoffImport =
  'import { isAccountSpecificError, parseRateLimitReason, parseRetryAfterHeader } from "./lib/backoff.mjs";';
if (!src.includes("LONG_CONTEXT_BETA")) {
  src = src.replace(
    backoffImport,
    backoffImport +
      '\n\nconst LONG_CONTEXT_BETA = "context-1m-2025-08-07";\n' +
      "const ELIGIBLE_1M_PATTERN = /claude-(opus-4-[5-9]|opus-4-\\d{2,}|sonnet-4)/i;\n",
  );
  console.log("  [1/6] Added LONG_CONTEXT_BETA constant");
  changes++;
}

// ── 2. Add `let context1m = null` state in plugin closure ──
const toastMarker = "let lastToastedIndex = -1;";
if (!src.includes("let context1m")) {
  src = src.replace(
    toastMarker,
    toastMarker +
      "\n  /** 1M context: null=unknown, true=available, false=rejected */\n" +
      "  let context1m = null;\n",
  );
  console.log("  [2/6] Added context1m state");
  changes++;
}

// ── 3. Modify buildRequestHeaders to accept use1m parameter ──
const oldSig =
  "function buildRequestHeaders(input, requestInit, accessToken) {";
const newSig =
  "function buildRequestHeaders(input, requestInit, accessToken, use1m = false) {";
if (src.includes(oldSig)) {
  src = src.replace(oldSig, newSig);
  console.log("  [3a/6] Updated buildRequestHeaders signature");
  changes++;
}

// Add LONG_CONTEXT_BETA to requiredBetas when use1m is true
const oldRequiredBetas =
  'const requiredBetas = ["oauth-2025-04-20", "interleaved-thinking-2025-05-14"];';
if (src.includes(oldRequiredBetas) && !src.includes("if (use1m) requiredBetas.push")) {
  src = src.replace(
    oldRequiredBetas,
    'const requiredBetas = ["oauth-2025-04-20", "interleaved-thinking-2025-05-14"];\n' +
      "  if (use1m) requiredBetas.push(LONG_CONTEXT_BETA);",
  );
  console.log("  [3b/6] Added 1M beta to requiredBetas");
  changes++;
}

// ── 4. Extract eligible1m from body before transformRequestBody ──
const bodyTransformLine = "const body = transformRequestBody(requestInit.body);";
if (src.includes(bodyTransformLine) && !src.includes("eligible1m")) {
  src = src.replace(
    bodyTransformLine,
    `// Check if model is eligible for 1M context before body transform
              let eligible1m = false;
              if (requestInit.body && typeof requestInit.body === 'string') {
                try {
                  const preparse = JSON.parse(requestInit.body);
                  if (typeof preparse.model === 'string') {
                    eligible1m = ELIGIBLE_1M_PATTERN.test(preparse.model);
                  }
                } catch {}
              }
              const use1m = eligible1m && context1m !== false;

              const body = transformRequestBody(requestInit.body);`,
  );
  console.log("  [4/6] Added eligible1m extraction");
  changes++;
}

// ── 5. Pass use1m to buildRequestHeaders call ──
const oldHeadersCall =
  "const requestHeaders = buildRequestHeaders(input, requestInit, accessToken);";
if (src.includes(oldHeadersCall)) {
  src = src.replace(
    oldHeadersCall,
    "const requestHeaders = buildRequestHeaders(input, requestInit, accessToken, use1m);",
  );
  console.log("  [5/6] Updated buildRequestHeaders call with use1m");
  changes++;
}

// ── 6. Add retry logic after the main fetch call ──
const retryAnchor = "// On error, check if it's account-specific or service-wide";
if (src.includes(retryAnchor) && !src.includes("1M context probe")) {
  src = src.replace(
    retryAnchor,
    `// 1M context probe: detect rejection and retry without the header
                if (
                  use1m &&
                  context1m !== false &&
                  (response.status === 400 || response.status === 403)
                ) {
                  let errMsg = "";
                  try {
                    const errJson = await response.clone().json();
                    errMsg = (errJson?.error?.message || "").toLowerCase();
                  } catch {
                    try {
                      errMsg = (await response.clone().text()).toLowerCase();
                    } catch {}
                  }
                  if (
                    errMsg.includes("long context beta") &&
                    (errMsg.includes("incompatible") ||
                      errMsg.includes("not yet available") ||
                      errMsg.includes("not available"))
                  ) {
                    context1m = false;
                    debugLog("1M context not available for this subscription, retrying without beta header");
                    // Rebuild headers without 1M beta and retry
                    const retryHeaders = buildRequestHeaders(input, requestInit, accessToken, false);
                    response = await fetch(requestInput, {
                      ...requestInit,
                      body,
                      headers: retryHeaders,
                    });
                  }
                }

                // Mark 1M access confirmed on first successful eligible request
                if (response.ok && eligible1m && context1m === null) {
                  context1m = true;
                  debugLog("1M context confirmed available for this subscription");
                }

                // On error, check if it's account-specific or service-wide`,
  );
  console.log("  [6/6] Added 1M retry logic");
  changes++;
}

writeFileSync(file, src);
console.log(`\n✅ Patched index.mjs with 1M context support (${changes} changes applied)`);
if (changes === 0) {
  console.log("⚠️  No changes applied — file may already be patched or structure changed");
  process.exit(1);
}
