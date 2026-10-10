// Only same-origin relative paths are accepted as post-confirmation targets, so a
// crafted e-mail link cannot bounce the user to another site (open redirect).
export function safeNextPath(next: string | null | undefined, fallback = "/auth/set-password"): string {
  if (!next) return fallback;
  if (!next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  // Control chars and backslashes can be normalized by browsers into "//host".
  if (/[\u0000-\u001f\u007f\\]/.test(next)) return fallback;
  try {
    const url = new URL(next, "http://local.invalid");
    if (url.origin !== "http://local.invalid") return fallback;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
}
