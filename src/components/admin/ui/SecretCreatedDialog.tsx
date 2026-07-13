"use client";

import { OneTimeSecretModal } from "@/components/admin/OneTimeSecretModal";

export function SecretCreatedDialog({
  secret,
  title = "Credential created",
  description = "Store this value in your secret manager. It cannot be retrieved again from this dashboard.",
  onClose,
}: {
  secret: string | null;
  title?: string;
  description?: string;
  onClose: () => void;
}) {
  if (!secret) return null;
  return (
    <OneTimeSecretModal
      title={title}
      secret={secret}
      description={description}
      onClose={onClose}
    />
  );
}
