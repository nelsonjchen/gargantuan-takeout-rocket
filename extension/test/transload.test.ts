import { describe, test, expect, vi } from "vitest";

const PROXY_URL = "https://gtr-proxy.677472.xyz/";

describe("hello world", () => {
  test("it works", () => {
    expect(1 + 1).toBe(2);
  });

  test("get version from PROXY_URL", async () => {
    const resp = await fetch(`${PROXY_URL}version/`);
    expect(resp.status).toBe(200);
    const json = await resp.json();
    expect(json).toEqual({ apiVersion: '2.0.0' });
  });

});
