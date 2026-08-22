export function createJsonRequest(url: string, method: string, body?: unknown, headers?: Record<string, string>) {
  return new Request(url, {
    method,
    headers: { "Content-Type": "application/json", ...(headers || {}) },
    body: body == null ? undefined : JSON.stringify(body),
  });
}

export function createFormRequest(url: string, form: FormData, method = "POST", headers?: Record<string, string>) {
  return new Request(url, { method, body: form, headers });
}

export async function readJson<T>(response: Response) {
  return response.json() as Promise<T>;
}

export function getSetCookie(response: Response) {
  return response.headers.get("set-cookie") || "";
}
