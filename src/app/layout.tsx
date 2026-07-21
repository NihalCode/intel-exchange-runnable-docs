import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import { HostProductProvider } from "@/components/HostProductProvider";
import { DocumentationAuthProvider } from "@/components/auth/DocumentationAuthProvider";
import { AgentChatSession } from "@/components/AgentChatSession";
import { ConditionalAppFrame } from "@/components/ConditionalAppFrame";
import { RunSettingsProvider } from "@/components/RunSettings";
import { getManifest } from "@/lib/content";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Cyware API Docs — Runnable Reference",
  description:
    "Runnable API documentation for Cyware CTIX, CSAP, Orchestrate, and CFTR. Every code snippet can be executed in the browser.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const manifest = getManifest();
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <Script src="/theme-init.js" strategy="beforeInteractive" />
      </head>
      <body className="min-h-full font-sans antialiased">
        <RunSettingsProvider defaultBaseUrl={manifest.defaultBaseUrl}>
          <HostProductProvider>
            <DocumentationAuthProvider>
              <AgentChatSession>
                <ConditionalAppFrame nav={manifest.nav}>{children}</ConditionalAppFrame>
              </AgentChatSession>
            </DocumentationAuthProvider>
          </HostProductProvider>
        </RunSettingsProvider>
      </body>
    </html>
  );
}
