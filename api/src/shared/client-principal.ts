export interface ClientPrincipal {
  identityProvider: string;
  userId: string;
  userDetails: string; // email
  userRoles: string[];
}

/**
 * Parse a Base64-encoded x-ms-client-principal header into a typed ClientPrincipal.
 * Returns the decoded ClientPrincipal object, or throws if the header is invalid.
 */
export function parseClientPrincipal(header: string): ClientPrincipal {
  const decoded = Buffer.from(header, "base64").toString("utf-8");
  const parsed = JSON.parse(decoded);

  return {
    identityProvider: parsed.identityProvider ?? "",
    userId: parsed.userId ?? "",
    userDetails: parsed.userDetails ?? "",
    userRoles: Array.isArray(parsed.userRoles) ? parsed.userRoles : [],
  };
}
