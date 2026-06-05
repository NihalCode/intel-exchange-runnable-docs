import { readFileSync } from "node:fs";

const path = process.argv[2] || "C:/Users/nihal/Downloads/Intel Exchange Postman API (1).json";
const raw = readFileSync(path, "utf8");
const j = JSON.parse(raw);
const col = j.collection || j;

console.log("=== collection variables ===");
for (const v of col.variable || []) {
  console.log(`${v.key} = ${v.value}`);
}

const urls = [...new Set(raw.match(/https:\/\/[a-zA-Z0-9._-]+\/ctixapi\/?/g) || [])];
console.log("\n=== ctixapi URLs in file ===");
for (const u of urls.slice(0, 30)) console.log(u);

const uuids = [...new Set(raw.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi) || [])];
console.log(`\n=== UUIDs (${uuids.length}) ===`);
for (const u of uuids.slice(0, 10)) console.log(u);

function walk(items, path = []) {
  for (const it of items || []) {
    if (/^ping$/i.test(it.name || "") && it.request) {
      const u =
        typeof it.request.url === "string"
          ? it.request.url
          : it.request.url?.raw || JSON.stringify(it.request.url);
      console.log("\n=== Ping request ===");
      console.log("path:", [...path, it.name].join(" > "));
      console.log("url:", u);
      console.log("method:", it.request.method);
    }
    if (it.item) walk(it.item, [...path, it.name]);
  }
}
walk(col.item);
