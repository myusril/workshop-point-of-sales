"use client";

import { loginResponseSchema } from "@workshop-pos/contracts";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";

import {
  formatLockoutCountdown,
  NETWORK_ERROR_MESSAGE,
  readApiError,
  type FormErrorState,
} from "@/components/auth/api-error";

interface LoginFormProps {
  nextPath: string | null;
  notice: string | null;
}

const LOCKOUT_FALLBACK_SECONDS = 15 * 60;

export function LoginForm({ nextPath, notice }: LoginFormProps) {
  const router = useRouter();
  const identifierId = useId();
  const passwordId = useId();
  const summaryRef = useRef<HTMLDivElement>(null);

  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<FormErrorState | null>(null);
  const [lockoutEndsAt, setLockoutEndsAt] = useState<number | null>(null);
  const [clock, setClock] = useState(() => Date.now());

  const lockedSeconds =
    lockoutEndsAt === null ? 0 : Math.max(0, Math.ceil((lockoutEndsAt - clock) / 1000));
  const locked = lockoutEndsAt !== null && lockedSeconds > 0;

  useEffect(() => {
    if (lockoutEndsAt === null) return;

    const timer = window.setInterval(() => {
      const now = Date.now();
      setClock(now);
      if (now >= lockoutEndsAt) {
        window.clearInterval(timer);
      }
    }, 1000);

    return () => {
      window.clearInterval(timer);
    };
  }, [lockoutEndsAt]);

  useEffect(() => {
    if (error) summaryRef.current?.focus();
  }, [error]);

  const identifierError = error?.fieldErrors.identifier?.[0];
  const passwordError = error?.fieldErrors.password?.[0];
  const summaryMessages = error
    ? Array.from(new Set([error.message, ...Object.values(error.fieldErrors).flat()]))
    : [];

  async function submit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || locked) return;

    setPending(true);
    setError(null);
    setLockoutEndsAt(null);
    setClock(Date.now());

    try {
      const response = await fetch("/api/v1/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          identifier: identifier.trim(),
          password,
          surface: "web",
        }),
      });

      if (!response.ok) {
        const parsed = await readApiError(response);
        if (response.status === 429) {
          const retrySeconds = parsed.retryAfterSeconds ?? LOCKOUT_FALLBACK_SECONDS;
          setClock(Date.now());
          setLockoutEndsAt(Date.now() + retrySeconds * 1000);
        }
        setError(parsed);
        return;
      }

      const payload = loginResponseSchema.safeParse(await response.json());
      const destination = nextPath ?? (payload.success && payload.data.user.role === "OWNER" ? "/users" : "/");
      router.replace(destination);
      router.refresh();
    } catch {
      setError({ message: NETWORK_ERROR_MESSAGE, fieldErrors: {} });
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="wp3-login-shell">
      <div className="wp3-login-card">
        <p className="wp3-brand">Workshop POS</p>
        <h1 className="wp3-login-title">Masuk</h1>
        <p className="wp3-login-lead">Gunakan akun staf bengkel Anda untuk membuka back-office.</p>

        {notice ? (
          <p className="wp3-alert wp3-alert--info wp3-login-message" role="status">
            {notice}
          </p>
        ) : null}

        {locked ? (
          <p className="wp3-alert wp3-alert--warning wp3-login-message" id="login-lockout" role="alert">
            <strong>Akun dikunci sementara.</strong> Coba lagi dalam{" "}
            {formatLockoutCountdown(lockedSeconds)}.
          </p>
        ) : null}

        {error && lockoutEndsAt === null ? (
          <div
            className="wp3-alert wp3-alert--danger wp3-login-message"
            id="login-error-summary"
            role="alert"
            ref={summaryRef}
            tabIndex={-1}
          >
            {summaryMessages.map((message) => (
              <p key={message}>{message}</p>
            ))}
          </div>
        ) : null}

        <form className="wp3-login-form" onSubmit={submit} aria-busy={pending} noValidate>
          <div className="wp3-field">
            <label className="wp3-label" htmlFor={identifierId}>
              Email, nama pengguna, atau nomor HP
            </label>
            <input
              className="wp3-input"
              id={identifierId}
              name="identifier"
              type="text"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              value={identifier}
              onChange={(event) => setIdentifier(event.target.value)}
              aria-invalid={identifierError ? true : undefined}
              aria-describedby={identifierError ? `${identifierId}-error` : undefined}
              required
            />
            {identifierError ? (
              <p className="wp3-field-error" id={`${identifierId}-error`}>
                {identifierError}
              </p>
            ) : null}
          </div>

          <div className="wp3-field">
            <label className="wp3-label" htmlFor={passwordId}>
              Kata sandi
            </label>
            <input
              className="wp3-input"
              id={passwordId}
              name="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              aria-invalid={passwordError ? true : undefined}
              aria-describedby={passwordError ? `${passwordId}-error` : undefined}
              required
            />
            {passwordError ? (
              <p className="wp3-field-error" id={`${passwordId}-error`}>
                {passwordError}
              </p>
            ) : null}
          </div>

          {pending ? (
            <p className="wp3-reason" id="login-submit-reason" role="status">
              Sedang memeriksa kredensial…
            </p>
          ) : null}

          <button
            className="wp3-btn wp3-btn--primary wp3-btn--block"
            type="submit"
            disabled={pending || locked}
            aria-describedby={
              pending ? "login-submit-reason" : locked ? "login-lockout" : undefined
            }
          >
            {pending ? "Memeriksa…" : "Masuk"}
          </button>
        </form>

        <p className="wp3-login-footer">
          Akses hanya untuk staf terdaftar. Hubungi Pemilik bila Anda belum memiliki akun.
        </p>
      </div>
    </main>
  );
}
