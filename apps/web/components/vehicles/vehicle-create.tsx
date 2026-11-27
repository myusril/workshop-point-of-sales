"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { DiscardDialog } from "@/components/back-office/discard-dialog";
import { StatusToast } from "@/components/back-office/status-toast";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

import { VehicleForm } from "./vehicle-form";

export function VehicleCreateAction({
  label = "Tambah kendaraan",
  variant = "primary",
}: {
  label?: string;
  variant?: "primary" | "secondary";
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [discard, setDiscard] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  function changeOpen(next: boolean) {
    if (!next && dirty) {
      setDiscard(true);
      return;
    }
    setOpen(next);
    if (!next) setDirty(false);
  }

  return (
    <>
      <Dialog open={open} onOpenChange={changeOpen}>
        <DialogTrigger asChild>
          <Button variant={variant}>{label}</Button>
        </DialogTrigger>
        <DialogContent aria-describedby="create-vehicle-description">
          <DialogHeader>
            <DialogTitle>Kendaraan baru</DialogTitle>
            <DialogDescription id="create-vehicle-description">
              Nomor polisi disimpan tanpa spasi. Plat yang sudah terdaftar akan dipakai kembali agar
              tidak ada data ganda; kendaraan baru memerlukan pelanggan yang sudah tercatat.
            </DialogDescription>
          </DialogHeader>
          <VehicleForm
            mode="create"
            onDirty={() => {
              setDirty(true);
            }}
            onSaved={(result) => {
              setDirty(false);
              setOpen(false);
              setMessage(result.message);
              router.refresh();
            }}
          />
        </DialogContent>
      </Dialog>

      <DiscardDialog
        open={discard}
        onKeep={() => {
          setDiscard(false);
        }}
        onDiscard={() => {
          setDiscard(false);
          setDirty(false);
          setOpen(false);
        }}
      />

      {message ? <StatusToast message={message} onDismiss={() => setMessage(null)} /> : null}
    </>
  );
}
