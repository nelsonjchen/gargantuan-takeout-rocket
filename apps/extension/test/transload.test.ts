import { createJobPlan, sourceToGtrProxySource } from "../src/transload";

const proxyBaseUrl = "https://gtr-proxy.677472.xyz";

describe("createJobPlan", () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  test.each([1, 32, 1024 * 1024, 1024 * 1024 + 1, 50 * 1024 * 1024 * 1024])(
    "covers all %i bytes exactly once, including mini archives",
    async (length) => {
      global.fetch = jest.fn().mockResolvedValue(
        new Response(null, {
          status: 200,
          headers: { "Content-Length": String(length) }
        })
      );
      const plan = await createJobPlan("https://example.com/test.zip");
      expect(plan.length).toBe(length);
      let nextByte = 0;
      for (const chunk of plan.chunks) {
        expect(chunk.start).toBe(nextByte);
        expect(chunk.size).toBeGreaterThan(0);
        expect(chunk.size).toBeLessThanOrEqual(3000 * 1024 * 1024);
        nextByte += chunk.size;
      }
      expect(nextByte).toBe(length);
      expect(new Set(plan.chunks.map((chunk) => chunk.blockId)).size).toBe(
        plan.chunks.length
      );
    }
  );

  test("handles the final partial chunk", async () => {
    global.fetch = jest.fn().mockResolvedValue(
      new Response(null, {
        headers: { "Content-Length": String(1024 * 1024 + 1) }
      })
    );
    const plan = await createJobPlan("https://example.com/test.zip", 1);
    expect(plan.chunks.map(({ start, size }) => ({ start, size }))).toEqual([
      { start: 0, size: 1024 * 1024 },
      { start: 1024 * 1024, size: 1 }
    ]);
  });

  test("rejects authentication failures even when an error page has a length", async () => {
    global.fetch = jest.fn().mockResolvedValue(
      new Response(null, {
        status: 403,
        headers: { "Content-Length": "123" }
      })
    );
    await expect(createJobPlan("https://example.com/test.zip")).rejects.toThrow(
      "HTTP 403"
    );
  });

  test.each(["0", "-1", "NaN", "12junk", "1.5", "9007199254740992"])(
    "rejects invalid source length %s",
    async (length) => {
      global.fetch = jest.fn().mockResolvedValue(
        new Response(null, {
          headers: { "Content-Length": length }
        })
      );
      await expect(
        createJobPlan("https://example.com/test.zip")
      ).rejects.toThrow("content-length");
    }
  );

  test.each([0, -1, NaN, Infinity])(
    "rejects invalid chunk size %s",
    async (size) => {
      global.fetch = jest.fn();
      await expect(
        createJobPlan("https://example.com/test.zip", size)
      ).rejects.toThrow("Chunk size");
      expect(global.fetch).not.toHaveBeenCalled();
    }
  );
});

describe("sourceToGtrProxySource", () => {
  test("should return a proxied URL", () => {
    const sourceUrl = "https://example.com/file.zip";
    const expectedUrl = `${proxyBaseUrl}/p/example.com/file.zip`;
    expect(sourceToGtrProxySource(sourceUrl, proxyBaseUrl)).toBe(expectedUrl);
  });

  test("should handle encoded slashes in source URL", () => {
    const sourceUrl = "https://example.com/some%2Fpath/file.zip";
    const expectedUrl = `${proxyBaseUrl}/p/example.com/some%252Fpath/file.zip`;
    expect(sourceToGtrProxySource(sourceUrl, proxyBaseUrl)).toBe(expectedUrl);
  });

  test("should include encodedCookies if provided", () => {
    const sourceUrl = "https://example.com/file.zip";
    const cookies = "testcookies";
    const expectedUrl = `${proxyBaseUrl}/p/example.com/file.zip?a=${cookies}`;
    expect(sourceToGtrProxySource(sourceUrl, proxyBaseUrl, cookies)).toBe(
      expectedUrl
    );
  });

  test("should use & for cookies if query params already exist", () => {
    const sourceUrl = "https://example.com/file.zip?param=value";
    const cookies = "testcookies";
    const expectedUrl = `${proxyBaseUrl}/p/example.com/file.zip?param=value&a=${cookies}`;
    expect(sourceToGtrProxySource(sourceUrl, proxyBaseUrl, cookies)).toBe(
      expectedUrl
    );
  });

  test("should throw an error if the generated URL is too long", () => {
    const sourceUrl = "https://example.com/file.zip";
    const longCookies = "a".repeat(2048);
    expect(() => {
      sourceToGtrProxySource(sourceUrl, proxyBaseUrl, longCookies);
    }).toThrow(/Proxy URL length \(\d+\) exceeds the maximum of 2048 bytes./);
  });
});

describe("transfer progress", () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    jest.restoreAllMocks();
    global.fetch = originalFetch;
  });
  function deferredResponse() {
    let resolve!: (response: Response) => void;
    let reject!: (error: Error) => void;
    const promise = new Promise<Response>((yes, no) => {
      resolve = yes;
      reject = no;
    });
    return { promise, resolve, reject };
  }
  function setup() {
    const { BlockBlobClient } = require("../src/jeContainerClient");
    global.fetch = jest
      .fn()
      .mockResolvedValue(
        new Response(null, { headers: { "Content-Length": "3" } })
      );
    const blocks = [deferredResponse(), deferredResponse(), deferredResponse()];
    jest
      .spyOn(BlockBlobClient.prototype, "stageBlockFromURL")
      .mockImplementation(
        (_id: any, _source: any, offset: any) => blocks[offset].promise
      );
    const commit = jest
      .spyOn(BlockBlobClient.prototype, "commitBlockList")
      .mockResolvedValue(new Response(null, { status: 201 }));
    return { blocks, commit };
  }
  const tick = () => new Promise((resolve) => setImmediate(resolve));
  test("counts accepted blocks out of order and finalizes only after all of them", async () => {
    const { blocks, commit } = setup();
    const progress = jest.fn();
    const { transload } = require("../src/transload");
    const done = transload(
      "https://source.test/zip",
      "https://backup.blob.core.windows.net/container?sig=test",
      "mini.zip",
      undefined,
      1 / 1048576,
      progress
    );
    await tick();
    blocks[2].resolve(new Response(null, { status: 201 }));
    await tick();
    expect(commit).not.toHaveBeenCalled();
    blocks[0].resolve(new Response(null, { status: 201 }));
    await tick();
    expect(commit).not.toHaveBeenCalled();
    blocks[1].resolve(new Response(null, { status: 201 }));
    await done;
    expect(
      progress.mock.calls.map(([p]) => [p.phase, p.transferredBytes])
    ).toEqual([
      ["copying", 0],
      ["copying", 1],
      ["copying", 2],
      ["copying", 3],
      ["committing", 3]
    ]);
    expect(commit).toHaveBeenCalledTimes(1);
  });
  test("late successful blocks cannot replace a failed transfer with pending progress", async () => {
    const { blocks, commit } = setup();
    const progress = jest.fn();
    const { transload } = require("../src/transload");
    const done = transload(
      "https://source.test/zip",
      "https://backup.blob.core.windows.net/container?sig=test",
      "mini.zip",
      undefined,
      1 / 1048576,
      progress
    );
    const failure = expect(done).rejects.toThrow("failed block");
    await tick();
    blocks[0].reject(new Error("failed block"));
    await failure;
    blocks[1].resolve(new Response(null, { status: 201 }));
    blocks[2].resolve(new Response(null, { status: 201 }));
    await tick();
    expect(progress.mock.calls.map(([p]) => p.transferredBytes)).toEqual([0]);
    expect(commit).not.toHaveBeenCalled();
  });
});
