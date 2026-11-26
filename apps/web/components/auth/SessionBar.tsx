"use client";

import type { OutletSummary, SessionUser } from "@workshop-pos/contracts";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { NETWORK_ERROR_MESSAGE, readApiError } from "./api-error";
import { ROLE_LABELS } from "./labels";

interface SessionBarProps {
  user: SessionUser;
  outlets: OutletSummary[];
  activeOutletId: string | null;
}

export function SessionBar({ user, outlets, activeOutletId }: SessionBarProps) {
  const router = useRouter();
  const [selectedOutletId, setSelectedOutletId] = useState(activeOutletId ?? "");
  const [pending, setPending] = useState<"switch" | "logout" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const activeOutlet = outlets.find((outlet) => outlet.id === selectedOutletId) ?? null;
  // Any role may switch when it can reach more than one outlet; the server
  // still refuses a target outside the session's outlet scope.
  const showSwitcher = outlets.length > 1;
  const roleLabel = ROLE_LABELS[user.role];

  async function switchOutlet(outletId: string) {
    if (outletId === selectedOutletId) return;

    const previousOutletId = selectedOutletId;
    setSelectedOutletId(outletId);
    setPending("switch");
    setError(null);
    setStatus(null);

    try {
      const response = await fetch("/api/v1/auth/session/outlet", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ outletId }),
      });

      if (!response.ok) {
        setSelectedOutletId(previousOutletId);
        setError((await readApiError(response)).message);
        return;
      }

      const outletName = outlets.find((outlet) => outlet.id === outletId)?.name ?? "outlet baru";
      setStatus(`Outlet aktif diganti ke ${outletName}.`);
      router.refresh();
    } catch {
      setSelectedOutletId(previousOutletId);
      setError(NETWORK_ERROR_MESSAGE);
    } finally {
      setPending(null);
    }
  }

  async function signOut() {
    setPending("logout");
    setError(null);
    setStatus(null);

    try {
      const response = await fetch("/api/v1/auth/logout", { method: "POST" });
      if (!response.ok) {
        setError((await readApiError(response)).message);
        return;
      }

      router.replace("/login");
      router.refresh();
    } catch {
      setError(NETWORK_ERROR_MESSAGE);
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="wp3-session">
      <div className="wp3-session__identity">
        <span className="wp3-session__name">{user.name}</span>
        <span className="wp3-session__meta">
          {roleLabel}
          {activeOutlet ? ` · ${activeOutlet.name}` : outlets.length === 0 ? " · Tanpa outlet" : ""}
        </span>
      </div>

      <div className="wp3-session__controls">
        {showSwitcher ? (
          <div className="wp3-field">
            <label className="wp3-reason" htmlFor="session-active-outlet">
              Outlet aktif
            </label>
            <select
              id="session-active-outlet"
              className="wp3-select"
              value={selectedOutletId}
              disabled={pending !== null}
              aria-describedby={pending === "switch" ? "session-pending-reason" : undefined}
              onChange={(event) => {
                void switchOutlet(event.target.value);
              }}
            >
              {outlets.map((outlet) => (
                <option key={outlet.id} value={outlet.id}>
                  {outlet.name}
                  {outlet.isActive ? "" : " (nonaktif)"}
                </option>
              ))}
            </select>
          </div>
        ) : null}

        <button
          type="button"
          className="wp3-btn"
          onClick={() => {
            void signOut();
          }}
          disabled={pending !== null}
          aria-describedby={pending === "logout" ? "session-pending-reason" : undefined}
        >
          {pending === "logout" ? "Keluar…" : "Keluar"}
        </button>
      </div>

      {pending !== null ? (
        <p className="wp3-reason wp3-session__feedback" id="session-pending-reason" role="status">
          {pending === "switch" ? "Mengganti outlet aktif…" : "Mengakhiri sesi…"}
        </p>
      ) : null}

      {error ? (
        <p className="wp3-alert wp3-alert--danger wp3-session__feedback" role="alert">
          {error}
        </p>
      ) : null}

      {status ? (
        <p className="wp3-alert wp3-alert--success wp3-session__feedback" role="status">
          {status}
        </p>
      ) : null}
    </div>
  );
}
