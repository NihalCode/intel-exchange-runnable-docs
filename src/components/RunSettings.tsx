"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { generateAuthParams } from "@/lib/auth-gen";
import { isDemoModeEnabled } from "@/lib/demo";

interface RunSettings {
  /** Docs clone: simulate API responses without a Cyware tenant. */
  demoMode: boolean;
  baseUrl: string;
  setBaseUrl: (v: string) => void;
  /** Returns any credential value by name (case-insensitive) */
  getCredential: (name: string) => string;
  setCredential: (name: string, value: string) => void;
  clearCredentials: () => void;
  secretValues: string[];
  credentialCount: number;
  // Auth generation
  accessId: string;
  setAccessId: (v: string) => void;
  secretKey: string;
  setSecretKey: (v: string) => void;
  generateAuth: () => Promise<void>;
  authStatus: "idle" | "generating" | "ok" | "error";
  authError: string;
}

const Ctx = createContext<RunSettings | null>(null);

const BASE_URL_KEY = "iedocs.baseUrl";
const ACCESS_ID_KEY = "iedocs.accessId";

export function RunSettingsProvider({
  defaultBaseUrl,
  children,
}: {
  defaultBaseUrl: string;
  children: React.ReactNode;
}) {
  const [baseUrl, setBaseUrlState] = useState(defaultBaseUrl);
  // Secrets live only in state (never localStorage)
  const [creds, setCreds] = useState<Record<string, string>>({});
  const [accessId, setAccessIdState] = useState("");
  const secretKeyRef = useRef(""); // never persisted at all
  const [secretKey, setSecretKeyState] = useState("");
  const [authStatus, setAuthStatus] = useState<"idle" | "generating" | "ok" | "error">("idle");
  const [authError, setAuthError] = useState("");

  useEffect(() => {
    try {
      const savedUrl = window.localStorage.getItem(BASE_URL_KEY);
      if (savedUrl) setBaseUrlState(savedUrl);
      const savedId = window.localStorage.getItem(ACCESS_ID_KEY);
      if (savedId) {
        setAccessIdState(savedId);
        setCreds((p) => ({ ...p, accessid: savedId }));
      }
    } catch {
      /* ignore */
    }
  }, []);

  const setBaseUrl = useCallback((v: string) => {
    setBaseUrlState(v);
    try { window.localStorage.setItem(BASE_URL_KEY, v); } catch { /* ignore */ }
  }, []);

  const setAccessId = useCallback((v: string) => {
    setAccessIdState(v);
    setCreds((p) => ({ ...p, accessid: v }));
    // AccessID is non-secret — safe to persist
    try { window.localStorage.setItem(ACCESS_ID_KEY, v); } catch { /* ignore */ }
  }, []);

  const setSecretKey = useCallback((v: string) => {
    secretKeyRef.current = v;
    setSecretKeyState(v); // kept in state for controlled input only
  }, []);

  const getCredential = useCallback(
    (name: string) => creds[name.toLowerCase()] ?? "",
    [creds]
  );

  const setCredential = useCallback((name: string, value: string) => {
    setCreds((prev) => ({ ...prev, [name.toLowerCase()]: value }));
  }, []);

  const clearCredentials = useCallback(() => {
    setCreds({});
    setSecretKeyState("");
    secretKeyRef.current = "";
    setAuthStatus("idle");
  }, []);

  const generateAuth = useCallback(async () => {
    const id = accessId.trim();
    const sk = secretKeyRef.current.trim();
    if (!id || !sk) {
      setAuthError("Enter both Access ID and Secret Key first.");
      setAuthStatus("error");
      return;
    }
    setAuthStatus("generating");
    setAuthError("");
    try {
      const params = await generateAuthParams(id, sk);
      setCreds((prev) => ({
        ...prev,
        accessid: params.accessId,
        signature: params.signature,
        expires: String(params.expires),
      }));
      setAuthStatus("ok");
      // Refresh before expiry
      setTimeout(() => setAuthStatus("idle"), 20_000);
    } catch (e) {
      setAuthError(e instanceof Error ? e.message : "Failed to generate signature.");
      setAuthStatus("error");
    }
  }, [accessId]);

  const value = useMemo<RunSettings>(
    () => ({
      demoMode: isDemoModeEnabled(),
      baseUrl,
      setBaseUrl,
      getCredential,
      setCredential,
      clearCredentials,
      secretValues: Object.values(creds).filter((v) => v && v.length >= 3),
      credentialCount: Object.values(creds).filter(Boolean).length,
      accessId,
      setAccessId,
      secretKey,
      setSecretKey,
      generateAuth,
      authStatus,
      authError,
    }),
    [
      baseUrl, setBaseUrl, getCredential, setCredential, clearCredentials, creds,
      accessId, setAccessId, secretKey, setSecretKey, generateAuth, authStatus, authError,
    ]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useRunSettings(): RunSettings {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useRunSettings must be used within RunSettingsProvider");
  return ctx;
}
