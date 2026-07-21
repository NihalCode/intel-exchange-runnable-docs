"use client";

let scriptPromise: Promise<void> | null = null;

declare global {
  interface Window {
    grecaptcha?: {
      ready: (cb: () => void) => void;
      execute: (siteKey: string, options: { action: string }) => Promise<string>;
    };
  }
}

function loadRecaptchaScript(siteKey: string): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.grecaptcha) return Promise.resolve();
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      'script[data-recaptcha="v3"]'
    );
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("reCAPTCHA load failed")));
      return;
    }
    const script = document.createElement("script");
    script.src = `https://www.google.com/recaptcha/api.js?render=${encodeURIComponent(siteKey)}`;
    script.async = true;
    script.dataset.recaptcha = "v3";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("reCAPTCHA load failed"));
    document.head.appendChild(script);
  });
  return scriptPromise;
}

/** Obtain an invisible reCAPTCHA v3 token, or null if unavailable. */
export async function obtainRecaptchaToken(
  action: "ask_ai_submit" | "feedback_submit" | "public_invite"
): Promise<string | null> {
  const siteKey =
    process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY?.trim() ||
    (typeof window !== "undefined"
      ? (window as unknown as { __RECAPTCHA_SITE_KEY__?: string }).__RECAPTCHA_SITE_KEY__
      : undefined);
  if (!siteKey) return null;

  try {
    await loadRecaptchaScript(siteKey);
    await new Promise<void>((resolve) => {
      if (!window.grecaptcha) {
        resolve();
        return;
      }
      window.grecaptcha.ready(() => resolve());
    });
    if (!window.grecaptcha) return null;
    return await window.grecaptcha.execute(siteKey, { action });
  } catch {
    return null;
  }
}
