import pako from "pako";

const proxyBaseUrl = "https://mock-proxy.test";
const azureSasUrl = "https://account.blob.core.windows.net/container?sig=mock";
const sourceUrl = "https://gtr-test.677472.xyz/download/test.txt";
const sourceFixture = "local mocked GTR source fixture\n";
const fileName = "test.txt";

type DownloadState = {
  [key: string]: {
    name: string;
    status: "failed" | "complete" | "pending";
    reason?: string;
    size?: number;
  };
};

type MockState = {
  enabled: boolean;
  azureSasUrl: string;
  proxyBaseUrl: string;
  downloads: DownloadState;
};

type StagedBlock = {
  start: number;
  end: number;
  bytes: Uint8Array;
};

const textEncoder = new TextEncoder();
const sourceBytes = textEncoder.encode(sourceFixture);

let chromeState: MockState;
let stagedBlocks: Map<string, StagedBlock>;
let committedBlob: Uint8Array | undefined;
let failStageRequest: boolean;
let unexpectedFetches: string[];
let captureDownload: typeof import("../../src/background").captureDownload;
let determineFilename: typeof import("../../src/background").determineFilename;

function decodeCookiePayload(encodedCookies: string): string {
  const binaryString = Buffer.from(encodedCookies, "base64").toString("binary");
  const compressedData = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    compressedData[i] = binaryString.charCodeAt(i);
  }
  return new TextDecoder().decode(pako.ungzip(compressedData));
}

function response(
  body: BodyInit | null,
  init?: ResponseInit
): Promise<Response> {
  return Promise.resolve(new Response(body, init));
}

function getHeader(headers: HeadersInit | undefined, name: string): string {
  return new Headers(headers).get(name) || "";
}

function parseSourceRange(value: string): { start: number; end: number } {
  const match = /^bytes=(\d+)-(\d+)$/.exec(value);
  if (!match) {
    throw new Error(`Unexpected x-ms-source-range: ${value}`);
  }
  return {
    start: Number(match[1]),
    end: Number(match[2])
  };
}

async function requestText(init?: RequestInit): Promise<string> {
  if (typeof init?.body === "string") {
    return init.body;
  }
  if (init?.body instanceof URLSearchParams) {
    return init.body.toString();
  }
  return "";
}

function blockIdsFromXml(xml: string): string[] {
  return [...xml.matchAll(/<Latest>([^<]+)<\/Latest>/g)].map(
    (match) => match[1]
  );
}

function assertProxySourceRequest(url: URL) {
  expect(url.origin).toBe(proxyBaseUrl);
  expect(url.pathname).toBe("/p/gtr-test.677472.xyz/download/test.txt");
  const encodedCookies = url.searchParams.get("a");
  expect(encodedCookies).toBeTruthy();
  expect(decodeCookiePayload(encodedCookies!)).toBe(
    "SID=sid_value; __Secure-1PSID=s1psid_value"
  );
}

function localFetch(input: RequestInfo | URL, init?: RequestInit) {
  const url = new URL(input instanceof Request ? input.url : input.toString());
  const method = init?.method || "GET";

  if (url.origin === proxyBaseUrl && url.pathname.startsWith("/p/")) {
    assertProxySourceRequest(url);
    if (method !== "HEAD") {
      unexpectedFetches.push(`${method} ${url.toString()}`);
      return response("Unexpected proxy source request", { status: 500 });
    }
    return response(null, {
      status: 200,
      headers: {
        "Content-Length": String(sourceBytes.length)
      }
    });
  }

  if (url.origin === proxyBaseUrl && url.pathname.startsWith("/p-azb/")) {
    if (method !== "PUT") {
      unexpectedFetches.push(`${method} ${url.toString()}`);
      return response("Unexpected proxy Azure method", { status: 500 });
    }

    if (failStageRequest) {
      return response("mock stage failure", { status: 418 });
    }

    expect([
      `/p-azb/account/container/${fileName}`,
      `/p-azb/account/container/second.txt`
    ]).toContain(url.pathname);
    expect(url.searchParams.get("sig")).toBe("mock");
    expect(url.searchParams.get("comp")).toBe("block");

    const blockId = url.searchParams.get("blockid");
    expect(blockId).toBeTruthy();

    const copySource = getHeader(init?.headers, "x-ms-copy-source");
    const copySourceUrl = new URL(copySource);
    assertProxySourceRequest(copySourceUrl);

    const range = parseSourceRange(
      getHeader(init?.headers, "x-ms-source-range")
    );
    expect(range.start).toBe(0);
    expect(range.end).toBe(sourceBytes.length - 1);

    stagedBlocks.set(blockId!, {
      ...range,
      bytes: sourceBytes.slice(range.start, range.end + 1)
    });
    return response("", { status: 201 });
  }

  if (
    url.origin === "https://account.blob.core.windows.net" &&
    [`/container/${fileName}`, "/container/second.txt"].includes(
      url.pathname
    ) &&
    method === "PUT" &&
    url.searchParams.get("comp") === "blocklist"
  ) {
    return requestText(init).then((xml) => {
      const blockIds = blockIdsFromXml(xml);
      expect(blockIds.length).toBeGreaterThan(0);
      committedBlob = textEncoder.encode(
        blockIds
          .map((blockId) => {
            const staged = stagedBlocks.get(blockId);
            if (!staged) {
              throw new Error(`Missing staged block ${blockId}`);
            }
            return new TextDecoder().decode(staged.bytes);
          })
          .join("")
      );
      return new Response("", { status: 201 });
    });
  }

  unexpectedFetches.push(`${method} ${url.toString()}`);
  return response(`Unexpected fetch: ${method} ${url.toString()}`, {
    status: 500
  });
}

function installChromeMock() {
  global.chrome = {
    cookies: {
      getAll: jest.fn((_details, callback) => {
        callback([
          { name: "NID", value: "nid_value" },
          { name: "SID", value: "sid_value" },
          { name: "__Secure-1PSID", value: "s1psid_value" }
        ]);
      }) as any
    },
    runtime: {
      lastError: undefined,
      onMessage: { addListener: jest.fn() }
    },
    storage: {
      local: {
        get: jest.fn((keys, callback) => {
          if (Array.isArray(keys)) {
            callback(
              keys.reduce<Record<string, unknown>>((result, key) => {
                result[key] = chromeState[key as keyof MockState];
                return result;
              }, {})
            );
            return;
          }

          callback({
            [keys]: chromeState[keys as keyof MockState]
          });
        }),
        set: jest.fn((value, callback) => {
          chromeState = {
            ...chromeState,
            ...value
          };
          callback?.();
        })
      }
    },
    downloads: {
      cancel: jest.fn(),
      onDeterminingFilename: {
        addListener: jest.fn()
      }
    },
    notifications: {
      create: jest.fn(),
      clear: jest.fn()
    }
  } as any;
}

function downloadItem(): chrome.downloads.DownloadItem {
  return {
    id: 42,
    url: sourceUrl,
    finalUrl: sourceUrl,
    filename: fileName
  } as chrome.downloads.DownloadItem;
}

beforeEach(() => {
  jest.resetModules();
  chromeState = {
    enabled: true,
    azureSasUrl,
    proxyBaseUrl,
    downloads: {}
  };
  stagedBlocks = new Map();
  committedBlob = undefined;
  failStageRequest = false;
  unexpectedFetches = [];
  installChromeMock();
  global.fetch = jest.fn(localFetch) as any;
  captureDownload = require("../../src/background").captureDownload;
  determineFilename = require("../../src/background").determineFilename;
});

afterEach(() => {
  expect(unexpectedFetches).toEqual([]);
});

describe("local mocked transload e2e", () => {
  test("parallel archives retain both completed records with delayed storage callbacks", async () => {
    const get = chrome.storage.local.get as jest.Mock;
    const originalGet = get.getMockImplementation()!;
    get.mockImplementation((keys, callback) => {
      if (keys === "downloads") {
        const snapshot = { downloads: { ...chromeState.downloads } };
        setImmediate(() => callback(snapshot));
      } else originalGet(keys, callback);
    });
    const set = chrome.storage.local.set as jest.Mock;
    set.mockImplementation((value, callback) => {
      setImmediate(() => {
        chromeState = { ...chromeState, ...value };
        callback?.();
      });
    });
    const first = captureDownload(downloadItem(), jest.fn());
    const second = captureDownload(
      { ...downloadItem(), id: 43, filename: "second.txt" },
      jest.fn()
    );
    await new Promise((resolve) => setImmediate(resolve));
    const sendResponse = jest.fn();
    (chrome.runtime.onMessage.addListener as jest.Mock).mock.calls[0][0](
      { type: "gtr-active-transfers" },
      {},
      sendResponse
    );
    expect(sendResponse).toHaveBeenCalledWith({
      names: [fileName, "second.txt"]
    });
    await Promise.all([first, second]);
    expect(chromeState.downloads[fileName].status).toBe("complete");
    expect(chromeState.downloads["second.txt"].status).toBe("complete");
  });

  test.each(["disabled", "ineligible", "invalid-config", "expired-config"])(
    "releases the native download when interception is %s",
    async (scenario) => {
      const item = downloadItem();
      if (scenario === "disabled") chromeState.enabled = false;
      if (scenario === "ineligible")
        item.finalUrl = "https://example.com/file.zip";
      if (scenario === "invalid-config") chromeState.azureSasUrl = "";
      if (scenario === "expired-config")
        chromeState.azureSasUrl = `${azureSasUrl}&se=2020-01-01`;
      const suggest = jest.fn();
      await captureDownload(item, suggest);
      expect(suggest).toHaveBeenCalledTimes(1);
      expect(suggest).toHaveBeenCalledWith();
      expect(chrome.downloads.cancel).not.toHaveBeenCalled();
      expect(global.fetch).not.toHaveBeenCalled();
    }
  );

  test("releases the native download if reading settings fails", async () => {
    chrome.runtime.lastError = { message: "Storage unavailable" };
    const suggest = jest.fn();
    await expect(captureDownload(downloadItem(), suggest)).rejects.toEqual({
      message: "Storage unavailable"
    });
    expect(suggest).toHaveBeenCalledTimes(1);
    expect(chrome.downloads.cancel).not.toHaveBeenCalled();
  });

  test("registered listener returns true synchronously and then releases the filename", async () => {
    chromeState.enabled = false;
    const suggest = jest.fn();
    let release: () => void;
    const released = new Promise<void>((resolve) => {
      release = resolve;
    });
    suggest.mockImplementation(() => release());
    expect(determineFilename(downloadItem(), suggest)).toBe(true);
    await released;
    expect(suggest).toHaveBeenCalledTimes(1);
    expect(
      chrome.downloads.onDeterminingFilename.addListener
    ).toHaveBeenCalledWith(determineFilename);
  });

  test("transloads a small eligible download into mock Azure", async () => {
    const suggest = jest.fn();
    await captureDownload(downloadItem(), suggest);
    expect(suggest).toHaveBeenCalledTimes(1);

    expect(chrome.downloads.cancel).toHaveBeenCalledWith(42);

    expect(chrome.notifications.create).toHaveBeenCalledWith(
      `transload-start-${fileName}`,
      expect.objectContaining({ title: "🚀 GTR Transload Started" })
    );
    expect(chrome.notifications.create).toHaveBeenCalledWith(
      `transload-complete-${fileName}`,
      expect.objectContaining({ title: "🚀 GTR Transload Complete" })
    );

    const setCalls = (chrome.storage.local.set as jest.Mock).mock.calls;
    expect(setCalls[0][0].downloads[fileName]).toEqual(
      expect.objectContaining({
        name: fileName,
        status: "pending",
        phase: "inspecting",
        startedAt: expect.any(Number)
      })
    );
    expect(setCalls[setCalls.length - 1][0].downloads[fileName]).toEqual(
      expect.objectContaining({
        name: fileName,
        status: "complete",
        size: sourceBytes.length
      })
    );

    expect(setCalls.map(([value]) => value.downloads[fileName].phase)).toEqual([
      "inspecting",
      "copying",
      "copying",
      "committing",
      "committing"
    ]);
    expect(chromeState.downloads[fileName]).toEqual(
      expect.objectContaining({
        transferredBytes: 32,
        totalBytes: 32,
        completedBlocks: 1,
        totalBlocks: 1
      })
    );
    const sendResponse = jest.fn();
    (chrome.runtime.onMessage.addListener as jest.Mock).mock.calls[0][0](
      { type: "gtr-active-transfers" },
      {},
      sendResponse
    );
    expect(sendResponse).toHaveBeenCalledWith({ names: [] });
    expect(committedBlob).toEqual(sourceBytes);
  });

  test("records failure when mock Azure block staging fails", async () => {
    failStageRequest = true;

    const suggest = jest.fn();
    await captureDownload(downloadItem(), suggest);
    expect(suggest).toHaveBeenCalledTimes(1);

    expect(chrome.downloads.cancel).toHaveBeenCalledWith(42);

    const setCalls = (chrome.storage.local.set as jest.Mock).mock.calls;
    expect(setCalls[0][0].downloads[fileName]).toEqual(
      expect.objectContaining({
        name: fileName,
        status: "pending",
        phase: "inspecting",
        startedAt: expect.any(Number)
      })
    );
    expect(setCalls[setCalls.length - 1][0].downloads[fileName]).toEqual(
      expect.objectContaining({
        name: fileName,
        status: "failed"
      })
    );

    expect(chrome.notifications.create).toHaveBeenCalledWith(
      `transload-failed-${fileName}`,
      expect.objectContaining({ title: "🚀 GTR Transload Failed" })
    );
    expect(committedBlob).toBeUndefined();
  });
});
