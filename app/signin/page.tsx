import { SignInView } from "@/components/auth/signin-view";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const params = await searchParams;
  const nextPath = typeof params.next === "string" && params.next.startsWith("/") ? params.next : "/";

  return <SignInView mode="login" nextPath={nextPath} />;
}
