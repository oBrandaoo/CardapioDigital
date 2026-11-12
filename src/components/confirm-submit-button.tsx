"use client";

import type { ReactNode } from "react";

// Submit button that asks before running destructive form actions.
export function ConfirmSubmitButton({ message, className, children }: { message: string; className?: string; children: ReactNode }) {
  return (
    <button
      className={className}
      type="submit"
      onClick={(event) => {
        if (!window.confirm(message)) event.preventDefault();
      }}
    >
      {children}
    </button>
  );
}
