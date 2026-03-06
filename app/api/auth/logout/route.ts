import { auth } from "@/lib/auth/better-auth";

export async function POST(request: Request) {
  const url = new URL(request.url);
  url.pathname = "/api/auth/sign-out";
  return auth.handler(new Request(url, request));
}
