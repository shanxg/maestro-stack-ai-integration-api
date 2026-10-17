/**
 * 📡 MAESTRO API CLIENT (issue #54)
 *
 * The one place where the frontend talks to the Maestro API. Before, the login, register and chat
 * pages each built their own fetch call, and they had drifted apart:
 * - login and register ignored NEXT_PUBLIC_API_URL and always called http://localhost:3000, so a
 *   deployed frontend still posted credentials to the developer's machine;
 * - register sent no credentials option, while login and chat sent 'include';
 * - only the chat page handled a 401, and only register survived a response that was not JSON.
 *
 * Every page now calls apiRequest(), which:
 * 1. builds the URL from NEXT_PUBLIC_API_URL (the same origin the CSP allows in connect-src);
 * 2. always sends credentials: 'include', so the browser attaches the HttpOnly session cookie
 *    (page scripts never see the token, CWE-922) and stores the one the login response sets;
 * 3. sends and reads JSON, and turns the API error envelope { error: { code, message } } into an
 *    ApiError that carries the HTTP status, the code and the Portuguese message for the user;
 * 4. on a 401 for a request that needs a session, clears the "signed in" flag, which sends the
 *    open page back to /login (see session.ts).
 */
import { clearSignedIn } from './session';

// Used when NEXT_PUBLIC_API_URL is not set, which is the local development setup (.env.example).
const DEFAULT_API_URL = 'http://localhost:3000';

// Messages shown when there is no API message to show: the API could not be reached, or it
// answered something that is not the JSON this client expects (for example a proxy error page).
const NETWORK_ERROR_MESSAGE = 'Não foi possível conectar à API do Maestro. Verifique se ela está online.';
const INVALID_RESPONSE_MESSAGE = 'O servidor retornou uma resposta inválida. Verifique se a API está online.';

/**
 * A failed API call. status is the HTTP status (0 when no response arrived) and code is the
 * machine-readable code of the API error envelope, when there was one (e.g. 'VALIDATION_FAILURE').
 * The message is ready to be shown on the page.
 */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export interface ApiRequestOptions {
  // Only the HTTP methods the pages use today.
  method?: 'GET' | 'POST';
  // Serialized as JSON. Left out for requests without a body (such as logout).
  body?: unknown;
  // Shown when the API fails without a message of its own (for example a 502 from a proxy).
  fallbackMessage?: string;
  // True (the default) for calls that act as the signed-in user: a 401 then means the session
  // cookie expired or was cleared, so the "signed in" flag is cleared too. The login call sets it
  // to false, because there a 401 only means "wrong credentials" and must not touch the flag,
  // which another tab may still be using.
  requiresSession?: boolean;
}

// The base URL of the API. Next.js replaces process.env.NEXT_PUBLIC_API_URL with its value at
// build time, so the value is public: it must never hold a secret.
export function apiBaseUrl(): string {
  return process.env.NEXT_PUBLIC_API_URL || DEFAULT_API_URL;
}

/**
 * Calls the Maestro API and returns the parsed JSON body (undefined for an empty body, such as
 * the 204 of logout). Throws ApiError for every failure, so a page needs a single catch.
 *
 * @param path An absolute API path, such as '/api/v1/ai/chat', resolved against the base URL.
 */
export async function apiRequest<T = unknown>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const { method = 'GET', body, fallbackMessage, requiresSession = true } = options;
  const url = new URL(path, apiBaseUrl());

  // The request must stay on the API origin. A full URL ('https://other.example/...') or a
  // protocol-relative one ('//other.example') would make new URL() ignore the base URL; that is a
  // bug in the calling page, so it fails loudly instead of sending the request elsewhere.
  if (url.origin !== new URL(apiBaseUrl()).origin) {
    throw new Error(`apiRequest only calls the Maestro API; refused path: ${path}`);
  }

  // Step A: Send the request. fetch() only rejects when no response arrives at all (API down,
  // DNS failure, CORS refusal); that browser error text is in English and technical, so it is
  // replaced by a message the user can act on. The original error stays in the console.
  let response: Response;
  try {
    response = await fetch(url.href, {
      method,
      // The session cookie travels with every call; the API decides what it authorizes.
      credentials: 'include',
      // Body and Content-Type only when there is a body: a bodiless POST (logout) needs no JSON header.
      ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    });
  } catch (error: unknown) {
    console.error('❌ Falha de rede ao chamar a API do Maestro:', error);
    throw new ApiError(NETWORK_ERROR_MESSAGE, 0);
  }

  // Step B: The session is gone (expired or cleared on the server). Clear the local flag, so the
  // page that needs it redirects to /login. The error still goes back to the caller, which may
  // show its message (login) or stay silent while the redirect runs (chat).
  if (response.status === 401 && requiresSession) {
    clearSignedIn();
  }

  // Step C: Read the body as text first, so an empty body (204) and a body that is not JSON
  // (an HTML error page from a proxy) are both handled instead of crashing response.json().
  const text = await response.text();
  let data: unknown;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      throw new ApiError(INVALID_RESPONSE_MESSAGE, response.status);
    }
  }

  // Step D: Any non-2xx status becomes an ApiError with the API's own message and code
  // (src/middlewares/errorHandler.ts always answers { error: { code, message } }).
  if (!response.ok) {
    const envelope = readErrorEnvelope(data);
    throw new ApiError(
      envelope?.message ?? fallbackMessage ?? INVALID_RESPONSE_MESSAGE,
      response.status,
      envelope?.code
    );
  }

  return data as T;
}

// Reads { error: { code, message } } without trusting its shape: a field that is missing or is not
// a string is ignored, so a malformed answer falls back to the generic message.
function readErrorEnvelope(data: unknown): { code: string | undefined; message: string | undefined } | undefined {
  if (typeof data !== 'object' || data === null) return undefined;
  const error = (data as { error?: unknown }).error;
  if (typeof error !== 'object' || error === null) return undefined;
  const { code, message } = error as { code?: unknown; message?: unknown };
  return {
    code: typeof code === 'string' ? code : undefined,
    message: typeof message === 'string' ? message : undefined
  };
}
