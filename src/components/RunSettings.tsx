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
import { generateAuthParams, type AuthParams } from "@/lib/auth-gen";
import { isOpenApiAuthFresh } from "@/lib/credential-placeholders";
import { isDemoModeEnabled } from "@/lib/demo";
import { baseUrlForProduct } from "@/lib/products/auth";
import { DEFAULT_PRODUCT_ID } from "@/lib/products/registry";
import { useProduct } from "./ProductContext";

interface RunSettings {
  /** Docs clone: simulate API responses without a Cyware tenant. */
  demoMode: boolean;
  baseUrl: string;
  setBaseUrl: (v: string) => void;
  /** Switch displayed base URL when the active product changes. */
  syncWithProduct: (productId: string) => void;
  /** Returns any credential value by name (case-insensitive) */
  getCredential: (name: string) => string;
  setCredential: (name: string, value: string) => void;
  clearCredentials: () => void;
  secretValues: string[];
  credentialCount: number;
  accessId: string;
  setAccessId: (v: string) => void;
  secretKey: string;
  setSecretKey: (v: string) => void;
  /** Generate Signature + Expires (always refreshes). */
  generateAuth: () => Promise<AuthParams | null>;
  /** Generate auth only when missing or Expires has passed; used on Run. */
  ensureFreshAuth: () => Promise<string | null>;
  authStatus: "idle" | "generating" | "ok" | "error";
  authError: string;
  authReady: boolean;
}

const Ctx = createContext<RunSettings | null>(null);

const BASE_URLS_KEY = "iedocs.baseUrls";
const LEGACY_BASE_URL_KEY = "iedocs.baseUrl";
const ACCESS_ID_KEY = "iedocs.accessId";
const SECRET_KEY_SESSION = "iedocs.secretKey";

function readStoredBaseUrls(defaultBaseUrl: string): Record<string, string> {
  try {
    const raw = window.localStorage.getItem(BASE_URLS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Record<string, string>;
      if (parsed && typeof parsed === "object") return parsed;
    }
    const legacy = window.localStorage.getItem(LEGACY_BASE_URL_KEY);
    if (legacy) return { ctix: legacy };
  } catch {
    /* ignore */
  }
  return { ctix: defaultBaseUrl };
}

function writeStoredBaseUrls(urls: Record<string, string>) {
  try {
    window.localStorage.setItem(BASE_URLS_KEY, JSON.stringify(urls));
  } catch {
    /* ignore */
  }
}

export function RunSettingsProvider({
  defaultBaseUrl,
  children,
}: {
  defaultBaseUrl: string;
  children: React.ReactNode;
}) {
  const [baseUrl, setBaseUrlState] = useState(defaultBaseUrl);
  const [creds, setCreds] = useState<Record<string, string>>({});
  const credsRef = useRef<Record<string, string>>({});
  const [accessId, setAccessIdState] = useState("");
  const secretKeyRef = useRef("");
  const [secretKey, setSecretKeyState] = useState("");
  const [authStatus, setAuthStatus] = useState<"idle" | "generating" | "ok" | "error">("idle");
  const [authError, setAuthError] = useState("");
  const baseUrlsRef = useRef<Record<string, string>>({ ctix: defaultBaseUrl });
  const activeProductRef = useRef(DEFAULT_PRODUCT_ID);
  const baseUrlRef = useRef(defaultBaseUrl);

  useEffect(() => {
    credsRef.current = creds;
  }, [creds]);

  useEffect(() => {
    baseUrlRef.current = baseUrl;
  }, [baseUrl]);

  useEffect(() => {
    try {
      const urls = readStoredBaseUrls(defaultBaseUrl);
      baseUrlsRef.current = urls;
      const initial = urls[DEFAULT_PRODUCT_ID] ?? defaultBaseUrl;
      setBaseUrlState(initial);
      const savedId = window.localStorage.getItem(ACCESS_ID_KEY);
      if (savedId) {
        setAccessIdState(savedId);
        setCreds((p) => ({ ...p, accessid: savedId }));
      }
      const savedSecret = window.sessionStorage.getItem(SECRET_KEY_SESSION);
      if (savedSecret) {
        secretKeyRef.current = savedSecret;
        setSecretKeyState(savedSecret);
      }
    } catch {
      /* ignore */
    }
  }, [defaultBaseUrl]);

  const setBaseUrl = useCallback((v: string) => {
    setBaseUrlState(v);
    const pid = activeProductRef.current;
    baseUrlsRef.current = { ...baseUrlsRef.current, [pid]: v };
    writeStoredBaseUrls(baseUrlsRef.current);
  }, []);

  const syncWithProduct = useCallback((productId: string) => {
    const prev = activeProductRef.current;
    if (prev !== productId) {
      baseUrlsRef.current = { ...baseUrlsRef.current, [prev]: baseUrlRef.current };
    }
    activeProductRef.current = productId;
    const next =
      baseUrlsRef.current[productId] ?? baseUrlForProduct(productId);
    setBaseUrlState(next);
    baseUrlsRef.current = { ...baseUrlsRef.current, [productId]: next };
    writeStoredBaseUrls(baseUrlsRef.current);
  }, []);

  const setAccessId = useCallback((v: string) => {
    setAccessIdState(v);
    setCreds((p) => ({ ...p, accessid: v }));
    try {
      window.localStorage.setItem(ACCESS_ID_KEY, v);
    } catch {
      /* ignore */
    }
  }, []);

  const setSecretKey = useCallback((v: string) => {
    secretKeyRef.current = v;
    setSecretKeyState(v);
    try {
      if (v) window.sessionStorage.setItem(SECRET_KEY_SESSION, v);
      else window.sessionStorage.removeItem(SECRET_KEY_SESSION);
    } catch {
      /* ignore */
    }
  }, []);

  const getCredential = useCallback((name: string) => {
    const key = name.toLowerCase();
    if (key === "accessid") {
      return accessId.trim() || credsRef.current.accessid || "";
    }
    return credsRef.current[key] ?? "";
  }, [accessId]);

  const setCredential = useCallback((name: string, value: string) => {
    setCreds((prev) => ({ ...prev, [name.toLowerCase()]: value }));
  }, []);

  const clearCredentials = useCallback(() => {
    setCreds({});
    credsRef.current = {};
    setSecretKeyState("");
    secretKeyRef.current = "";
    setAuthStatus("idle");
    setAuthError("");
    try {
      window.sessionStorage.removeItem(SECRET_KEY_SESSION);
    } catch {
      /* ignore */
    }
  }, []);

  const generateAuth = useCallback(async (): Promise<AuthParams | null> => {
    const id = accessId.trim();
    const sk = secretKeyRef.current.trim();
    if (!id || !sk) {
      setAuthError("Enter both Access ID and Secret Key in API Settings first.");
      setAuthStatus("error");
      return null;
    }
    setAuthStatus("generating");
    setAuthError("");
    try {
      const params = await generateAuthParams(id, sk);
      const next = {
        accessid: params.accessId,
        signature: params.signature,
        expires: String(params.expires),
      };
      credsRef.current = { ...credsRef.current, ...next };
      setCreds((prev) => ({ ...prev, ...next }));
      setAuthStatus("ok");
      return params;
    } catch (e) {
      setAuthError(e instanceof Error ? e.message : "Failed to generate signature.");
      setAuthStatus("error");
      return null;
    }
  }, [accessId]);

  const ensureFreshAuth = useCallback(async (): Promise<string | null> => {
    const id = accessId.trim();
    const sk = secretKeyRef.current.trim();
    if (!id || !sk) {
      return "Open API credentials required. Set Access ID and Secret Key in API Settings (header), then click Run.";
    }

    if (isOpenApiAuthFresh(getCredential)) {
      return null;
    }

    const params = await generateAuth();
    if (!params) {
      return "Could not generate Signature and Expires. Check Access ID and Secret Key in API Settings.";
    }
    return null;
  }, [accessId, generateAuth, getCredential]);

  const authReady = isOpenApiAuthFresh(getCredential);

  const value = useMemo<RunSettings>(
    () => ({
      demoMode: isDemoModeEnabled(),
      baseUrl,
      setBaseUrl,
      syncWithProduct,
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
      ensureFreshAuth,
      authStatus,
      authError,
      authReady,
    }),
    [
      baseUrl,
      setBaseUrl,
      syncWithProduct,
      getCredential,
      setCredential,
      clearCredentials,
      creds,
      accessId,
      setAccessId,
      secretKey,
      setSecretKey,
      generateAuth,
      ensureFreshAuth,
      authStatus,
      authError,
      authReady,
    ]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useRunSettings(): RunSettings {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useRunSettings must be used within RunSettingsProvider");
  return ctx;
}

/** Keeps API base URL in sync with the selected product. */
export function ProductRunSettingsSync() {
  const { productId } = useProduct();
  const { syncWithProduct } = useRunSettings();

  useEffect(() => {
    syncWithProduct(productId);
  }, [productId, syncWithProduct]);

  return null;
}

/** Shown on endpoint pages — auth is auto-generated on Run, not typed per snippet. */
export function AutoAuthNotice() {
  const { accessId, secretKey, authReady, getCredential, authStatus } = useRunSettings();
  const hasKeys = accessId.trim().length > 0 && secretKey.trim().length > 0;
  const exp = getCredential("expires");

  if (!hasKeys) {
    return (
      <div className="rounded-md border border-amber-400/50 bg-amber-50/50 p-3 text-xs text-amber-800 dark:bg-amber-950/20 dark:text-amber-300">
        <strong>Auth:</strong> Open <em>API Settings</em> in the header and enter your{" "}
        <strong>Access ID</strong> and <strong>Secret Key</strong> once. Signature and Expires
        are generated automatically when you click Run.
      </div>
    );
  }

  return (
    <div
      className={`rounded-md border p-3 text-xs ${
        authReady
          ? "border-emerald-400/50 bg-emerald-50/50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/20 dark:text-emerald-200"
          : "border-sky-400/50 bg-sky-50/50 text-sky-900 dark:border-sky-800 dark:bg-sky-950/20 dark:text-sky-200"
      }`}
    >
      <strong>Auth:</strong> Access ID configured
      {authReady ? (
        <>
          {" "}
          · Signature valid until <code className="font-mono">{exp}</code> (refreshes on Run when
          expired)
        </>
      ) : authStatus === "generating" ? (
        <> · Generating Signature &amp; Expires…</>
      ) : (
        <> · Signature &amp; Expires will be generated when you click Run</>
      )}
    </div>
  );
}
