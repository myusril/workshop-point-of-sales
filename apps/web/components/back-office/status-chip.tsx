import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export type StatusChipTone = "neutral" | "success" | "warning" | "danger" | "info";

interface StatusChipProps {
  tone?: StatusChipTone;
  children: ReactNode;
  className?: string;
}

/**
 * Status is always text plus a rail, never colour alone (§P3). The rail is a
 * CSS pseudo-element, so assistive technology reads only the label.
 */
export function StatusChip({ tone = "neutral", children, className }: StatusChipProps) {
  return <span className={cn("bo-chip", `bo-chip--${tone}`, className)}>{children}</span>;
}
