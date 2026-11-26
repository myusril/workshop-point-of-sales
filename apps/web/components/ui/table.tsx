import type * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Ruled table primitives (§6.7): sunken header, 1 px row dividers, 44 px rows,
 * horizontal scrolling inside the container so the page never overflows.
 */
interface TableProps extends React.ComponentProps<"table"> {
  /** Accessible name for the horizontally scrollable container. */
  containerLabel?: string;
}

function Table({ className, containerLabel, ...props }: TableProps) {
  return (
    <div
      className="bo-table-scroll"
      data-slot="table-container"
      tabIndex={0}
      role="region"
      aria-label={containerLabel}
    >
      <table className={cn("bo-table w-full text-[13px] leading-[18px]", className)} {...props} />
    </div>
  );
}

function TableHeader({ className, ...props }: React.ComponentProps<"thead">) {
  return <thead className={cn("bg-surface-sunken", className)} {...props} />;
}

function TableBody({ className, ...props }: React.ComponentProps<"tbody">) {
  return <tbody className={cn(className)} {...props} />;
}

function TableRow({ className, ...props }: React.ComponentProps<"tr">) {
  return (
    <tr
      className={cn("border-b border-line-subtle transition-colors last:border-b-0 hover:bg-hover", className)}
      {...props}
    />
  );
}

function TableHead({ className, ...props }: React.ComponentProps<"th">) {
  return (
    <th
      scope="col"
      className={cn(
        "h-11 border-b border-line px-4 py-2 text-left text-xs font-semibold text-ink-secondary",
        className,
      )}
      {...props}
    />
  );
}

function TableCell({ className, ...props }: React.ComponentProps<"td">) {
  return <td className={cn("h-11 px-4 py-2 align-middle", className)} {...props} />;
}

function TableCaption({ className, ...props }: React.ComponentProps<"caption">) {
  return <caption className={cn("sr-only", className)} {...props} />;
}

function TableFooter({ className, ...props }: React.ComponentProps<"tfoot">) {
  return <tfoot className={cn("border-t border-line bg-surface-sunken font-semibold", className)} {...props} />;
}

export { Table, TableHeader, TableBody, TableFooter, TableHead, TableRow, TableCell, TableCaption };
