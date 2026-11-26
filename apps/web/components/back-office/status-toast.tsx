"use client";

import { X } from "lucide-react";
import { useEffect } from "react";

interface StatusToastProps {
  message: string;
  tone?: "success" | "danger";
  onDismiss?: () => void;
}

/**
 * Secondary confirmation toast (§6.10). Success is polite, failure is
 * assertive, every toast has a labelled dismiss button, and the visible
 * confirmation is never the only surface for a validation error. Success
 * clears after six seconds; an error stays until dismissed.
 */
export function StatusToast({ message, tone = "success", onDismiss }: StatusToastProps) {
  useEffect(() => {
    if (!onDismiss || tone === "danger") return;
    const timer = window.setTimeout(onDismiss, 6_000);
    return () => {
      window.clearTimeout(timer);
    };
  }, [onDismiss, tone]);

  return (
    <div className={`bo-toast bo-toast--${tone}`} role={tone === "danger" ? "alert" : "status"}>
      <span className="bo-toast__message">{message}</span>
      {onDismiss ? (
        <button type="button" className="bo-icon-button" aria-label="Tutup pemberitahuan" onClick={onDismiss}>
          <X aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );
}
