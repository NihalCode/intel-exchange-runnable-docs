/**
 * CLI bridge: Postman collection JSON → ingest-compatible page records (TypeScript parser).
 * Invoked from ingest.mjs with --parser=ts (Node --experimental-strip-types).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { parsePostmanCollection, parsedEndpointsToPageRecords } from "@/lib/postman";

function arg(name: string): string {
  const prefix = `--${name}=`;
  const hit = process.argv.find((a) => a.startsWith(prefix));
  if (!hit) throw new Error(`Missing required argument: --${name}=`);
  return hit.slice(prefix.length);
}

const productId = arg("product");
const collectionFile = arg("collection-file");
const outFile = arg("out");

const collection = JSON.parse(readFileSync(collectionFile, "utf8"));
const parsed = parsePostmanCollection(collection, { productId });
const records = parsedEndpointsToPageRecords(parsed);
writeFileSync(outFile, JSON.stringify(records));
