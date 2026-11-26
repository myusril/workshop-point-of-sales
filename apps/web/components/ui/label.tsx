"use client";

import * as LabelPrimitive from "radix-ui/label";
import type * as React from "react";

import { cn } from "@/lib/utils";

function Label({ className, ...props }: React.ComponentProps<typeof LabelPrimitive.Root>) {
  return (
    <LabelPrimitive.Root
      className={cn("text-[13px] font-medium leading-[18px] text-ink-secondary select-none", className)}
      {...props}
    />
  );
}

export { Label };
