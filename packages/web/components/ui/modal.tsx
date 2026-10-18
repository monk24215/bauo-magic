'use client';

import { cn } from '@/lib/utils';
import { type ReactNode, useEffect, useRef } from 'react';

interface ModalProps {
  /** id of the heading that names the dialog */
  labelledBy: string;
  /** Called on Escape; pass a guarded handler to block closing while busy */
  onClose: () => void;
  className?: string;
  children: ReactNode;
}

// Native modal <dialog>: traps focus, closes on Escape, makes the page behind it inert,
// and returns focus to the trigger on close. Render it conditionally to open it.
export function Modal({ labelledBy, onClose, className, children }: ModalProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
    return () => dialog?.close();
  }, []);

  return (
    <dialog
      ref={ref}
      aria-labelledby={labelledBy}
      onCancel={(e) => {
        // Let React state decide whether the dialog unmounts.
        e.preventDefault();
        onClose();
      }}
      className={cn(
        'm-auto w-full max-w-sm rounded-lg border border-border bg-[#1d2026] p-6 text-foreground shadow-lg backdrop:bg-black/50 space-y-4',
        className,
      )}
    >
      {children}
    </dialog>
  );
}
