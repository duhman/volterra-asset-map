import { type EmailOtpType } from "@supabase/supabase-js";
import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  // PKCE flow uses 'code', implicit flow uses 'token_hash'
  const code = searchParams.get("code");
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;

  const redirectTo = request.nextUrl.clone();
  redirectTo.pathname = "/";
  // Clean up all auth params
  redirectTo.searchParams.delete("code");
  redirectTo.searchParams.delete("token_hash");
  redirectTo.searchParams.delete("type");

  const supabase = await createClient();

  // Handle PKCE flow (code parameter)
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(redirectTo);
    }
    console.error("PKCE code exchange failed:", error.message);
  }

  // Handle implicit flow (token_hash parameter)
  if (token_hash && type) {
    const { error } = await supabase.auth.verifyOtp({
      type,
      token_hash,
    });
    if (!error) {
      return NextResponse.redirect(redirectTo);
    }
    console.error("OTP verification failed:", error.message);
  }

  // Redirect to login with error
  redirectTo.pathname = "/auth/login";
  redirectTo.searchParams.set("error", "invalid_link");
  return NextResponse.redirect(redirectTo);
}
