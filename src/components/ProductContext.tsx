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

export function ProductProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const products = useMemo(() => listProducts(), []);
  const productFromRoute = productFromPath(pathname);
  const [savedProductId, setSavedProductId] = useState(DEFAULT_PRODUCT_ID);
  const productId = productFromRoute ?? savedProductId;
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
    [router]
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
        <span className="font-semibold text-zinc-600 dark:text-zinc-400">Product</span>
        <select
          aria-label="Active documentation product"
          value={productId}
          onChange={(e) => setProductId(e.target.value)}
          className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs font-medium dark:border-zinc-600 dark:bg-zinc-900"
        >
          {products.map((p) => (
            <option key={p.productId} value={p.productId}>
              {p.displayLabel}
            </option>
          ))}
        </select>
      </label>
      <label className="flex items-center gap-1.5 text-xs">
        <span className="font-semibold text-zinc-600 dark:text-zinc-400">Search</span>
        <select
          aria-label="Documentation search scope"
          value={searchScope}
          onChange={(e) => setSearchScope(e.target.value as "product" | "all")}
          className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs dark:border-zinc-600 dark:bg-zinc-900"
        >
          <option value="product">This product</option>
          <option value="all">All products</option>
        </select>
      </label>
      <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-sky-800 dark:bg-sky-950 dark:text-sky-300">
        {productId}
      </span>
    </div>
  );
}

export function ProductBadge({ productId }: { productId: string }) {
  const p = getProduct(productId);
  if (!p) return null;
  return (
    <span className="inline-flex items-center rounded-full border border-zinc-300 px-2 py-0.5 text-[10px] font-semibold uppercase text-zinc-600 dark:border-zinc-600 dark:text-zinc-400">
      {p.displayLabel}
    </span>
  );
}
