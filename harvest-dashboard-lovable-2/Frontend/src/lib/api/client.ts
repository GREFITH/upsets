/** Base URL for FastAPI. Must be absolute in production (include https://). Host-only values get https:// prepended. */
function resolveApiBaseUrl(): string {
  const raw = import.meta.env.VITE_API_BASE_URL?.trim();
  if (!raw) return "http://localhost:8000";
  const withScheme =
    raw.startsWith("http://") || raw.startsWith("https://") ? raw : `https://${raw}`;
  return withScheme.replace(/\/+$/, "");
}

const API_BASE_URL = resolveApiBaseUrl();

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers as Record<string, string> | undefined),
    },
  });
  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Request failed: ${response.status}`);
  }
  return (await response.json()) as T;
}

function buildUrl(path: string, params?: Record<string, string | undefined | null>): string {
  if (!params) return path;
  const qs = Object.entries(params)
    .filter(([, v]) => v != null && v !== "")
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v!)}`)
    .join("&");
  return qs ? `${path}?${qs}` : path;
}

export const apiClient = {
  get: <T>(path: string, params?: Record<string, string | undefined | null>) =>
    request<T>(buildUrl(path, params)),
  post: <T>(path: string, body?: unknown, options?: { keepalive?: boolean }) =>
    request<T>(path, {
      method: "POST",
      body: body === undefined || body === null ? undefined : JSON.stringify(body),
      keepalive: options?.keepalive,
    }),
  put: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "PUT", body: body ? JSON.stringify(body) : undefined }),
};

