// Where the browser sends API calls.
//
//  • Normal Next.js hosting (Vercel / Node server):   same origin → "/api/..."
//  • Static export (cPanel / public_html):             NEXT_PUBLIC_API_BASE points at a separately
//    hosted DetheAI backend, e.g. "https://api.detheai.com". If it is not set, every server
//    feature (login, voices, video-to-text, payments) is honestly reported as unavailable —
//    nothing is mocked.

export const API_BASE: string = (process.env.NEXT_PUBLIC_API_BASE ?? "").replace(/\/+$/, "");
export const IS_STATIC_BUILD: boolean = process.env.NEXT_PUBLIC_STATIC_EXPORT === "1";

/** True when server features can work: either same-origin Next server or a configured backend. */
export const BACKEND_AVAILABLE: boolean = !IS_STATIC_BUILD || API_BASE.length > 0;

export const NO_BACKEND_MESSAGE =
  "This feature needs the DetheAI server (login, voices, video-to-text and payments). " +
  "It isn't available on static hosting until a backend URL is configured.";

/** Builds an absolute/relative API URL. Always pass a path starting with "/api". */
export function apiUrl(path: string): string {
  return `${API_BASE}${path}`;
}

/**
 * fetch() wrapper for API calls. Sends cookies to the backend origin (needed for the
 * login session when the API lives on another domain) and short-circuits when no
 * backend exists so the UI can show a clear message instead of a network error.
 */
export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  if (!BACKEND_AVAILABLE) {
    return new Response(JSON.stringify({ message: NO_BACKEND_MESSAGE, code: "NO_BACKEND" }), {
      status: 503,
      headers: { "Content-Type": "application/json" },
    });
  }
  return fetch(apiUrl(path), { credentials: "include", ...init });
}
