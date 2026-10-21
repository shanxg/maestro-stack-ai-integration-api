// 1. IMPORTS: Jest utilities, Node helpers to read the frontend sources, and the frontend API client.
// The frontend has no test runner of its own, so its client is tested in the API suite (issue #54),
// like the security headers in tests/frontendSecurity.spec.ts.
import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { ApiError, apiRequest } from '../frontend/app/utils/apiClient.ts';
import { SESSION_FLAG_KEY } from '../frontend/app/utils/session.ts';

// 2. BROWSER STAND-INS: the client runs in the browser, and Jest runs in Node. session.ts needs
// localStorage and window.dispatchEvent; a Map-backed storage and an EventTarget are enough.
function installBrowserGlobals() {
  const items = new Map<string, string>();
  const storage = {
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => void items.set(key, value),
    removeItem: (key: string) => void items.delete(key)
  };
  const browserWindow = new EventTarget();
  Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true, writable: true });
  Object.defineProperty(globalThis, 'window', { value: browserWindow, configurable: true, writable: true });
  return { storage, browserWindow };
}

// A Response like the API sends: JSON body (or none) and a status.
const jsonResponse = (status: number, body?: unknown) =>
  new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });

describe('Frontend API client (frontend/app/utils/apiClient.ts)', () => {
  const originalApiUrl = process.env.NEXT_PUBLIC_API_URL;
  const originalFetch = globalThis.fetch;
  let fetchMock: jest.Mock<typeof fetch>;
  let browser: ReturnType<typeof installBrowserGlobals>;

  beforeEach(() => {
    browser = installBrowserGlobals();
    // Replace the network: each test decides what the API answers.
    fetchMock = jest.fn<typeof fetch>();
    globalThis.fetch = fetchMock;
    delete process.env.NEXT_PUBLIC_API_URL;
  });

  afterEach(() => {
    jest.restoreAllMocks();
    globalThis.fetch = originalFetch;
    if (originalApiUrl === undefined) delete process.env.NEXT_PUBLIC_API_URL;
    else process.env.NEXT_PUBLIC_API_URL = originalApiUrl;
  });

  // TEST 1: Verify every call goes to the API set in NEXT_PUBLIC_API_URL, with the session cookie and JSON.
  // Condition: The login and register pages hardcoded http://localhost:3000 and register sent no
  // credentials option; the client must use the configured origin, credentials: 'include', a JSON
  // body with its Content-Type, and return the parsed answer.
  it('sends JSON with credentials to NEXT_PUBLIC_API_URL and returns the parsed body', async () => {
    process.env.NEXT_PUBLIC_API_URL = 'https://api.maestro.example';
    fetchMock.mockResolvedValue(jsonResponse(200, { response: 'Hello' }));

    const data = await apiRequest<{ response: string }>('/api/v1/ai/chat', { method: 'POST', body: { prompt: 'oi' } });

    expect(data).toEqual({ response: 'Hello' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://api.maestro.example/api/v1/ai/chat');
    expect(init).toMatchObject({
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: 'oi' })
    });

    // Without the variable, the local development API is the default (frontend/.env.example).
    delete process.env.NEXT_PUBLIC_API_URL;
    fetchMock.mockResolvedValue(jsonResponse(204));
    await expect(apiRequest('/api/v1/auth/logout', { method: 'POST' })).resolves.toBeUndefined();
    const [logoutUrl, logoutInit] = fetchMock.mock.calls[1]!;
    expect(logoutUrl).toBe('http://localhost:3000/api/v1/auth/logout');
    // A request without a body sends no Content-Type header.
    expect(logoutInit?.headers).toBeUndefined();
    expect(logoutInit?.credentials).toBe('include');
  });

  // TEST 2: Verify a 401 on a call that needs a session signs the page out.
  // Condition: The API answers 401 (session expired); the client must clear the "signed in" flag,
  // fire the 'storage' event the chat page listens to (it redirects to /login), and throw an
  // ApiError with the status, code and the API's message.
  it('clears the signed-in flag and throws ApiError on a 401 for a session call', async () => {
    browser.storage.setItem(SESSION_FLAG_KEY, '1');
    const storageEvents: Event[] = [];
    browser.browserWindow.addEventListener('storage', (event) => storageEvents.push(event));
    fetchMock.mockResolvedValue(jsonResponse(401, { error: { code: 'UNAUTHORIZED', message: 'Session expired.' } }));

    const failure = await apiRequest('/api/v1/ai/chat', { method: 'POST', body: { prompt: 'oi' } }).catch(
      (error: unknown) => error
    );

    expect(failure).toBeInstanceOf(ApiError);
    expect(failure).toMatchObject({ status: 401, code: 'UNAUTHORIZED', message: 'Session expired.' });
    expect(browser.storage.getItem(SESSION_FLAG_KEY)).toBeNull();
    expect(storageEvents).toHaveLength(1);
  });

  // TEST 3: Verify a 401 on the login call keeps the flag and shows the API's message.
  // Condition: On login a 401 means "wrong credentials"; with requiresSession: false the flag that
  // another tab may still use stays, and the error carries the message the page displays.
  it('keeps the signed-in flag on a 401 for the login call', async () => {
    browser.storage.setItem(SESSION_FLAG_KEY, '1');
    fetchMock.mockResolvedValue(
      jsonResponse(401, { error: { code: 'INVALID_CREDENTIALS', message: 'Invalid credentials.' } })
    );

    const failure = await apiRequest('/api/v1/auth/login', {
      method: 'POST',
      body: { username: 'someone@maestro.test', password: crypto.randomUUID() },
      requiresSession: false
    }).catch((error: unknown) => error);

    expect(failure).toMatchObject({ status: 401, code: 'INVALID_CREDENTIALS', message: 'Invalid credentials.' });
    expect(browser.storage.getItem(SESSION_FLAG_KEY)).toBe('1');
  });

  // TEST 4: Verify failures without an API message still reach the page as a readable ApiError.
  // Condition: An error status with no envelope uses the caller's fallback message; a body that is
  // not JSON (a proxy's HTML page) and a network failure (fetch rejects) get fixed English
  // messages instead of a crash in response.json() or the browser's English "Failed to fetch".
  it('turns envelope-less errors, non-JSON bodies and network failures into ApiError', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined); // The client logs the network error

    fetchMock.mockResolvedValueOnce(jsonResponse(502, { unexpected: true }));
    await expect(
      apiRequest('/api/v1/users', { method: 'POST', fallbackMessage: 'Registration failed.' })
    ).rejects.toMatchObject({ status: 502, code: undefined, message: 'Registration failed.' });

    fetchMock.mockResolvedValueOnce(new Response('<html>Bad Gateway</html>', { status: 502 }));
    await expect(apiRequest('/api/v1/users')).rejects.toMatchObject({
      status: 502,
      message: 'The server returned an invalid response. Check that the API is online.'
    });

    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await expect(apiRequest('/api/v1/users')).rejects.toMatchObject({
      status: 0,
      message: 'Could not connect to the Maestro API. Check that it is online.'
    });
  });

  // TEST 5: Verify the client only calls the API origin.
  // Condition: A full or protocol-relative URL would make new URL() ignore the base URL; the client
  // must refuse it before any request is sent.
  it('refuses a path that points to another origin', async () => {
    for (const foreignPath of ['https://other.example/collect', '//other.example/collect']) {
      await expect(apiRequest(foreignPath)).rejects.toThrow('apiRequest only calls the Maestro API');
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  // TEST 6: Verify no page calls fetch() on its own (issue #54, DRY).
  // Condition: login, register and chat each built their own fetch call; every file under
  // frontend/app except the client itself must go through apiRequest().
  it('frontend/app -> only utils/apiClient.ts calls fetch()', () => {
    const clientFile = path.join('utils', 'apiClient.ts');
    const offenders = fs
      .readdirSync('frontend/app', { recursive: true, encoding: 'utf8' })
      .filter((file) => /\.(tsx?|jsx?)$/.test(file) && path.normalize(file) !== clientFile)
      .filter((file) => /\bfetch\s*\(/.test(fs.readFileSync(path.join('frontend/app', file), 'utf8')));

    expect(offenders).toEqual([]);
  });
});
