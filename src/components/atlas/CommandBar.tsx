"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, Search } from "lucide-react";
import type { ReactNode } from "react";

import { authReturnToFromPath } from "@/lib/documentation-auth/auth-return-to-path";
import { useDocumentationAuth } from "@/components/auth/DocumentationAuthProvider";
import { ProductSelector, useProduct } from "@/components/ProductContext";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { LiveStatus } from "@/components/atlas/primitives";
import { atlasBreadcrumbs } from "@/components/atlas/nav-model";
import { getProduct } from "@/lib/products/registry";

function AuthControl() {
  const pathname = usePathname();
  const { state } = useDocumentationAuth();

  if (state.loading) {
    return (
      <span
        className="inline-block h-8 w-14 shrink-0"
        aria-hidden="true"
        data-testid="auth-header-loading"
      />
    );
  }

  if (!state.authenticated || !state.user) {
    const deniedReason = state.accessDenied?.reason;
    const signInHref = deniedReason
      ? `/sign-in?error=${encodeURIComponent(
          deniedReason === "wrong_invite_email"
            ? "wrong_email"
            : deniedReason === "expired_invite"
              ? "expired_invite"
              : deniedReason === "disabled"
                ? "disabled"
                : deniedReason === "invite_required"
                  ? "invite_required"
                  : "auth_denied"
        )}`
      : `/sign-in?returnTo=${encodeURIComponent(authReturnToFromPath(pathname))}`;
    return (
      <Link href={signInHref} data-testid="auth-header-sign-in" className="atlas-btn-primary atlas-btn-sm">
        Sign in
      </Link>
    );
  }

  const label = state.user.name || state.user.email;
  return (
    <Link
      href="/auth/logout"
      data-testid="auth-header-profile"
      title={`${label} — sign out`}
      aria-label={`${label} — sign out`}
      className="atlas-avatar-btn"
    >
      {label.slice(0, 1).toUpperCase()}
    </Link>
  );
}

export function CommandBar({
  onOpenMobileNav,
  onOpenPalette,
  trailing,
}: {
  onOpenMobileNav: () => void;
  onOpenPalette: () => void;
  trailing?: ReactNode;
}) {
  const pathname = usePathname();
  const { productId } = useProduct();
  const product = getProduct(productId);
  const crumbs = atlasBreadcrumbs(pathname, product?.displayLabel ?? productId);

  return (
    <header className="atlas-command-bar" data-testid="atlas-command-bar" data-layout="cx-header">
      <div className="atlas-command-bar__inner">
        <div className="atlas-command-bar__left">
          <button
            type="button"
            onClick={onOpenMobileNav}
            aria-label="Open menu"
            data-testid="nav-drawer-toggle"
            className="atlas-icon-btn lg:hidden"
          >
            <Menu size={18} strokeWidth={1.5} />
            <span className="sr-only">Menu</span>
          </button>
          <nav aria-label="Breadcrumb" className="atlas-breadcrumb">
            {crumbs.map((c, i) => (
              <span key={`${c}-${i}`} className="atlas-breadcrumb__item">
                {i > 0 ? <span className="atlas-breadcrumb__sep" aria-hidden="true" /> : null}
                <span>{c}</span>
              </span>
            ))}
          </nav>
        </div>

        <div className="atlas-command-bar__center">
          <ProductSelector className="atlas-product-selector" />
          <LiveStatus label="Network live" />
        </div>

        <div className="atlas-command-bar__right" data-layout="cx-header-actions">
          <button
            type="button"
            className="atlas-search-trigger"
            data-testid="atlas-search-trigger"
            onClick={onOpenPalette}
            aria-label="Open command palette"
          >
            <Search size={14} strokeWidth={1.5} aria-hidden="true" />
            <span className="hidden sm:inline">Search</span>
            <kbd className="atlas-kbd">⌘K</kbd>
          </button>
          {trailing}
          <ThemeToggle />
          <AuthControl />
        </div>
      </div>
    </header>
  );
}
