"use client";

import { SignalButton, SignalDialog } from "@/components/fabric";

interface Props {
  title: string;
  secret: string;
  description: string;
  onClose: () => void;
}

export function OneTimeSecretModal({ title, secret, description, onClose }: Props) {
  return (
    <SignalDialog
      open
      onClose={onClose}
      title={title}
      description={description}
      security
      footer={
        <>
          <SignalButton
            type="button"
            variant="secondary"
            onClick={() => void navigator.clipboard.writeText(secret)}
          >
            Copy
          </SignalButton>
          <SignalButton type="button" onClick={onClose}>
            I have saved it
          </SignalButton>
        </>
      }
    >
      <pre className="overflow-x-auto rounded-md border border-amber-300 bg-amber-50 p-3 font-mono text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">
        {secret}
      </pre>
      <p className="mt-3 text-sm font-medium text-amber-800 dark:text-amber-200">
        Copy this value now. It will not be shown again.
      </p>
    </SignalDialog>
  );
}
