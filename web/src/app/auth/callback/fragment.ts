// Supabase's default e-mail templates (and links built from them) return the
// session in the URL fragment (#access_token=...&refresh_token=...), which the
// server never sees. This reads it in the browser.
export type AuthFragment = { kind: "session"; accessToken: string; refreshToken: string } | { kind: "error"; message: string } | { kind: "empty" };

export function parseAuthFragment(hash: string): AuthFragment {
  const params = new URLSearchParams(hash.replace(/^#/, ""));
  const error = params.get("error_description") ?? params.get("error");
  if (error) return { kind: "error", message: error };
  const accessToken = params.get("access_token");
  const refreshToken = params.get("refresh_token");
  if (accessToken && refreshToken) return { kind: "session", accessToken, refreshToken };
  return { kind: "empty" };
}
