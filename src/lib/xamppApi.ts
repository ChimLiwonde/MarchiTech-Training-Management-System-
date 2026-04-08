import { xamppApiBaseUrl } from "@/lib/appConfig";

const XAMPP_TOKEN_KEY = "marchitech_xampp_token";

export interface ApiRequestOptions extends Omit<RequestInit, "body" | "headers"> {
  body?: unknown;
  headers?: Record<string, string>;
  skipAuth?: boolean;
}

export const getXamppToken = () => localStorage.getItem(XAMPP_TOKEN_KEY);

export const setXamppToken = (token: string) => {
  localStorage.setItem(XAMPP_TOKEN_KEY, token);
};

export const clearXamppToken = () => {
  localStorage.removeItem(XAMPP_TOKEN_KEY);
};

export async function xamppApiRequest<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const token = getXamppToken();
  const headers: Record<string, string> = {
    ...(options.headers ?? {}),
  };

  if (options.body !== undefined && !(options.body instanceof FormData)) {
    headers["Content-Type"] = headers["Content-Type"] ?? "application/json";
  }

  if (!options.skipAuth && token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${xamppApiBaseUrl}${path}`, {
    ...options,
    headers,
    body:
      options.body === undefined
        ? undefined
        : options.body instanceof FormData
          ? options.body
          : JSON.stringify(options.body),
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : {};

  if (!response.ok) {
    const message = data?.error || data?.message || `Request failed with status ${response.status}`;
    throw new Error(message);
  }

  return data as T;
}
