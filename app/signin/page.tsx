import { SignInView } from "@/components/auth/signin-view";

export default async function SignInPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const nextPath = sp["next"] ?? "/";
  return <SignInView mode="login" nextPath={nextPath} />;
}
