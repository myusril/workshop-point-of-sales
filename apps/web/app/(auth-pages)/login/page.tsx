import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getPageAuthContext } from "@/lib/auth/server";

import { LoginForm } from "./login-form";
import { loginNotice, safeNextPath } from "./safe-next";

export const metadata: Metadata = {
  title: "Masuk — Workshop POS",
};

export const dynamic = "force-dynamic";

interface LoginPageProps {
  searchParams: Promise<{ next?: string | string[]; reason?: string | string[] }>;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const authContext = await getPageAuthContext();

  if (authContext) {
    redirect(authContext.user.role === "OWNER" ? "/users" : "/");
  }

  return <LoginForm nextPath={safeNextPath(params.next)} notice={loginNotice(params.reason)} />;
}
