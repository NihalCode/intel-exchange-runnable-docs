/**
 * Preload for analytics CLIs run via `tsx` outside Next.js.
 * Redirects `server-only` to an empty module so transactional scripts can import
 * the same server modules as the app without throwing.
 */
const Module = require("node:module");
const path = require("node:path");

const shimPath = path.join(__dirname, "server-only.js");
const originalResolveFilename = Module._resolveFilename;

Module._resolveFilename = function resolveFilename(request, parent, isMain, options) {
  if (request === "server-only") {
    return shimPath;
  }
  return originalResolveFilename.call(this, request, parent, isMain, options);
};
