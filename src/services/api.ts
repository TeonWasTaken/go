/**
 * Typed API client for /api/links endpoints.
 * Surfaces user-readable error messages for toast display.
 */

export interface AliasRecord {
  id: string;
  alias: string;
  destination_url: string;
  created_by: string;
  title: string;
  click_count: number;
  heat_score: number;
  heat_updated_at: string | null;
  is_private: boolean;
  created_at: string;
  last_accessed_at: string | null;
  expiry_policy_type: "never" | "fixed" | "inactivity";
  duration_months: 1 | 3 | 12 | null;
  custom_expires_at: string | null;
  expires_at: string | null;
  expiry_status: "active" | "expiring_soon" | "expired" | "no_expiry";
  expired_at: string | null;
  icon_url: string | null;
}

export interface CreateAliasPayload {
  alias: string;
  destination_url: string;
  title: string;
  is_private?: boolean;
  expiry_policy_type?: "never" | "fixed" | "inactivity";
  duration_months?: 1 | 3 | 12;
  custom_expires_at?: string;
  icon_url?: string;
}

export interface UpdateAliasPayload {
  destination_url?: string;
  title?: string;
  is_private?: boolean;
  expiry_policy_type?: "never" | "fixed" | "inactivity";
  duration_months?: 1 | 3 | 12;
  custom_expires_at?: string;
  icon_url?: string;
}

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    let message = "Something went wrong. Please try again.";
    try {
      const body = await res.json();
      if (body?.error && typeof body.error === "string") message = body.error;
    } catch {
      /* no JSON body */
    }
    throw new ApiError(message, res.status);
  }
  return res.json() as Promise<T>;
}

export interface GetLinksParams {
  search?: string;
  sort?: "clicks" | "heat";
  scope?: "popular";
}

export async function getLinks(
  params?: GetLinksParams,
): Promise<AliasRecord[]> {
  const qs = new URLSearchParams();
  if (params?.search) qs.set("search", params.search);
  if (params?.sort) qs.set("sort", params.sort);
  if (params?.scope) qs.set("scope", params.scope);
  const query = qs.toString();
  return request<AliasRecord[]>(`/api/links${query ? `?${query}` : ""}`);
}

export async function createLink(
  payload: CreateAliasPayload,
): Promise<AliasRecord> {
  return request<AliasRecord>("/api/links", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function updateLink(
  alias: string,
  payload: UpdateAliasPayload,
): Promise<AliasRecord> {
  return request<AliasRecord>(`/api/links/${encodeURIComponent(alias)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function deleteLink(alias: string): Promise<void> {
  await request<void>(`/api/links/${encodeURIComponent(alias)}`, {
    method: "DELETE",
  });
}

export async function renewLink(alias: string): Promise<AliasRecord> {
  return request<AliasRecord>(`/api/links/${encodeURIComponent(alias)}/renew`, {
    method: "PUT",
  });
}

export async function scrapeMetadata(
  url: string,
): Promise<{ title: string; iconUrl: string }> {
  const res = await fetch(`/api/scrape-title?url=${encodeURIComponent(url)}`);
  if (!res.ok) return { title: "", iconUrl: "" };
  const data = await res.json();
  return { title: data.title ?? "", iconUrl: data.iconUrl ?? "" };
}
