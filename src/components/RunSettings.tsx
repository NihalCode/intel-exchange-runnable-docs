"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

interface RunSettings {
  baseUrl: string;
  setBaseUrl: (v: string) => void;
  /** credential values keyed by lowercased field name — in memory only */
  getCredential: (name: string) => string;
  setCredential: (name: string, value: string) => void;
  clearCredentials: () => void;
  /** all current secret values (for masking output) */
  secretValues: string[];
  credentialCount: number;
}

const Ctx = createContext<RunSettings | null>(null);

const BASE_URL_KEY = "iedocs.baseUrl"; // non-secret, safe to persist

export function RunSettingsProvider({
  defaultBaseUrl,
  children,
}: {
  defaultBaseUrl: string;
  children: React.ReactNode;
}) {
  const [baseUrl, setBaseUrlState] = useState(defaultBaseUrl);
  // Secrets live only in component state (never localStorage / sessionStorage).
  const [creds, setCreds] = useState<Record<string, string>>({});

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(BASE_URL_KEY);
      if (saved) setBaseUrlState(saved);
    } catch {
      /* ignore */
    }
  }, []);

  const setBaseUrl = useCallback((v: string) => {
    setBaseUrlState(v);
    try {
      window.localStorage.setItem(BASE_URL_KEY, v);
    } catch {
      /* ignore */
    }
  }, []);

  const getCredential = useCallback(
    (name: string) => creds[name.toLowerCase()] ?? "",
    [creds]
  );

  const setCredential = useCallback((name: string, value: string) => {
    setCreds((prev) => ({ ...prev, [name.toLowerCase()]: value }));
  }, []);

  const clearCredentials = useCallback(() => setCreds({}), []);

  const value = useMemo<RunSettings>(
    () => ({
      baseUrl,
      setBaseUrl,
      getCredential,
      setCredential,
      clearCredentials,
      secretValues: Object.values(creds).filter((v) => v && v.length >= 3),
      credentialCount: Object.values(creds).filter(Boolean).length,
    }),
    [baseUrl, setBaseUrl, getCredential, setCredential, clearCredentials, creds]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useRunSettings(): RunSettings {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useRunSettings must be used within RunSettingsProvider");
  return ctx;
}
