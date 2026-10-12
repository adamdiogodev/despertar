import { describe, expect, it } from "vitest";
import { parseAuthFragment } from "./fragment";

describe("parseAuthFragment", () => {
  it("reads the session tokens", () => {
    expect(parseAuthFragment("#access_token=a.b.c&expires_in=3600&refresh_token=r1&token_type=bearer&type=invite")).toEqual({
      kind: "session",
      accessToken: "a.b.c",
      refreshToken: "r1",
    });
  });
  it("reports an expired link", () => {
    expect(parseAuthFragment("#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired")).toEqual({
      kind: "error",
      message: "Email link is invalid or has expired",
    });
  });
  it("is empty without tokens", () => {
    expect(parseAuthFragment("")).toEqual({ kind: "empty" });
    expect(parseAuthFragment("#access_token=only")).toEqual({ kind: "empty" });
  });
});
