import { afterEach, describe, expect, it } from "vitest";

import {
  ingestSpawnEnv,
  isVercelRuntime,
  postmanImportTempDir,
  postmanIngestParser,
  VERCEL_INGEST_ROOT,
} from "../developer/ingest-runtime";

describe("ingest-runtime", () => {
  const origVercel = process.env.VERCEL;

  afterEach(() => {
    if (origVercel === undefined) delete process.env.VERCEL;
    else process.env.VERCEL = origVercel;
  });

  it("uses project .tmp locally", () => {
    delete process.env.VERCEL;
    expect(isVercelRuntime()).toBe(false);
    expect(postmanImportTempDir()).toMatch(/\.tmp[\\/]postman-import$/);
    expect(postmanIngestParser()).toBe("ts");
    const env = ingestSpawnEnv();
    expect(env).not.toBe(process.env);
    expect(env.AUTH0_CLIENT_SECRET).toBeUndefined();
    expect(env.PATH).toBe(process.env.PATH);
  });

  it("uses /tmp on Vercel and sets INGEST_OUTPUT_ROOT", () => {
    process.env.VERCEL = "1";
    expect(isVercelRuntime()).toBe(true);
    expect(postmanImportTempDir()).toBe("/tmp/postman-import");
    expect(postmanIngestParser()).toBe("js");
    expect(ingestSpawnEnv().INGEST_OUTPUT_ROOT).toBe(VERCEL_INGEST_ROOT);
  });
});
