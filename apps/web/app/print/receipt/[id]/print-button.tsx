"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";

import styles from "./print.module.css";

interface PrintButtonProps {
  /** `?print=1` opens the OS dialog automatically after the page settles. */
  auto: boolean;
}

/**
 * Browser print is the WP6 fallback (AC17.2): no external PDF service, no
 * hidden blank page. If the dialog does not appear, the copy tells the user to
 * retry or choose "Save as PDF".
 */
export function PrintButton({ auto }: PrintButtonProps) {
  const [attempted, setAttempted] = useState(false);

  useEffect(() => {
    if (!auto) return;
    const timer = window.setTimeout(() => {
      window.print();
      setAttempted(true);
    }, 300);
    return () => {
      window.clearTimeout(timer);
    };
  }, [auto]);

  return (
    <div className="flex flex-col gap-2">
      <div className={styles.actions}>
        <Button
          type="button"
          variant="primary"
          onClick={() => {
            window.print();
            setAttempted(true);
          }}
        >
          {attempted ? "Cetak lagi" : "Cetak via browser"}
        </Button>
      </div>
      {attempted ? (
        <p className={styles.hint} role="status">
          Perintah cetak dikirim ke browser. Jika tidak ada halaman tercetak, ulangi atau pilih
          &ldquo;Simpan sebagai PDF&rdquo; di dialog cetak.
        </p>
      ) : null}
    </div>
  );
}
