export async function api<T = any>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const response = await fetch("/api" + path, {
    ...init,
    credentials: "same-origin",
    headers: {
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
  });
  if (!response.ok) {
    const data = await response
      .json()
      .catch(() => ({ error: response.statusText }));
    throw new Error(data.details?.join("; ") || data.error || "Request failed");
  }
  return response.json();
}
export const post = (path: string, body: unknown = {}) =>
  api(path, { method: "POST", body: JSON.stringify(body) });
