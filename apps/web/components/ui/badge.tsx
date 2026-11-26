import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-[2px] border px-2 py-0.5 text-xs font-medium leading-4 whitespace-nowrap",
  {
    variants: {
      tone: {
        neutral: "border-line bg-surface-sunken text-ink-secondary",
        success: "border-success-line bg-success-bg text-success",
        warning: "border-warning-line bg-warning-bg text-warning",
        danger: "border-danger-line bg-danger-bg text-danger",
        info: "border-info-line bg-info-bg text-info",
      },
    },
    defaultVariants: {
      tone: "neutral",
    },
  },
);

function Badge({
  className,
  tone,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}

export { Badge, badgeVariants };
