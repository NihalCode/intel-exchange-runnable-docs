import type { Metadata } from "next";
import Link from "next/link";
import { AgentChat } from "@/components/AgentChat";
import { getAppSession } from "@/lib/documentation-auth/session";
import { isAuthEnabled } from "@/lib/documentation-auth/config";
import {
  agentRequiresProductCredentials,
  canUseAgentWithoutStoredProductSecrets,
} from "@/lib/documentation-credentials/agent-access-policy";
import { listValidCredentialProductIds } from "@/lib/documentation-credentials/repository";
import { mergeEnsuredProductIds } from "@/lib/documentation-credentials/access";
import { listDocumentationFeatures } from "@/lib/documentation-features";
import { listProducts } from "@/lib/products/registry";
import { resolveOrganizationContext } from "@/lib/enterprise/organization-context";

export const metadata: Metadata = {
  title: "AI Agent — Cyware API Docs",
  description:
    "Ask grounded questions across Cyware product documentation.",
};

export default async function AgentPage() {
  const session = await getAppSession();
  let credentialReady = !isAuthEnabled() && process.env.NODE_ENV !== "production";
  let credentialedProducts = listProducts().map((product) => product.productId);
  let features: Record<string, boolean> = {};
  let requiresProductCredentials = true;

  if (session && !credentialReady) {
    try {
      const context = await resolveOrganizationContext(session);
      const access = await canUseAgentWithoutStoredProductSecrets({
        organizationId: context.organization.id,
        userId: session.user.id,
        role: context.principal.role,
      });
      credentialReady = access.allowed;
      requiresProductCredentials = await agentRequiresProductCredentials({
        organizationId: context.organization.id,
        role: context.principal.role,
      });
      if (credentialReady) {
        const connected = await listValidCredentialProductIds(
          context.organization.id,
          session.user.id
        );
        credentialedProducts = mergeEnsuredProductIds(
          connected,
          access.pinnedProductId
        );
        if (credentialedProducts.length === 0 && access.pinnedProductId) {
          credentialedProducts = [access.pinnedProductId];
        }
        if (credentialedProducts.length === 0) {
          credentialedProducts = listProducts().map((p) => p.productId);
        }
      }
      features = Object.fromEntries(
        (await listDocumentationFeatures(context.organization.id)).map((flag) => [
          flag.key,
          flag.enabled &&
            (!flag.allowedRoles.length ||
              flag.allowedRoles.includes(context.principal.role)),
        ])
      );
    } catch {
      credentialReady = false;
      credentialedProducts = [];
    }
  }

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="mb-1 text-2xl font-bold tracking-tight">Documentation Agent</h1>
      <p className="mb-3 text-sm text-zinc-600 dark:text-zinc-400">
        Ask grounded questions and generate API examples
        {requiresProductCredentials
          ? " for the Cyware products you have connected at /authentication."
          : ". Open API product credentials are optional for docs answers (admins can require them under Features)."}
      </p>
      {credentialReady ? (
        <AgentChat features={features} credentialedProducts={credentialedProducts} />
      ) : (
        <section className="mt-8 rounded-xl border border-zinc-200 p-8 text-center dark:border-zinc-800">
          <div
            className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-zinc-100 text-zinc-500 dark:bg-zinc-800"
            aria-hidden="true"
          >
            🔒
          </div>
          <h2 className="mt-4 text-lg font-semibold">Connect a product to continue</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-zinc-500">
            The Documentation Agent requires one valid per-user connection to CTIX, CFTR,
            Orchestrate, or CSAP. An administrator can turn this requirement off under Admin
            → Features → Require Open API product credentials for Ask AI.
          </p>
          <Link
            href="/authentication"
            className="mt-5 inline-flex rounded-md bg-sky-600 px-4 py-2 text-sm font-medium text-white"
          >
            Configure authentication
          </Link>
        </section>
      )}
    </div>
  );
}
