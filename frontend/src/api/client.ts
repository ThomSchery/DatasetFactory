import { ApiError, ApiTransportError, apiErrorFromBody } from "./errors";

/**
 * The single place in the frontend that calls `fetch`. React components never
 * do — `src/test/architecture.test.ts` pins that.
 *
 * Vite proxies `/api` to the loopback FastAPI process in dev (see
 * `vite.config.ts`), so the base path stays relative and no origin is baked in.
 */
export const API_BASE_PATH = "/api/v1";

export type QueryParams = Record<string, string | number | boolean | undefined>;

export interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  query?: QueryParams;
  signal?: AbortSignal;
}

export function buildUrl(path: string, query?: QueryParams): string {
  const url = `${API_BASE_PATH}${path}`;
  if (query === undefined) {
    return url;
  }
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) {
      search.set(key, String(value));
    }
  }
  const serialized = search.toString();
  return serialized === "" ? url : `${url}?${serialized}`;
}

async function readBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text === "") {
    return undefined;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch (cause) {
    throw new ApiTransportError("Odpowiedź serwera nie jest poprawnym JSON-em.", {
      status: response.status,
      cause,
    });
  }
}

/**
 * Performs one request and returns the decoded body.
 *
 * On a non-2xx response the envelope is turned into an `ApiError` carrying
 * `code`, `message`, `details` and `request_id` verbatim. `details` is never
 * flattened, stringified or dropped: `bbox_invalid` transports
 * `annotation_ids` through it.
 */
export async function apiRequest<TResponse>(
  path: string,
  options: RequestOptions = {},
): Promise<TResponse> {
  const { method = "GET", body, query, signal } = options;

  let response: Response;
  try {
    response = await fetch(buildUrl(path, query), {
      method,
      signal,
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === "AbortError") {
      throw cause;
    }
    throw new ApiTransportError("Nie udało się połączyć z lokalnym API.", { cause });
  }

  const payload = await readBody(response);

  if (!response.ok) {
    const apiError = apiErrorFromBody(response.status, payload);
    if (apiError !== null) {
      throw apiError;
    }
    throw new ApiTransportError(
      `Serwer odpowiedział kodem ${String(response.status)} bez koperty błędu.`,
      { status: response.status },
    );
  }

  return payload as TResponse;
}

export type { ApiError };
