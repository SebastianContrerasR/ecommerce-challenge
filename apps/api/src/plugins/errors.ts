import type { FastifyInstance } from "fastify";
import { buildErrorEnvelope } from "../utils/errorEnvelope.js";

interface ValidationLikeError extends Error {
  validation?: unknown;
  statusCode?: number;
}

function isDomainError(error: unknown): error is Error & {
  code: string;
  statusCode: number;
  details?: Record<string, unknown>;
} {
  if (typeof error !== "object" || error === null) {
    return false;
  }
  const candidate = error as { code?: unknown; statusCode?: unknown };
  return typeof candidate.code === "string" && typeof candidate.statusCode === "number";
}

function isValidationError(error: unknown): error is ValidationLikeError {
  if (typeof error !== "object" || error === null) {
    return false;
  }
  return "validation" in error;
}

function multipartErrorCode(error: unknown): "FILE_TOO_LARGE" | "IMPORT_MISSING_FILE" | null {
  if (typeof error !== "object" || error === null) {
    return null;
  }
  const code = (error as { code?: unknown }).code;
  if (code === "FST_REQ_FILE_TOO_LARGE") {
    return "FILE_TOO_LARGE";
  }
  if (code === "FST_INVALID_MULTIPART_CONTENT_TYPE") {
    return "IMPORT_MISSING_FILE";
  }
  return null;
}

export async function registerErrorHandlers(app: FastifyInstance): Promise<void> {
  app.setNotFoundHandler(async (request, reply) => {
    await reply
      .status(404)
      .send(buildErrorEnvelope("NOT_FOUND", `Route not found: ${request.url}`));
  });

  app.setErrorHandler(async (rawError: Error, request, reply) => {
    const multipartCode = multipartErrorCode(rawError);
    if (multipartCode === "FILE_TOO_LARGE") {
      await reply
        .status(413)
        .send(buildErrorEnvelope("FILE_TOO_LARGE", "Uploaded file exceeds the size limit"));
      return;
    }
    if (multipartCode === "IMPORT_MISSING_FILE") {
      await reply
        .status(400)
        .send(buildErrorEnvelope("IMPORT_MISSING_FILE", 'Expected multipart file field "file"'));
      return;
    }
    if (isValidationError(rawError)) {
      const message = rawError.message !== "" ? rawError.message : "Request failed";
      await reply.status(400).send(
        buildErrorEnvelope("VALIDATION_ERROR", message, {
          validation: rawError.validation ?? null,
        }),
      );
      return;
    }
    if (isDomainError(rawError)) {
      const message = rawError.message !== "" ? rawError.message : "Request failed";
      if (rawError.statusCode >= 500) {
        request.log.error(rawError);
      }
      await reply
        .status(rawError.statusCode)
        .send(buildErrorEnvelope(rawError.code, message, rawError.details));
      return;
    }
    const maybeStatus = (rawError as { statusCode?: unknown }).statusCode;
    const statusCode = typeof maybeStatus === "number" ? maybeStatus : 500;
    const message = rawError.message !== "" ? rawError.message : "Request failed";

    if (statusCode >= 500) {
      request.log.error(rawError);
      await reply.status(500).send(buildErrorEnvelope("INTERNAL_ERROR", "Internal server error"));
      return;
    }

    await reply.status(statusCode).send(buildErrorEnvelope("REQUEST_ERROR", message));
  });
}
