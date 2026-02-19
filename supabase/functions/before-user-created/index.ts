import { Webhook } from "https://esm.sh/standardwebhooks@1.0.0";

const ALLOWED_DOMAINS = ["volterra.example.com"];

interface AuthHookPayload {
  user: {
    email?: string;
    id?: string;
    [key: string]: unknown;
  };
}

Deno.serve(async (req) => {
  const payload = await req.text();
  const secret = Deno.env
    .get("BEFORE_USER_CREATED_HOOK_SECRET")
    ?.replace("v1,whsec_", "");

  if (!secret) {
    console.error("BEFORE_USER_CREATED_HOOK_SECRET not configured");
    return new Response(
      JSON.stringify({
        error: { message: "Server configuration error", http_code: 500 },
      }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }

  const headers = Object.fromEntries(req.headers);
  const wh = new Webhook(secret);

  try {
    const { user } = wh.verify(payload, headers) as AuthHookPayload;
    const email = user.email || "";
    const domain = email.split("@")[1]?.toLowerCase() || "";

    if (!ALLOWED_DOMAINS.includes(domain)) {
      console.log(`Blocked signup attempt from: ${email}`);
      return new Response(
        JSON.stringify({
          error: {
            message:
              "Only @volterra.example.com email addresses can access this application.",
            http_code: 400,
          },
        }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    console.log(`Allowed signup: ${email}`);
    return new Response("{}", {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Webhook verification failed:", error);
    return new Response(
      JSON.stringify({
        error: { message: "Invalid request", http_code: 400 },
      }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }
});
