import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { safeNextPath } from "./safe-next";

const OTP_TYPES: EmailOtpType[] = ["invite", "recovery", "signup", "magiclink", "email", "email_change"];

// GET /auth/confirm?token_hash=...&type=invite|recovery&next=/auth/set-password
// Target of the invite and password-reset e-mails: exchanges the one-time token
// for a session cookie, then continues to `next` (relative paths only).
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const tokenHash = params.get("token_hash");
  const type = params.get("type") as EmailOtpType | null;
  const next = safeNextPath(params.get("next"));

  if (tokenHash && type && OTP_TYPES.includes(type)) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    if (!error) return NextResponse.redirect(new URL(next, request.url));
    return NextResponse.redirect(new URL("/auth/forgot-password?expired=1", request.url));
  }

  // PKCE links (?code=...) from Supabase's default flow.
  const code = params.get("code");
  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(next, request.url));
    return NextResponse.redirect(new URL("/auth/forgot-password?expired=1", request.url));
  }

  // Links built from Supabase's default templates carry the session in the URL
  // fragment, which only the browser can read; it survives this redirect.
  const callback = new URL("/auth/callback", request.url);
  callback.searchParams.set("next", next);
  return NextResponse.redirect(callback);
}
