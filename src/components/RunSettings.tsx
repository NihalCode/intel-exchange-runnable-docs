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
import { hasProductCredentials } from "@/lib/api-credentials";
import { isOpenApiAuthFresh } from "@/lib/credential-placeholders";
import { isDemoModeEnabled } from "@/lib/demo";
import { baseUrlForProduct } from "@/lib/products/auth";
import {
  credentialKeyForField,
  productConnectionUi,
  type ConnectionFieldKind,
} from "@/lib/products/connection-ui";
import { DEFAULT_PRODUCT_ID } from "@/lib/products/registry";
import { useProduct } from "./ProductContext";

interface RunSettings {
  demoMode: boolean;
  baseUrl: string;
  setBaseUrl: (v: string) => void;
  syncWithProduct: (productId: string) => void;
  activeProductId: string;
  getCredential: (name: string) => string;
  setCredential: (name: string, value: string) => void;
  getConnectionValue: (kind: ConnectionFieldKind) => string;
  setConnectionValue: (kind: ConnectionFieldKind, value: string) => void;
  clearCredentials: () => void;
  secretValues: string[];
  credentialCount: number;
  /** @deprecated use getConnectionValue("access-id") */
  accessId: string;
  /** @deprecated use setConnectionValue("access-id", v) */
  setAccessId: (v: string) => void;
  /** @deprecated use getConnectionValue("secret-key") */
  secretKey: string;
  /** @deprecated use setConnectionValue("secret-key", v) */
  setSecretKey: (v: string) => void;
  generateAuth: () => Promise<AuthParams | null>;
  ensureFreshAuth: () => Promise<string | null>;
  authStatus: "idle" | "generating" | "ok" | "error";
  authError: string;
  authReady: boolean;
  credentialsConfigured: boolean;
}

const Ctx = createContext<RunSettings | null>(null);

const BASE_URLS_KEY = "iedocs.baseUrls";
const LEGACY_BASE_URL_KEY = "iedocs.baseUrl";
const ACCESS_IDS_KEY = "iedocs.accessIds";
const SECRETS_KEY = "iedocs.secrets";
const LEGACY_ACCESS_ID_KEY = "iedocs.accessId";
const LEGACY_SECRET_KEY = "iedocs.secretKey";

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

function readAccessIds(): Record<string, string> {
  try {
    const raw = window.localStorage.getItem(ACCESS_IDS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Record<string, string>;
      if (parsed && typeof parsed === "object") return parsed;
    }
    const legacy = window.localStorage.getItem(LEGACY_ACCESS_ID_KEY);
    if (legacy) return { ctix: legacy };
  } catch {
    /* ignore */
  }
  return {};
}

function writeAccessIds(ids: Record<string, string>) {
  try {
    window.localStorage.setItem(ACCESS_IDS_KEY, JSON.stringify(ids));
    window.localStorage.removeItem(LEGACY_ACCESS_ID_KEY);
  } catch {
    /* ignore */
  }
}

function readSecrets(): Record<string, string> {
  try {
    const raw = window.sessionStorage.getItem(SECRETS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Record<string, string>;
      if (parsed && typeof parsed === "object") return parsed;
    }
    const legacy = window.sessionStorage.getItem(LEGACY_SECRET_KEY);
    if (legacy) return { ctix: legacy };
  } catch {
    /* ignore */
  }
  return {};
}

function writeSecrets(secrets: Record<string, string>) {
  try {
    window.sessionStorage.setItem(SECRETS_KEY, JSON.stringify(secrets));
    window.sessionStorage.removeItem(LEGACY_SECRET_KEY);
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
  const accessIdsRef = useRef<Record<string, string>>({});
  const secretsRef = useRef<Record<string, string>>({});
  const activeProductRef = useRef(DEFAULT_PRODUCT_ID);
  const [activeProductId, setActiveProductId] = useState(DEFAULT_PRODUCT_ID);
  const baseUrlRef = useRef(defaultBaseUrl);

  useEffect(() => {
    credsRef.current = creds;
  }, [creds]);

  useEffect(() => {
    baseUrlRef.current = baseUrl;
  }, [baseUrl]);

  const loadProductCredentials = useCallback((productId: string) => {
    const id = accessIdsRef.current[productId] ?? "";
    const sk = secretsRef.current[productId] ?? "";
    setAccessIdState(id);
    secretKeyRef.current = sk;
    setSecretKeyState(sk);
    setCreds((prev) => ({
      ...prev,
      accessid: id,
      secretkey: sk,
    }));
    setAuthStatus("idle");
    setAuthError("");
  }, []);

  useEffect(() => {
    try {
      const urls = readStoredBaseUrls(defaultBaseUrl);
      baseUrlsRef.current = urls;
      accessIdsRef.current = readAccessIds();
      secretsRef.current = readSecrets();
      const initial = urls[DEFAULT_PRODUCT_ID] ?? defaultBaseUrl;
      let active = true;
      queueMicrotask(() => {
        if (!active) return;
        setBaseUrlState(initial);
        loadProductCredentials(DEFAULT_PRODUCT_ID);
      });
      return () => {
        active = false;
      };
    } catch {
      /* ignore */
    }
  }, [defaultBaseUrl, loadProductCredentials]);

  const setBaseUrl = useCallback((v: string) => {
    setBaseUrlState(v);
    const pid = activeProductRef.current;
    baseUrlsRef.current = { ...baseUrlsRef.current, [pid]: v };
    writeStoredBaseUrls(baseUrlsRef.current);
  }, []);

  const syncWithProduct = useCallback(
    (productId: string) => {
      const prev = activeProductRef.current;
      if (prev !== productId) {
        accessIdsRef.current = { ...accessIdsRef.current, [prev]: accessId };
        secretsRef.current = { ...secretsRef.current, [prev]: secretKeyRef.current };
        writeAccessIds(accessIdsRef.current);
        writeSecrets(secretsRef.current);
        baseUrlsRef.current = { ...baseUrlsRef.current, [prev]: baseUrlRef.current };
      }
      activeProductRef.current = productId;
      setActiveProductId(productId);
      const next =
        baseUrlsRef.current[productId] ?? baseUrlForProduct(productId);
      setBaseUrlState(next);
      baseUrlsRef.current = { ...baseUrlsRef.current, [productId]: next };
      writeStoredBaseUrls(baseUrlsRef.current);
      loadProductCredentials(productId);
    },
    [accessId, loadProductCredentials]
  );

  const setAccessId = useCallback(
    (v: string) => {
      const pid = activeProductRef.current;
      setAccessIdState(v);
      accessIdsRef.current = { ...accessIdsRef.current, [pid]: v };
      writeAccessIds(accessIdsRef.current);
      setCreds((p) => ({ ...p, accessid: v }));
      setAuthStatus("idle");
    },
    []
  );

  const setSecretKey = useCallback((v: string) => {
    const pid = activeProductRef.current;
    secretKeyRef.current = v;
    setSecretKeyState(v);
    secretsRef.current = { ...secretsRef.current, [pid]: v };
    writeSecrets(secretsRef.current);
    setAuthStatus("idle");
  }, []);

  const getConnectionValue = useCallback(
    (kind: ConnectionFieldKind): string => {
      const key = credentialKeyForField(kind);
      if (key === "accessid") return accessId.trim();
      if (key === "secretkey") return secretKey;
      return credsRef.current[key] ?? "";
    },
    [accessId, secretKey]
  );

  const setConnectionValue = useCallback(
    (kind: ConnectionFieldKind, value: string) => {
      const key = credentialKeyForField(kind);
      if (key === "accessid") {
        setAccessId(value);
        return;
      }
      if (key === "secretkey") {
        setSecretKey(value);
        return;
      }
      setCreds((prev) => ({ ...prev, [key]: value }));
      credsRef.current = { ...credsRef.current, [key]: value };
      if (productConnectionUi(activeProductRef.current).fields.find((f) => f.kind === kind)?.persistence === "session") {
        const pid = activeProductRef.current;
        secretsRef.current = { ...secretsRef.current, [`${pid}:${key}`]: value };
        writeSecrets(secretsRef.current);
      }
      setAuthStatus("idle");
    },
    [setAccessId, setSecretKey]
  );

  const getCredential = useCallback((name: string) => {
    const key = name.toLowerCase();
    if (key === "accessid") {
      return accessId.trim() || credsRef.current.accessid || "";
    }
    if (key === "secretkey") {
      return secretKeyRef.current || credsRef.current.secretkey || "";
    }
    return credsRef.current[key] ?? "";
  }, [accessId]);

  const setCredential = useCallback((name: string, value: string) => {
    setCreds((prev) => ({ ...prev, [name.toLowerCase()]: value }));
  }, []);

  const clearCredentials = useCallback(() => {
    const pid = activeProductRef.current;
    setCreds({});
    credsRef.current = {};
    setSecretKeyState("");
    secretKeyRef.current = "";
    setAccessIdState("");
    accessIdsRef.current = { ...accessIdsRef.current, [pid]: "" };
    secretsRef.current = { ...secretsRef.current, [pid]: "" };
    writeAccessIds(accessIdsRef.current);
    writeSecrets(secretsRef.current);
    setAuthStatus("idle");
    setAuthError("");
  }, []);

  const generateAuth = useCallback(async (): Promise<AuthParams | null> => {
    const id = accessId.trim();
    const sk = secretKeyRef.current.trim();
    const ui = productConnectionUi(activeProductRef.current);
    if (!id || !sk) {
      const labels = ui.fields.map((f) => f.label).join(" and ");
      setAuthError(`Enter ${labels} in the API connection panel.`);
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
    const ui = productConnectionUi(activeProductRef.current);
    if (!ui.usesOpenApi) return null;

    const id = accessId.trim();
    const sk = secretKeyRef.current.trim();
    if (!id || !sk) {
      const labels = ui.fields.map((f) => f.label).join(" and ");
      return `Enter ${labels} in the connection panel, then click Run.`;
    }

    if (isOpenApiAuthFresh(getCredential)) {
      return null;
    }

    const params = await generateAuth();
    if (!params) {
      return "Could not generate Signature and Expires. Check credentials in the connection panel.";
    }
    return null;
  }, [accessId, generateAuth, getCredential]);

  const stateCredential = useCallback(
    (name: string) => {
      const key = name.toLowerCase();
      if (key === "accessid") return accessId.trim();
      if (key === "secretkey") return secretKey;
      return creds[key] ?? "";
    },
    [accessId, creds, secretKey]
  );
  const authReady = isOpenApiAuthFresh(stateCredential);
  const credentialsConfigured = hasProductCredentials(activeProductId, stateCredential);

  const value = useMemo<RunSettings>(
    () => ({
      demoMode: isDemoModeEnabled(),
      baseUrl,
      setBaseUrl,
      syncWithProduct,
      activeProductId,
      getCredential,
      setCredential,
      getConnectionValue,
      setConnectionValue,
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
      credentialsConfigured,
    }),
    [
      baseUrl,
      setBaseUrl,
      syncWithProduct,
      getCredential,
      setCredential,
      getConnectionValue,
      setConnectionValue,
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
      credentialsConfigured,
      activeProductId,
    ]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useRunSettings(): RunSettings {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useRunSettings must be used within RunSettingsProvider");
  return ctx;
}

/** Keeps API base URL and credentials in sync with the selected product. */
export function ProductRunSettingsSync() {
  const { productId } = useProduct();
  const { syncWithProduct } = useRunSettings();

  useEffect(() => {
    syncWithProduct(productId);
  }, [productId, syncWithProduct]);

  return null;
}

/** @deprecated Use ApiConnectionPanel inline on runners instead. */
export function AutoAuthNotice() {
  return null;
}
