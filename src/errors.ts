import {
  AISDKError,
  APICallError,
  InvalidPromptError,
  LoadAPIKeyError,
  NoContentGeneratedError,
  NoSuchModelError,
} from "@ai-sdk/provider"
import {
  InvalidArgumentError,
  InvalidToolArgumentsError,
  NoSuchProviderError,
  NoSuchToolError,
  RetryError,
} from "ai"

export type OpenAIErrorType =
  | "invalid_request_error"
  | "authentication_error"
  | "permission_error"
  | "not_found_error"
  | "rate_limit_error"
  | "api_error"
  | "server_error"

export interface OpenAIErrorResponse {
  error: {
    message: string
    type: OpenAIErrorType
    code: string | null
  }
}

import type { ContentfulStatusCode } from "hono/utils/http-status"

export interface MappedError {
  status: ContentfulStatusCode
  response: OpenAIErrorResponse
}

export function mapToOpenAIError(error: unknown): MappedError {
  const message = error instanceof Error ? error.message : String(error)

  if (APICallError.isInstance(error)) {
    const statusCode = (error.statusCode ?? 500) as ContentfulStatusCode
    return {
      status: statusCode,
      response: {
        error: {
          message,
          type: mapStatusToErrorType(statusCode),
          code: null,
        },
      },
    }
  }

  if (
    InvalidArgumentError.isInstance(error) ||
    InvalidPromptError.isInstance(error) ||
    NoSuchToolError.isInstance(error) ||
    InvalidToolArgumentsError.isInstance(error)
  ) {
    return {
      status: 400,
      response: {
        error: {
          message,
          type: "invalid_request_error",
          code: null,
        },
      },
    }
  }

  if (NoSuchModelError.isInstance(error) || NoSuchProviderError.isInstance(error)) {
    return {
      status: 404,
      response: {
        error: {
          message,
          type: "not_found_error",
          code: null,
        },
      },
    }
  }

  if (LoadAPIKeyError.isInstance(error)) {
    return {
      status: 401,
      response: {
        error: {
          message,
          type: "authentication_error",
          code: null,
        },
      },
    }
  }

  if (RetryError.isInstance(error)) {
    return {
      status: 502,
      response: {
        error: {
          message,
          type: "api_error",
          code: null,
        },
      },
    }
  }

  if (NoContentGeneratedError.isInstance(error)) {
    return {
      status: 500,
      response: {
        error: {
          message: message || "No content generated",
          type: "api_error",
          code: null,
        },
      },
    }
  }

  return {
    status: 500,
    response: {
      error: {
        message,
        type: "api_error",
        code: null,
      },
    },
  }
}

function mapStatusToErrorType(statusCode: number): OpenAIErrorType {
  if (statusCode === 401) return "authentication_error"
  if (statusCode === 403) return "permission_error"
  if (statusCode === 404) return "not_found_error"
  if (statusCode === 429) return "rate_limit_error"
  if (statusCode >= 400 && statusCode < 500) return "invalid_request_error"
  if (statusCode >= 500) return "server_error"
  return "api_error"
}
