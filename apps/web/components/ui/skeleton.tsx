import type * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Layout skeleton. Always `aria-hidden`: the surrounding region owns
 * `aria-busy` and the text alternative (§6.11). Geometry comes from the
 * caller so the loaded content swaps in without a layout shift.
 */
function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return <div aria-hidden="true" className={cn("bo-skeleton", className)} {...props} />;
}

export { Skeleton };
