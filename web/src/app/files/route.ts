import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

// GET /files?path=<object path>
// Issues a 60-second signed URL as the signed-in user. Storage RLS only signs
// objects the user uploaded or that are referenced by a row they can see, so
// this route never decides access by itself.
export async function GET(request: NextRequest) {
  const path = request.nextUrl.searchParams.get("path");
  if (!path || path.includes("..")) return NextResponse.json({ error: "invalid path" }, { status: 400 });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/login", request.url));

  const download = request.nextUrl.searchParams.get("download") === "1";
  const { data, error } = await supabase.storage.from("files").createSignedUrl(path, 60, { download });
  if (error || !data) return NextResponse.json({ error: "Arquivo não encontrado ou sem permissão" }, { status: 404 });

  return NextResponse.redirect(data.signedUrl);
}
