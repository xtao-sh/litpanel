"use client";

import { getStoredActiveLibraryId } from "@/lib/libraries";

const DEFAULT_API_URL = "http://127.0.0.1:8050";

export function getApiUrl(): string {
  return (process.env.NEXT_PUBLIC_API_URL ?? "").trim() || DEFAULT_API_URL;
}

export function getGraphqlUrl(): string {
  return (process.env.NEXT_PUBLIC_GRAPHQL_URL ?? "").trim() || `${getApiUrl()}/graphql`;
}

export async function readErrorMessage(
  response: Response,
  fallback: string
): Promise<string> {
  const payload = await response
    .json()
    .catch(() => null) as
    | { detail?: string; error?: string; message?: string }
    | null;

  return (
    payload?.detail?.trim() ||
    payload?.error?.trim() ||
    payload?.message?.trim() ||
    `${fallback} (HTTP ${response.status})`
  );
}

export function withActiveLibraryHeaders(headers?: HeadersInit): Headers {
  const resolved = new Headers(headers ?? {});
  const libraryId = getStoredActiveLibraryId();
  if (libraryId) {
    resolved.set("X-Library-Id", String(libraryId));
  }
  return resolved;
}

export function activeLibraryFetch(
  input: RequestInfo | URL,
  init: RequestInit = {}
): Promise<Response> {
  return fetch(input, {
    ...init,
    headers: withActiveLibraryHeaders(init.headers),
  });
}
