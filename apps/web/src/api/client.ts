export function getApiBaseUrl(): string {
  const fromEnv = import.meta.env["VITE_API_URL"];
  if (typeof fromEnv === "string" && fromEnv !== "") {
    return fromEnv.replace(/\/$/, "");
  }
  return "http://localhost:3000";
}

export interface ApiStatus {
  live: unknown;
  ready: unknown;
  error: string | null;
}

export async function fetchApiStatus(baseUrl: string): Promise<ApiStatus> {
  try {
    const [liveResponse, readyResponse] = await Promise.all([
      fetch(`${baseUrl}/live`),
      fetch(`${baseUrl}/ready`),
    ]);
    const live = await liveResponse.json();
    const ready = await readyResponse.json();
    return { live, ready, error: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return { live: null, ready: null, error: message };
  }
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details: unknown;

  constructor(code: string, message: string, status: number, details: unknown = undefined) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

function isErrorBody(value: unknown): value is ApiErrorBody {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const error = (value as { error?: unknown }).error;
  if (typeof error !== "object" || error === null) {
    return false;
  }
  const typed = error as { code?: unknown; message?: unknown };
  return typeof typed.code === "string" && typeof typed.message === "string";
}

export async function apiFetch(
  baseUrl: string,
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(`${baseUrl}${path}`, init);
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : "Network request failed", {
      cause: error,
    });
  }
  if (response.ok) {
    return response;
  }
  const body: unknown = await response.json().catch(() => undefined);
  if (isErrorBody(body)) {
    throw new ApiError(body.error.code, body.error.message, response.status, body.error.details);
  }
  throw new ApiError(
    "REQUEST_FAILED",
    `Request failed with status ${response.status}`,
    response.status,
  );
}

export async function readJson<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}
