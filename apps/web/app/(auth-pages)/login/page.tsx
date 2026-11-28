import type { Branding } from "@workshop-pos/contracts";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getAuthRuntime, getPageAuthContext } from "@/lib/auth/server";
import {
  DEFAULT_BRANDING,
  getInstallationBranding,
} from "@/lib/settings-service";

import { LoginForm } from "./login-form";
import { loginNotice, safeNextPath } from "./safe-next";

export const dynamic = "force-dynamic";

/**
 * Installation branding for the signed-out screen. Sign-in must stay reachable
 * even when branding cannot be read, so a failed read renders the default
 * wordmark instead of a 500.
 */
async function loadLoginBranding(): Promise<Branding> {
  try {
    return await getInstallationBranding(getAuthRuntime().db);
  } catch {
    return DEFAULT_BRANDING;
  }
}

export async function generateMetadata(): Promise<Metadata> {
  const branding = await loadLoginBranding();
  return { title: `Masuk — ${branding.productName}` };
}

interface LoginPageProps {
  searchParams: Promise<{ next?: string | string[]; reason?: string | string[] }>;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const authContext = await getPageAuthContext();

  if (authContext) {
    redirect(authContext.user.role === "OWNER" ? "/users" : "/");
  }

  const branding = await loadLoginBranding();

  return (
    <LoginForm
      branding={branding}
      nextPath={safeNextPath(params.next)}
      notice={loginNotice(params.reason)}
    />
  );
}
