import { getResolvedHostContext } from "@/lib/domains/host-context";
import { isProductKey } from "@/lib/products/registry";
import { ProductProvider } from "@/components/ProductContext";

/** Injects host-resolved product into ProductProvider (dedicated product domains). */
export async function HostProductProvider({ children }: { children: React.ReactNode }) {
  const hostContext = await getResolvedHostContext();
  const hostProductId =
    hostContext?.productId && isProductKey(hostContext.productId)
      ? hostContext.productId
      : null;
  return <ProductProvider hostProductId={hostProductId}>{children}</ProductProvider>;
}
