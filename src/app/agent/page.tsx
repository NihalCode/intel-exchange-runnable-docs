import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AgentChat } from "@/components/AgentChat";
import { SignalField } from "@/components/fabric/SignalField";
import { getAppSession } from "@/lib/documentation-auth/session";
import { isAuthEnabled } from "@/lib/documentation-auth/config";
import {
  agentRequiresProductCredentials,
  canUseAgentWithoutStoredProductSecrets,
} from "@/lib/documentation-credentials/agent-access-policy";
import { listValidCredentialProductIds } from "@/lib/documentation-credentials/repository";
import { mergeEnsuredProductIds } from "@/lib/documentation-credentials/access";
import {
  listDocumentationFeatures,
} from "@/lib/documentation-features";
import { listProducts } from "@/lib/products/registry";
import { resolveOrganizationContext } from "@/lib/enterprise/organization-context";
import { resolveViewerAskAiAccessEnabled } from "@/lib/domains/feature-gates-resolve";

export const metadata: Metadata = {
  title: "AI Agent — Cyware API Docs",
  description: "Ask grounded questions across Cyware product documentation.",
};

export default async function AgentPage() {
  const session = await getAppSession();
  let credentialReady = !isAuthEnabled() && process.env.NODE_ENV !== "production";
  let credentialedProducts = listProducts().map((product) => product.productId);
  let features: Record<string, boolean> = {};
  let requiresProductCredentials = true;

  // Unsigned viewers: Ask AI chat is open; live snippet Run stays gated elsewhere.
  if (!session) {
    credentialReady = true;
    requiresProductCredentials = false;
    credentialedProducts = listProducts().map((p) => p.productId);
    // Empty feature maps previously hid thumbs; always show for open Ask AI.
    features = { chat_feedback: true };
  } else if (session.user.role === "viewer") {
    // Fail closed for signed-in Viewer before credential shortcuts.
    try {
      const context = await resolveOrganizationContext(session);
      const viewerAllowed = await resolveViewerAskAiAccessEnabled({
        organizationId: context.organization.id,
        role: context.principal.role,
      });
      if (!viewerAllowed) {
        notFound();
      }
      credentialReady = true;
      credentialedProducts = listProducts().map((p) => p.productId);
      requiresProductCredentials = false;
      features = Object.fromEntries(
        (await listDocumentationFeatures(context.organization.id)).map((flag) => [
          flag.key,
          flag.enabled &&
            (!flag.allowedRoles.length ||
              flag.allowedRoles.includes(context.principal.role)),
        ])
      );
      // Ask AI is available for viewers → always show thumbs.
      features.chat_feedback = true;
    } catch {
      notFound();
    }
  } else if (!credentialReady) {
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
        // Pinned product hosts must not advertise other connected products.
        if (access.pinnedProductId) {
          credentialedProducts = [access.pinnedProductId];
        } else if (credentialedProducts.length === 0) {
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
      features.chat_feedback = true;
    } catch {
      credentialReady = false;
      credentialedProducts = [];
    }
  } else {
    try {
      const context = await resolveOrganizationContext(session);
      features = Object.fromEntries(
        (await listDocumentationFeatures(context.organization.id)).map((flag) => [
          flag.key,
          flag.enabled &&
            (!flag.allowedRoles.length ||
              flag.allowedRoles.includes(context.principal.role)),
        ])
      );
      features.chat_feedback = true;
    } catch {
      /* keep AUTH_DISABLED credential shortcut */
      features = { ...features, chat_feedback: true };
    }
  }

  // Belt-and-suspenders: Ask AI page always exposes thumbs controls.
  features = { ...features, chat_feedback: true };

  const docsPreviewMode = !isAuthEnabled() && process.env.NODE_ENV !== "production";

  return (
    <SignalField intensity="strong" topology className="cx-ask-page -mx-1 rounded-[var(--radius-xl)] px-1 py-1 sm:-mx-2 sm:px-2">
      <div className="cx-ask-page__intro">
        <p className="cx-ask-page__eyebrow">
          <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent-primary)] sf-signal-pulse" aria-hidden="true" />
          Ask Intelligence
        </p>
        <h1 className="text-2xl font-medium tracking-[-0.03em] text-[var(--text-heading)] sm:text-[1.75rem]">
          Analyst workstation
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-[var(--text-secondary)]">
          Investigate with grounded answers and generate API examples
          {requiresProductCredentials
            ? " for the Cyware products you have connected at /authentication."
            : ". Open API product credentials are optional for docs answers (admins can require them under Features)."}
        </p>
      </div>
      {credentialReady ? (
        <AgentChat
          features={features}
          credentialedProducts={credentialedProducts}
          docsPreviewMode={docsPreviewMode}
        />
      ) : (
        <section className="cx-ask-gate">
          <div
            className="mx-auto flex h-11 w-11 items-center justify-center rounded-2xl border border-[var(--border-default)] bg-[var(--surface-muted)] text-[var(--text-secondary)]"
            aria-hidden="true"
          >
            <LockIcon />
          </div>
          <h2 className="mt-4 text-lg font-semibold text-[var(--text-heading)]">
            Connect a product to continue
          </h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-[var(--text-secondary)]">
            The Documentation Agent requires one valid per-user connection to CTIX, CFTR,
            Orchestrate, or CSAP. An administrator can turn this requirement off under Admin
            → Features → Require Open API product credentials for Ask AI.
          </p>
          <Link
            href="/authentication"
            className="mt-5 inline-flex rounded-[var(--radius-md)] bg-[var(--accent-primary)] px-4 py-2 text-sm font-medium text-white shadow-[0_8px_20px_color-mix(in_srgb,var(--accent-primary)_28%,transparent)] transition hover:bg-[var(--accent-primary-hover)]"
          >
            Configure authentication
          </Link>
        </section>
      )}
    </SignalField>
  );
}

function LockIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path strokeLinecap="round" d="M8 11V8a4 4 0 018 0v3" />
    </svg>
  );
}
