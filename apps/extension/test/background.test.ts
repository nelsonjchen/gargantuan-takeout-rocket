// Mock Chrome APIs
const mockCookies = [
  { name: "NID", value: "nid_value" },
  { name: "SID", value: "sid_value" },
  { name: "__Secure-1PSID", value: "s1psid_value" }
];

global.chrome = {
  cookies: {
    getAll: jest.fn((details, callback) => {
      if (callback) {
        callback(mockCookies);
      } else {
        return Promise.resolve(mockCookies);
      }
    }) as any
  },
  runtime: {
    lastError: undefined,
    onMessage: { addListener: jest.fn() }
  },
  downloads: {
    onDeterminingFilename: {
      addListener: jest.fn()
    }
  }
} as any;

import {
  getEncodedCookies,
  isEligibleDownloadUrl,
  validateTransloadConfig
} from "../src/background";
import pako from "pako";

// Helper to decode base64
const atob = (base64: string) =>
  Buffer.from(base64, "base64").toString("binary");

describe("getEncodedCookies", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.chrome.runtime.lastError = undefined;
  });

  test("should remove the NID cookie", async () => {
    const url = "https://takeout.google.com";
    const encodedCookies = await getEncodedCookies(url);

    expect(chrome.cookies.getAll).toHaveBeenCalledWith(
      { url },
      expect.any(Function)
    );

    const binaryString = atob(encodedCookies);
    const compressedData = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      compressedData[i] = binaryString.charCodeAt(i);
    }

    const decompressedData = pako.ungzip(compressedData);
    const decoder = new TextDecoder();
    const decodedString = decoder.decode(decompressedData);

    expect(decodedString).not.toContain("NID=nid_value");
    expect(decodedString).toContain("SID=sid_value");
    expect(decodedString).toContain("__Secure-1PSID=s1psid_value");
  });

  test("should return a base64 encoded gzipped string", async () => {
    const url = "https://takeout.google.com";
    const encodedCookies = await getEncodedCookies(url);

    // Check if it's a valid base64 string
    const base64Regex = /^[A-Za-z0-9+/]+={0,2}$/;
    expect(base64Regex.test(encodedCookies)).toBe(true);

    // Decode and decompress
    const binaryString = atob(encodedCookies);
    const compressedData = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      compressedData[i] = binaryString.charCodeAt(i);
    }

    let decompressedData;
    try {
      decompressedData = pako.ungzip(compressedData);
    } catch (e) {
      throw new Error("Failed to ungzip the data");
    }

    const decoder = new TextDecoder();
    const decodedString = decoder.decode(decompressedData);

    const expectedString = "SID=sid_value; __Secure-1PSID=s1psid_value";
    expect(decodedString).toBe(expectedString);
  });

  test("should handle chrome.runtime.lastError", async () => {
    const url = "https://takeout.google.com";
    global.chrome.runtime.lastError = { message: "Test error" };
    (chrome.cookies.getAll as any) = jest.fn((details, callback) => {
      callback([]);
    });

    await expect(getEncodedCookies(url)).rejects.toEqual({
      message: "Test error"
    });
  });
});

describe("isEligibleDownloadUrl", () => {
  test("allows known Google Takeout download URLs", () => {
    expect(
      isEligibleDownloadUrl(
        "https://apidata.googleusercontent.com/download/storage/v1/b/dataliberation/o/archive.zip"
      )
    ).toBe(true);
    expect(
      isEligibleDownloadUrl(
        "https://storage.googleapis.com/takeout-123/file.zip"
      )
    ).toBe(true);
    expect(
      isEligibleDownloadUrl("https://takeout.google.com/takeout/download/foo")
    ).toBe(true);
    expect(
      isEligibleDownloadUrl(
        "https://takeout-download.usercontent.google.com/download/foo"
      )
    ).toBe(true);
  });

  test("allows the known test host", () => {
    expect(isEligibleDownloadUrl("https://gtr-test.677472.xyz/200MB.zip")).toBe(
      true
    );
    expect(
      isEligibleDownloadUrl(
        "https://gtr-cf-test-origin.677472.xyz/download-no-cookie/test.txt"
      )
    ).toBe(true);
  });

  test("rejects unknown hosts and unrelated paths", () => {
    expect(isEligibleDownloadUrl("https://example.com/file.zip")).toBe(false);
    expect(isEligibleDownloadUrl("https://takeout.google.com/settings")).toBe(
      false
    );
    expect(isEligibleDownloadUrl(undefined)).toBe(false);
    expect(isEligibleDownloadUrl("not a url")).toBe(false);
  });
});

describe("validateTransloadConfig", () => {
  const validAzureSasUrl =
    "https://account.blob.core.windows.net/container?sv=2024-01-01&sig=abc";
  const validProxyBaseUrl = "https://gtr-proxy.677472.xyz";

  test("accepts a valid Azure SAS URL and proxy URL", () => {
    expect(validateTransloadConfig(validAzureSasUrl, validProxyBaseUrl)).toBe(
      undefined
    );
  });

  test("accepts a blank proxy URL so the built-in default can be used", () => {
    expect(validateTransloadConfig(validAzureSasUrl, "")).toBe(undefined);
  });

  test("trims copied setting values before validation", () => {
    expect(
      validateTransloadConfig(` ${validAzureSasUrl} `, ` ${validProxyBaseUrl} `)
    ).toBe(undefined);
  });

  test("rejects missing or malformed Azure SAS URLs", () => {
    expect(validateTransloadConfig("", validProxyBaseUrl)).toBe(
      "Azure SAS URL is required"
    );
    expect(validateTransloadConfig("not a url", validProxyBaseUrl)).toBe(
      "Azure SAS URL is invalid"
    );
    expect(
      validateTransloadConfig(
        "http://account.blob.core.windows.net/container?sig=abc",
        validProxyBaseUrl
      )
    ).toBe("Azure SAS URL must use https");
    expect(
      validateTransloadConfig(
        "https://account.blob.core.windows.net/?sig=abc",
        validProxyBaseUrl
      )
    ).toBe("Azure SAS URL must include a container path");
    expect(
      validateTransloadConfig(
        "https://account.blob.core.windows.net/container",
        validProxyBaseUrl
      )
    ).toBe("Azure SAS URL must include a SAS signature");
  });

  test("rejects malformed proxy URLs", () => {
    expect(validateTransloadConfig(validAzureSasUrl, "not a url")).toBe(
      "GTR proxy URL is invalid"
    );
    expect(validateTransloadConfig(validAzureSasUrl, "ftp://example.com")).toBe(
      "GTR proxy URL must use http or https"
    );
  });
});
