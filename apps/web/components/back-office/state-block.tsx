import { AlertTriangle, Inbox } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type StateTone = "neutral" | "danger" | "warning";

interface StateBlockProps {
  title: string;
  children: ReactNode;
  actions?: ReactNode;
  tone?: StateTone;
  icon?: ReactNode;
  className?: string;
  role?: "alert" | "status";
}

/**
 * Shared state panel (§6.11): 40 px tinted icon square, title, body capped at
 * 68ch, one primary action. Left-aligned inside a bordered panel; role and
 * copy are supplied by the screen so true-zero, filtered-empty, error, and
 * permission-denied stay distinct.
 */
export function StateBlock({ title, children, actions, tone = "neutral", icon, className, role }: StateBlockProps) {
  return (
    <section
      className={cn("bo-state", tone !== "neutral" && `bo-state--${tone}`, className)}
      role={role}
    >
      <span className="bo-state__icon" aria-hidden="true">
        {icon ?? <Inbox className="size-4" />}
      </span>
      <h2 className="bo-state__title">{title}</h2>
      <div className="bo-state__body">{children}</div>
      {actions ? <div className="bo-state__actions">{actions}</div> : null}
    </section>
  );
}

interface EmptyStateProps {
  title: string;
  children: ReactNode;
  actions?: ReactNode;
  tone?: StateTone;
  icon?: ReactNode;
  className?: string;
}

/** A successful request with nothing to show: true zero, filtered, or setup. */
export function EmptyState({ tone = "neutral", icon, ...props }: EmptyStateProps) {
  return <StateBlock tone={tone} icon={icon ?? <Inbox className="size-4" />} {...props} />;
}

interface ErrorStateProps {
  title: string;
  children: ReactNode;
  actions?: ReactNode;
  className?: string;
}

/**
 * A failed request. It never renders a zero or an empty table: the cause,
 * effect, and a real retry action replace the numbers.
 */
export function ErrorState({ title, children, actions, className }: ErrorStateProps) {
  return (
    <StateBlock
      tone="danger"
      role="alert"
      icon={<AlertTriangle className="size-4" />}
      title={title}
      actions={actions}
      className={className}
    >
      {children}
    </StateBlock>
  );
}
