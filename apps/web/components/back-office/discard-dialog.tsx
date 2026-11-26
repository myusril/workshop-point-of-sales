"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface DiscardDialogProps {
  open: boolean;
  /** Keep editing: closes this confirmation only. */
  onKeep: () => void;
  /** Discard the draft and close the underlying dialog. */
  onDiscard: () => void;
}

/**
 * Unsaved-changes guard (§6.8/§9.10). Cancel receives initial focus; the
 * destructive action repeats the verb and is never the default.
 */
export function DiscardDialog({ open, onKeep, onDiscard }: DiscardDialogProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onKeep();
      }}
    >
      <DialogContent
        destructive
        aria-describedby="discard-dialog-description"
        onInteractOutside={(event) => {
          event.preventDefault();
        }}
        onEscapeKeyDown={(event) => {
          event.preventDefault();
          onKeep();
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          const openDialogs = Array.from(
            document.querySelectorAll<HTMLElement>('[role="dialog"][data-state="open"]'),
          );
          const target = openDialogs.at(-1)?.querySelector<HTMLElement>(
            "input, select, textarea, button",
          );
          target?.focus();
        }}
      >
        <DialogHeader>
          <DialogTitle>Buang perubahan?</DialogTitle>
          <DialogDescription id="discard-dialog-description">
            Data yang belum disimpan akan hilang dan tidak dapat dipulihkan.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="secondary" autoFocus onClick={onKeep}>
            Tetap di sini
          </Button>
          <Button type="button" variant="danger" onClick={onDiscard}>
            Buang perubahan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
