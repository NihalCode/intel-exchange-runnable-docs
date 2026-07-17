import { getResolvedHostContext } from "@/lib/domains/host-context";
import { effectiveDeploymentProductId, isSingleProductDeployment } from "@/lib/deployment/resolve-app-product-id";
import { isProductKey } from "@/lib/products/registry";
import { ProductProvider } from "@/components/ProductContext";

/** Injects host-resolved and deployment-pinned product into ProductProvider. */
export async function HostProductProvider({ children }: { children: React.ReactNode }) {
  const hostContext = await getResolvedHostContext();
  const hostProductId =
    hostContext?.productId && isProductKey(hostContext.productId)
      ? hostContext.productId
      : null;
  const deploymentProductId = isSingleProductDeployment()
    ? effectiveDeploymentProductId()
    : null;
  return (
    <ProductProvider
      hostProductId={hostProductId}
      deploymentProductId={deploymentProductId}
    >
      {children}
    </ProductProvider>
  );
}
