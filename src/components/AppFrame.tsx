"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import type { NavNode } from "@/lib/types";
import { ProductSelector, useProduct } from "./ProductContext";
import { ProductRunSettingsSync } from "./RunSettings";
import { Sidebar } from "./Sidebar";
import { useFocusTrap } from "./useFocusTrap";
import { CxFooter } from "@/components/cx";
import { CommandPalette } from "@/components/fabric/CommandPalette";
import { CommandBar, CommandRail } from "@/components/atlas";

export function AppFrame({
  nav: initialNav,
  children,
}: {
  nav: NavNode[];
  children: ReactNode;
}) {
  return <AppFrameInner nav={initialNav}>{children}</AppFrameInner>;
}

function AppFrameInner({
  nav: initialNav,
  children,
}: {
  nav: NavNode[];
  children: ReactNode;
}) {
  const pathname = usePathname();
  const { productId } = useProduct();
  const [remoteNav, setRemoteNav] = useState<{
    productId: string;
    nav: NavNode[];
  } | null>(null);
  const [railCollapsed, setRailCollapsed] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      return localStorage.getItem("atlas-rail-collapsed") === "1";
    } catch {
      return false;
    }
  });
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const drawerRef = useFocusTrap(drawerOpen, () => setDrawerOpen(false));

  const nav =
    remoteNav?.productId === productId
      ? remoteNav.nav
      : productId === "ctix"
        ? initialNav
        : [];

  useEffect(() => {
    let cancelled = false;
    async function loadNav() {
      try {
        const res = await fetch(`/api/products/${productId}`);
        if (!res.ok) {
          if (cancelled) return;
          setRemoteNav({
            productId,
            nav: productId === "ctix" ? initialNav : [],
          });
          return;
        }
        const data = await res.json();
        if (cancelled) return;
        if (data.manifest?.nav) {
          setRemoteNav({ productId, nav: data.manifest.nav });
        } else {
          setRemoteNav({
            productId,
            nav: productId === "ctix" ? initialNav : [],
          });
        }
      } catch {
        if (cancelled) return;
        setRemoteNav({
          productId,
          nav: productId === "ctix" ? initialNav : [],
        });
      }
    }
    void loadNav();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- productId is the intentional trigger
  }, [productId]);

  function toggleRail() {
    setRailCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("atlas-rail-collapsed", next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  const { currentSlug, activeProductId } = parseDocsPath(pathname);
  const sidebarProductId = activeProductId ?? productId;
  const isDocsRoute = pathname.startsWith("/docs/");
  const isHome = pathname === "/";
  const isAskAi = pathname === "/agent" || pathname.startsWith("/agent/");
  const showDocsRail = isDocsRoute;

  return (
    <div
      className="cx-app-shell"
      data-testid="app-frame"
      data-layout="cx-app-shell"
      data-atlas="true"
    >
      <ProductRunSettingsSync />
      <CommandPalette
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
        preferPlainShortcut
      />
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>

      <CommandRail
        collapsed={railCollapsed}
        onToggleCollapsed={toggleRail}
      />

      <div className="atlas-shell-main">
        <CommandBar
          onOpenMobileNav={() => setDrawerOpen(true)}
          onOpenPalette={() => setPaletteOpen(true)}
        />

        <div className="atlas-docs-body cx-docs-body">
          {showDocsRail ? (
            <aside className="atlas-docs-rail" data-layout="cx-docs-left-rail">
              <div className="atlas-docs-rail__sticky">
                <Sidebar
                  nav={nav}
                  currentSlug={currentSlug}
                  productId={sidebarProductId}
                  onNavigate={() => {}}
                />
              </div>
            </aside>
          ) : null}

          {drawerOpen ? (
            <div className="fixed inset-0 z-50 lg:hidden">
              <div
                className="absolute inset-0 bg-[var(--surface-overlay)]"
                onClick={() => setDrawerOpen(false)}
              />
              <aside
                ref={drawerRef}
                id="documentation-navigation-drawer"
                tabIndex={-1}
                role="dialog"
                aria-modal="true"
                aria-label="Command navigation"
                data-layout="cx-mobile-drawer"
                className="absolute left-0 top-0 flex h-full w-[min(22rem,92%)] flex-col border-r border-[var(--border-default)] bg-[var(--surface-raised)] shadow-[var(--shadow-drawer)]"
              >
                <div className="border-b border-[var(--border-subtle)] p-3">
                  <ProductSelector className="w-full" />
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto">
                  <CommandRail
                    collapsed={false}
                    mobile
                    onNavigate={() => setDrawerOpen(false)}
                  />
                  {showDocsRail ? (
                    <div className="border-t border-[var(--border-subtle)]">
                      <p className="atlas-micro-label px-4 pt-3">Knowledge tree</p>
                      <Sidebar
                        nav={nav}
                        currentSlug={currentSlug}
                        productId={sidebarProductId}
                        onNavigate={() => setDrawerOpen(false)}
                      />
                    </div>
                  ) : null}
                </div>
                <div className="border-t border-[var(--border-subtle)] p-3">
                  <Link
                    href={`/docs/${sidebarProductId}`}
                    className="text-xs text-[var(--text-link)]"
                    onClick={() => setDrawerOpen(false)}
                  >
                    Open Knowledge Atlas
                  </Link>
                </div>
              </aside>
            </div>
          ) : null}

          <div className="flex min-w-0 flex-1 flex-col">
            <main
              id="main-content"
              tabIndex={-1}
              data-layout="cx-main"
              className={`min-w-0 flex-1 ${
                isHome ? "" : isAskAi ? "px-2 py-2 sm:px-3 sm:py-3" : "px-3 py-4 sm:px-6"
              }`}
            >
              {children}
            </main>
            {isHome || pathname.startsWith("/guides") || pathname === "/changelog" ? (
              <CxFooter />
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function parseDocsPath(pathname: string): {
  currentSlug: string;
  activeProductId: string | null;
} {
  if (!pathname.startsWith("/docs/")) return { currentSlug: "", activeProductId: null };
  const rest = decodeURIComponent(pathname.slice("/docs/".length));
  const parts = rest.split("/");
  const known = ["ctix", "csap", "orchestrate", "cftr"];
  if (known.includes(parts[0])) {
    return { activeProductId: parts[0], currentSlug: parts.slice(1).join("/") };
  }
  return { activeProductId: "ctix", currentSlug: rest };
}
