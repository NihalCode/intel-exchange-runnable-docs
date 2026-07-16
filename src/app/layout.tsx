import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { HostProductProvider } from "@/components/HostProductProvider";
import { DocumentationAuthProvider } from "@/components/auth/DocumentationAuthProvider";
import { AgentChatSession } from "@/components/AgentChatSession";
import { ConditionalAppShell } from "@/components/ConditionalAppShell";
import { RunSettingsProvider } from "@/components/RunSettings";
import { getManifest } from "@/lib/content";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Cyware API Docs — Runnable Reference",
  description:
    "Runnable API documentation for Cyware CTIX, CSAP, Orchestrate, and CFTR. Every code snippet can be executed in the browser.",
};

// Avoid theme flash by applying the saved/preferred theme before paint.
const themeScript = `(function(){try{var s=localStorage.getItem('theme');var d=s?s==='dark':window.matchMedia('(prefers-color-scheme: dark)').matches;if(d)document.documentElement.classList.add('dark');}catch(e){}})();`;

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
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-full">
        <RunSettingsProvider defaultBaseUrl={manifest.defaultBaseUrl}>
          <HostProductProvider>
            <DocumentationAuthProvider>
              <AgentChatSession>
                <ConditionalAppShell nav={manifest.nav}>{children}</ConditionalAppShell>
              </AgentChatSession>
            </DocumentationAuthProvider>
          </HostProductProvider>
        </RunSettingsProvider>
      </body>
    </html>
  );
}
