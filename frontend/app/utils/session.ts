/**
 * 🔐 SESSION FLAG (CWE-922, issue #34)
 *
 * The JWT now lives only in the API's HttpOnly session cookie, which page scripts cannot read, so
 * an XSS can no longer steal it. The frontend keeps just this flag in localStorage to decide whether
 * to show the chat or send the user to /login. The flag grants nothing: every API call is authorized
 * by the cookie the browser sends (fetch with credentials: 'include'), and the API answers 401 when
 * the session is gone, which clears the flag.
 */

// The localStorage key of the flag. Its value is not secret ('1' while signed in).
export const SESSION_FLAG_KEY = 'maestro.signedIn';

// Called after a successful login. Also removes the JWT that earlier versions stored in
// localStorage under 'token', so no copy of an old token stays readable by scripts.
export function markSignedIn(): void {
  localStorage.removeItem('token');
  localStorage.setItem(SESSION_FLAG_KEY, '1');
}

// Called on logout and when the API answers 401. The 'storage' event tells the open page
// (useSyncExternalStore in the chat) to re-read the flag and redirect to /login.
export function clearSignedIn(): void {
  localStorage.removeItem('token');
  localStorage.removeItem(SESSION_FLAG_KEY);
  window.dispatchEvent(new Event('storage'));
}
