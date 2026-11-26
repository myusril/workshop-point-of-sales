import * as SlotPrimitive from "radix-ui/slot";
import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-control border text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:border-line disabled:bg-fill-disabled disabled:text-ink-disabled aria-busy:cursor-progress [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary: "border-accent bg-accent text-accent-on hover:border-accent-hover hover:bg-accent-hover active:border-accent-active active:bg-accent-active",
        secondary: "border-line bg-surface text-ink hover:bg-hover",
        ghost: "border-transparent bg-transparent text-accent-ink hover:bg-accent-subtle",
        danger: "border-danger-line bg-surface text-danger hover:bg-danger-bg",
        link: "min-h-0 border-transparent bg-transparent p-0 text-accent-ink underline underline-offset-4 hover:text-accent-hover",
      },
      size: {
        default: "px-4 py-2",
        sm: "min-h-11 px-3",
        icon: "size-11 p-0",
      },
    },
    defaultVariants: {
      variant: "secondary",
      size: "default",
    },
  },
);

type ButtonProps = React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  };

/**
 * Project button. A loading label preserves the button width and sets
 * `aria-busy`; callers pass the reason for a disabled state through
 * `aria-describedby` rather than relying on `title`.
 */
function Button({ className, variant, size, asChild = false, ...props }: ButtonProps) {
  const Component = asChild ? SlotPrimitive.Root : "button";
  return <Component className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}

export { Button, buttonVariants, type ButtonProps };
