import { SignInView } from "@/components/auth/signin-view";

export default async function SignUpPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const nextPath = sp["next"] ?? "/";
  return <SignInView mode="register" nextPath={nextPath} />;
}
