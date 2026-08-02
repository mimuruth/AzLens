/**
 * Current-user profile from Azure Container Apps Easy Auth headers. Parses the
 * base64 `x-ms-client-principal` claims for name/email/picture; falls back to
 * `x-ms-client-principal-name`. Reports configured providers (AUTH_PROVIDERS)
 * so the UI can render the right sign-in buttons. Unauthenticated locally.
 */
export const runtime = "nodejs";

type Claim = { typ?: string; val?: string };

function pick(claims: Claim[], ...types: string[]): string | null {
  for (const t of types) {
    const c = claims.find((c) => c.typ === t || c.typ?.endsWith(`/${t}`));
    if (c?.val) return c.val;
  }
  return null;
}

export async function GET(req: Request): Promise<Response> {
  const h = new Headers(req.headers);
  const providers = (process.env.AUTH_PROVIDERS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const principalName = h.get("x-ms-client-principal-name");
  const b64 = h.get("x-ms-client-principal");

  let name: string | null = principalName;
  let email: string | null = principalName;
  let picture: string | null = null;
  let provider: string | null = null;

  if (b64) {
    try {
      const json = JSON.parse(Buffer.from(b64, "base64").toString("utf8")) as {
        auth_typ?: string;
        claims?: Claim[];
      };
      const claims = json.claims ?? [];
      name =
        pick(
          claims,
          "name",
          "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name"
        ) ?? name;
      email =
        pick(
          claims,
          "preferred_username",
          "emails",
          "email",
          "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress"
        ) ?? email;
      picture = pick(claims, "picture", "avatar_url");
      provider = json.auth_typ ?? null;
    } catch {
      /* keep header fallback */
    }
  }

  const authenticated = Boolean(principalName || b64);
  if (!authenticated && !name) {
    // Optional local display name for dev (no Easy Auth headers present).
    name = process.env.LOCAL_USER_NAME || null;
  }

  return Response.json({
    authenticated,
    name,
    email,
    picture,
    provider,
    providers,
  });
}
