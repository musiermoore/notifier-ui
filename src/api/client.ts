export type LocaleCode = "ru" | "en";

export interface User {
  id: string;
  email: string;
  name: string;
  lang: LocaleCode;
  created_at: string;
  last_login_at: string;
  telegram_chat?: string;
}

export interface Item {
  id: string;
  user_id: string;
  title: string;
  body: string;
  lang: LocaleCode;
  status: string;
  remind_at?: string | null;
  repeat_rule?: string | null;
  version: number;
  updated_at: string;
  deleted_at?: string | null;
  source: string;
  deliver_to_telegram: boolean;
}

interface APIErrorPayload {
  error?: string;
}

const apiBaseURL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8080";

async function request<T>(path: string, init: RequestInit = {}, token?: string): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");

  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(`${apiBaseURL}${path}`, {
    ...init,
    headers,
  });

  if (!response.ok) {
    let message = `Request failed with status ${response.status}`;

    try {
      const payload = (await response.json()) as APIErrorPayload;
      if (payload.error) {
        message = payload.error;
      }
    } catch {
      // Ignore JSON parsing errors and keep the default message.
    }

    throw new Error(message);
  }

  return (await response.json()) as T;
}

export async function fetchMeta() {
  return request<{
    default_language: LocaleCode;
    supported_languages: LocaleCode[];
  }>("/v1/meta");
}

export async function register(input: {
  email: string;
  password: string;
  name: string;
  lang: LocaleCode;
}) {
  return request<{
    user: User;
    access_token: string;
    token_type: string;
    default_lang: LocaleCode;
  }>("/v1/auth/register", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function login(input: { email: string; password: string }) {
  return request<{
    user: User;
    access_token: string;
    token_type: string;
  }>("/v1/auth/login", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function fetchMe(token: string) {
  return request<{ user: User }>("/v1/auth/me", {}, token);
}

export async function logout(token: string) {
  return request<{ ok: boolean }>(
    "/v1/auth/logout",
    {
      method: "POST",
      body: JSON.stringify({}),
    },
    token,
  );
}

export async function listItems(token: string) {
  return request<{ items: Item[] }>("/v1/items", {}, token);
}

export async function createItem(
  token: string,
  input: {
    title: string;
    body: string;
    lang: LocaleCode;
    status: string;
    remind_at?: string | null;
    deliver_to_telegram: boolean;
    source: string;
  },
) {
  return request<{ item: Item }>(
    "/v1/items",
    {
      method: "POST",
      body: JSON.stringify(input),
    },
    token,
  );
}

export async function updateItem(
  token: string,
  itemID: string,
  input: {
    title?: string;
    body?: string;
    lang?: LocaleCode;
    status?: string;
    remind_at?: string | null;
    deliver_to_telegram?: boolean;
    source?: string;
  },
) {
  return request<{ item: Item }>(
    `/v1/items/${itemID}`,
    {
      method: "PATCH",
      body: JSON.stringify(input),
    },
    token,
  );
}

export async function deleteItem(token: string, itemID: string) {
  return request<{ ok: boolean }>(
    `/v1/items/${itemID}`,
    {
      method: "DELETE",
    },
    token,
  );
}
