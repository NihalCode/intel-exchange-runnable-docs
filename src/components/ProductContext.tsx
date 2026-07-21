"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  ALL_PRODUCTS_ID,
  DEFAULT_PRODUCT_ID,
  getProduct,
  listProducts,
} from "@/lib/products/registry";
import type { ApiProduct } from "@/lib/products/types";

interface ProductContextValue {
  productId: string;
  product: ApiProduct;
  products: ApiProduct[];
  setProductId: (id: string) => void;
  searchScope: "product" | "all";
  setSearchScope: (scope: "product" | "all") => void;
}

const ProductCtx = createContext<ProductContextValue | null>(null);

const STORAGE_KEY = "iedocs.productId";

function productFromPath(pathname: string): string | null {
  const m = pathname.match(/^\/docs\/([^/]+)/);
  if (!m) return null;
  const id = m[1];
  if (getProduct(id)) return id;
  return null;
}

export function ProductProvider({
  children,
  hostProductId = null,
  deploymentProductId = null,
}: {
  children: React.ReactNode;
  hostProductId?: string | null;
  deploymentProductId?: string | null;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const allProducts = useMemo(() => listProducts(), []);
  const pinnedProduct =
    deploymentProductId && getProduct(deploymentProductId)
      ? deploymentProductId
      : null;
  const products = useMemo(
    () =>
      pinnedProduct
        ? allProducts.filter((p) => p.productId === pinnedProduct)
        : allProducts,
    [allProducts, pinnedProduct]
  );
  const productFromRoute = productFromPath(pathname);
  const [savedProductId, setSavedProductId] = useState(DEFAULT_PRODUCT_ID);
  const hostProduct =
    hostProductId && getProduct(hostProductId) ? hostProductId : null;
  const productId =
    pinnedProduct ?? productFromRoute ?? hostProduct ?? savedProductId;
  const [searchScope, setSearchScope] = useState<"product" | "all">("product");

  useEffect(() => {
    if (productFromRoute) return;
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      try {
        const saved = window.localStorage.getItem(STORAGE_KEY);
        if (saved && getProduct(saved)) setSavedProductId(saved);
      } catch {
        /* ignore */
      }
    });
    return () => {
      active = false;
    };
  }, [productFromRoute]);

  const setProductId = useCallback(
    (id: string) => {
      if (pinnedProduct && id !== pinnedProduct && id !== ALL_PRODUCTS_ID) return;
      if (!getProduct(id) && id !== ALL_PRODUCTS_ID) return;
      setSavedProductId(id === ALL_PRODUCTS_ID ? DEFAULT_PRODUCT_ID : id);
      try {
        window.localStorage.setItem(STORAGE_KEY, id === ALL_PRODUCTS_ID ? DEFAULT_PRODUCT_ID : id);
      } catch {
        /* ignore */
      }
      if (id !== ALL_PRODUCTS_ID) {
        router.push(`/docs/${id}`);
      }
    },
    [router, pinnedProduct]
  );

  const product = getProduct(productId) ?? getProduct(DEFAULT_PRODUCT_ID)!;

  const value = useMemo(
    () => ({ productId, product, products, setProductId, searchScope, setSearchScope }),
    [productId, product, products, setProductId, searchScope]
  );

  return <ProductCtx.Provider value={value}>{children}</ProductCtx.Provider>;
}

export function useProduct(): ProductContextValue {
  const ctx = useContext(ProductCtx);
  if (!ctx) throw new Error("useProduct must be used within ProductProvider");
  return ctx;
}

export function ProductSelector({ className = "" }: { className?: string }) {
  const { productId, products, setProductId, searchScope, setSearchScope } = useProduct();

  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`}>
      <label className="flex items-center gap-1.5 text-xs">
        <span className="font-semibold text-[var(--text-secondary)]">Product</span>
        <select
          aria-label="Active documentation product"
          value={productId}
          onChange={(e) => setProductId(e.target.value)}
          className="rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--surface-raised)] px-2 py-1 text-xs font-medium text-[var(--text-primary)]"
        >
          {products.map((p) => (
            <option key={p.productId} value={p.productId}>
              {p.displayLabel}
            </option>
          ))}
        </select>
      </label>
      <label className="flex items-center gap-1.5 text-xs">
        <span className="font-semibold text-[var(--text-secondary)]">Search</span>
        <select
          aria-label="Documentation search scope"
          value={searchScope}
          onChange={(e) => setSearchScope(e.target.value as "product" | "all")}
          className="rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--surface-raised)] px-2 py-1 text-xs text-[var(--text-primary)]"
        >
          <option value="product">This product</option>
          <option value="all">All products</option>
        </select>
      </label>
      <ProductBadge productId={productId} />
    </div>
  );
}

export function ProductBadge({ productId }: { productId: string }) {
  const p = getProduct(productId);
  if (!p) return null;
  return (
    <span
      className="inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
      style={{
        borderColor: `color-mix(in srgb, ${productAccent(productId)} 45%, transparent)`,
        color: productAccent(productId),
        background: `color-mix(in srgb, ${productAccent(productId)} 10%, transparent)`,
      }}
    >
      {p.displayLabel}
    </span>
  );
}

function productAccent(productId: string): string {
  switch (productId) {
    case "ctix":
      return "var(--product-ctix)";
    case "csap":
      return "var(--product-csap)";
    case "orchestrate":
      return "var(--product-orchestrate)";
    case "cftr":
      return "var(--product-cftr)";
    default:
      return "var(--accent-primary)";
  }
}
