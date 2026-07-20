"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";

export function useControlPlaneMutation() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("Ready");

  const getCsrfToken = useCallback(async (): Promise<string> => {
    const contextResponse = await fetch("/api/admin/control-plane/context", {
      cache: "no-store",
    });
    if (!contextResponse.ok) throw new Error("Authorization refresh failed");
    const context = (await contextResponse.json()) as { csrfToken: string };
    return context.csrfToken;
  }, []);

  const mutate = useCallback(
    async (
      path: string,
      body: Record<string, unknown>,
      options?: { idempotencyKey?: string; successMessage?: string }
    ): Promise<{ plaintext?: string; oneTime?: boolean }> => {
      setBusy(true);
      setStatus("Operation in progress");
      try {
        const csrfToken = await getCsrfToken();
        const response = await fetch(path, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-CSRF-Token": csrfToken,
            ...(options?.idempotencyKey
              ? { "Idempotency-Key": options.idempotencyKey }
              : {}),
          },
          body: JSON.stringify(body),
        });
        let raw = "";
        try {
          raw = await response.text();
        } catch {
          throw new Error(`Operation failed (HTTP ${response.status})`);
        }
        let result: {
          error?: string;
          message?: string;
          requiresApproval?: boolean;
          plaintext?: string;
          oneTime?: boolean;
        } = {};
        if (raw) {
          try {
            result = JSON.parse(raw) as typeof result;
          } catch {
            throw new Error(
              `Server returned an invalid response (HTTP ${response.status})`
            );
          }
        }
        if (!response.ok) {
          throw new Error(
            result.error ??
              result.message ??
              `Operation failed (HTTP ${response.status})`
          );
        }
        setStatus(
          result.message ??
            options?.successMessage ??
            (result.requiresApproval
              ? "Change request created — approve it in Admin → Change Requests."
              : "Operation completed successfully")
        );
        router.refresh();
        return result;
      } catch (error) {
        setStatus(error instanceof Error ? error.message : "Operation failed");
        throw error;
      } finally {
        setBusy(false);
      }
    },
    [getCsrfToken, router]
  );

  const patch = useCallback(
    async (
      path: string,
      body: Record<string, unknown>,
      successMessage?: string
    ) => {
      setBusy(true);
      setStatus("Saving…");
      try {
        const csrfToken = await getCsrfToken();
        const response = await fetch(path, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            "X-CSRF-Token": csrfToken,
          },
          body: JSON.stringify(body),
        });
        const raw = await response.text();
        let result: { error?: string; message?: string } = {};
        if (raw) {
          try {
            result = JSON.parse(raw) as typeof result;
          } catch {
            throw new Error(`Save failed — invalid server response (HTTP ${response.status})`);
          }
        }
        if (!response.ok) {
          throw new Error(
            result.error ?? result.message ?? `Save failed (HTTP ${response.status})`
          );
        }
        setStatus(successMessage ?? "Saved successfully");
        router.refresh();
        return result;
      } catch (error) {
        setStatus(error instanceof Error ? error.message : "Save failed");
        throw error;
      } finally {
        setBusy(false);
      }
    },
    [getCsrfToken, router]
  );

  return { mutate, patch, busy, status, setStatus };
}
