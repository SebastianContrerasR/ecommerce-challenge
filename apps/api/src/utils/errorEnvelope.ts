export interface ErrorEnvelope {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

export function buildErrorEnvelope(
  code: string,
  message: string,
  details?: Record<string, unknown>,
): ErrorEnvelope {
  if (details === undefined) {
    return { error: { code, message } };
  }
  return { error: { code, message, details } };
}
