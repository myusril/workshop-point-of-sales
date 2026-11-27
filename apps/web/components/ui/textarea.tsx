import type * as React from "react";

import { cn } from "@/lib/utils";

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      className={cn(
        "flex min-h-[88px] w-full rounded-control border border-line-strong bg-surface px-3 py-2 text-base text-ink transition-colors placeholder:text-ink-muted hover:border-line-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:bg-fill-disabled disabled:text-ink-disabled aria-invalid:border-danger aria-invalid:outline-1 aria-invalid:outline-danger sm:text-sm",
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };
