import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import manifest from "@/content/manifest.json";
import type { DocPage, Manifest } from "./types";

const PAGES_DIR = path.join(process.cwd(), "src", "content", "pages");

export function getManifest(): Manifest {
  return manifest as Manifest;
}

export function fileNameForSlug(slug: string): string {
  return slug.replace(/\//g, "__") + ".json";
}

export async function getPage(slug: string): Promise<DocPage | null> {
  try {
    const file = path.join(PAGES_DIR, fileNameForSlug(slug));
    const raw = await readFile(file, "utf8");
    return JSON.parse(raw) as DocPage;
  } catch {
    return null;
  }
}

export function allSlugs(): string[] {
  return getManifest().pages.map((p) => p.slug);
}

/** Slug of the landing/overview page (project root). */
export function getRootSlug(): string {
  const m = getManifest();
  return m.pages[0]?.slug ?? m.project;
}
