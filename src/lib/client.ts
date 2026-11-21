"use client";
export async function requestApi<T = Record<string, unknown>>(
  path: string,
  body?: Record<string, unknown>,
): Promise<T> {
  const response = await fetch(path, {
    method: body ? "POST" : "GET",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    credentials: "same-origin",
    cache: "no-store",
  });
  const result = await response
    .json()
    .catch(() => ({ error: "The server could not complete this request." }));
  if (!response.ok)
    throw new Error(result.error || "The request failed. Please try again.");
  return result.data as T;
}
export function downloadFile(
  content: BlobPart,
  name: string,
  type = "text/plain;charset=utf-8",
) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
export async function copyText(value: string) {
  await navigator.clipboard.writeText(value);
}
