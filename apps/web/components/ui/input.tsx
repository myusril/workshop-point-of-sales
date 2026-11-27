import type * as React from "react";

import { cn } from "@/lib/utils";

/** Text input: 44 px visual height, 16 px text, token focus ring. */
function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      className={cn(
        "flex min-h-11 w-full rounded-control border border-line-strong bg-surface px-3 py-2 text-base text-ink transition-colors placeholder:text-ink-muted hover:border-line-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:bg-fill-disabled disabled:text-ink-disabled aria-invalid:border-danger aria-invalid:outline-1 aria-invalid:outline-danger sm:text-sm",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
