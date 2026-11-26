"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";
import type { ReactNode } from "react";

/**
 * Resolves the theme before first paint and writes the result to
 * `data-theme` on the document root, which is what the generated token sheet
 * keys every semantic colour from (§5). `system` follows the OS by default and
 * an explicit choice persists per device.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  return (
    <NextThemesProvider
      attribute="data-theme"
      defaultTheme="system"
      enableSystem
      storageKey="wpos-theme"
      disableTransitionOnChange
    >
      {children}
    </NextThemesProvider>
  );
}
