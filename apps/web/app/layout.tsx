import type { Metadata } from "next";
import type { ReactNode } from "react";

import { ThemeProvider } from "@/components/theme-provider";

import "./globals.css";

export const metadata: Metadata = {
  title: "Workshop POS",
  description:
    "Kerangka aplikasi Workshop POS untuk bengkel kendaraan: transaksi campuran suku cadang dan jasa.",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    // The back-office ThemeProvider writes data-theme before hydration (§5);
    // the attribute is intentionally server-invisible, so React must not warn.
    <html lang="id" suppressHydrationWarning>
      <body>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
