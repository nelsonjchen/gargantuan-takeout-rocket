import {
  advanceJob,
  BLOCK_BYTES,
  newJob,
  QueueBackend,
  TransferError,
  TransferJob
} from "../src/transferQueue";
import {
  boundedRequest,
  parseBlockList,
  queueBackend
} from "../src/queueBackend";
import { exportPage, validateParts } from "../src/exportAutomation";
import { parsePartLabel } from "../src/takeoutLinks";

const container = "https://backup.blob.core.windows.net/backups?sig=test";
function fixture(length = BLOCK_BYTES * 3 + 1) {
  let blob: { size: number; jobId: string } | undefined;
  const staged: Record<string, number> = {};
  let saved: TransferJob | undefined;
  const backend: QueueBackend = {
    inspectSource: jest.fn(async () => length),
    inspectBlob: jest.fn(async () => blob),
    stagedBlocks: jest.fn(async () => ({ ...staged })),
    stage: jest.fn(async (_name, id, _source, _start, size) => {
      staged[id] = size;
    }),
    commit: jest.fn(async (_name, ids, jobId) => {
      blob = { size: ids.reduce((sum, id) => sum + staged[id], 0), jobId };
    })
  };
  const save = jest.fn(async (job: TransferJob) => {
    saved = JSON.parse(JSON.stringify(job));
  });
  const job = newJob(
    "archive.zip",
    "https://takeout.google.com/takeout/download/one",
    container
  );
  return {
    backend,
    job,
    save,
    saved: () => saved!,
    staged,
    setBlob: (b: typeof blob) => {
      blob = b;
    }
  };
}

describe("durable transfer recovery", () => {
  test("reducing batch width preserves existing ranges and reuses staged blocks", async () => {
    const f = fixture(BLOCK_BYTES * 6 + 1);
    await advanceJob(f.job, f.backend, f.save);
    const plan = JSON.parse(JSON.stringify(f.saved().plan));
    await advanceJob(f.saved(), f.backend, f.save, BLOCK_BYTES, 2);
    expect(f.backend.stage).toHaveBeenCalledTimes(5);
    expect(f.saved().plan).toEqual(plan);
    await advanceJob(f.saved(), f.backend, f.save, BLOCK_BYTES, 2);
    expect(f.saved().state).toBe("complete");
    expect(f.backend.stage).toHaveBeenCalledTimes(7);
    expect(f.backend.inspectSource).toHaveBeenCalledTimes(1);
    expect(f.saved().plan).toEqual(plan);
    await expect(
      advanceJob(f.saved(), f.backend, f.save, BLOCK_BYTES, 4)
    ).rejects.toThrow("Block concurrency");
  });
  test("larger planning uses exact ranges and preserves its saved IDs on retry", async () => {
    const large = 1024 * 1024 * 1024;
    const f = fixture(large * 2 + 17);
    (f.backend.stage as jest.Mock).mockImplementationOnce(
      async (_name, id, _source, _start, size) => {
        f.staged[id] = size;
        throw new TransferError("Response lost", true);
      }
    );
    await advanceJob(f.job, f.backend, f.save, large);
    expect(f.saved().plan?.blocks.map((b) => [b.start, b.size])).toEqual([
      [0, large],
      [large, large],
      [large * 2, 17]
    ]);
    const plan = JSON.parse(JSON.stringify(f.saved().plan));
    await advanceJob(f.saved(), f.backend, f.save, BLOCK_BYTES);
    expect(f.saved().state).toBe("complete");
    expect(f.saved().plan).toEqual(plan);
    expect(f.backend.stage).toHaveBeenCalledTimes(3);
  });
  test("existing partial plans are not repartitioned when larger blocks are selected", async () => {
    const f = fixture();
    await advanceJob(f.job, f.backend, f.save);
    const plan = JSON.parse(JSON.stringify(f.saved().plan));
    await advanceJob(f.saved(), f.backend, f.save, 1024 * 1024 * 1024);
    expect(f.saved().state).toBe("complete");
    expect(f.saved().plan).toEqual(plan);
    expect(f.backend.stage).toHaveBeenCalledTimes(4);
  });
  test("checkpoints IDs before staging, bounds work and resumes after worker replacement", async () => {
    const f = fixture();
    (f.backend.stage as jest.Mock).mockImplementation(
      async (_name, id, _source, _start, size) => {
        expect(f.saved().plan?.blocks.some((b) => b.id === id)).toBe(true);
        f.staged[id] = size;
      }
    );
    await advanceJob(f.job, f.backend, f.save);
    expect(f.job.state).toBe("queued");
    expect(f.backend.stage).toHaveBeenCalledTimes(3);
    expect(f.backend.commit).not.toHaveBeenCalled();
    // A new worker has no in-memory state, only the serialized checkpoint.
    const resumed = JSON.parse(JSON.stringify(f.saved()));
    await advanceJob(resumed, f.backend, f.save);
    expect(resumed.state).toBe("complete");
    expect(resumed.source).toBe("");
    expect(f.backend.inspectSource).toHaveBeenCalledTimes(1);
    expect(f.backend.stage).toHaveBeenCalledTimes(4);
    expect(f.backend.commit).toHaveBeenCalledTimes(1);
    expect(f.save.mock.calls.at(-1)?.[0].plan?.length).toBe(
      BLOCK_BYTES * 3 + 1
    );
  });
  test("lost stage response is reconciled without copying the block again", async () => {
    const f = fixture(20);
    (f.backend.stage as jest.Mock).mockImplementationOnce(
      async (_name, id, _source, _start, size) => {
        f.staged[id] = size;
        throw new TransferError("Response lost", true);
      }
    );
    await advanceJob(f.job, f.backend, f.save);
    expect(f.job.state).toBe("waiting");
    await advanceJob(f.saved(), f.backend, f.save);
    expect(f.saved().state).toBe("complete");
    expect(f.backend.stage).toHaveBeenCalledTimes(1);
  });
  test("keeps confirmed staged progress through copy and inspection failures", async () => {
    const f = fixture();
    (f.backend.stage as jest.Mock).mockRejectedValueOnce(
      new TransferError("Temporary copy failure", true)
    );
    await advanceJob(f.job, f.backend, f.save);
    expect(f.saved().progress).toEqual({
      copiedBytes: 2 * BLOCK_BYTES,
      completedBlocks: 2
    });
    (f.backend.inspectBlob as jest.Mock).mockRejectedValueOnce(
      new TransferError("Temporary inspection failure", true)
    );
    await advanceJob(f.saved(), f.backend, f.save);
    expect(f.saved().progress).toEqual({
      copiedBytes: 2 * BLOCK_BYTES,
      completedBlocks: 2
    });
    const lastProgress = (
      f.save.mock.calls.at(-1) as unknown as [TransferJob, any]
    )[1];
    expect(lastProgress.transferredBytes).toBe(2 * BLOCK_BYTES);
    expect(lastProgress.completedBlocks).toBe(2);
  });
  test("lost commit response is verified by size and job marker without a second commit", async () => {
    const f = fixture(20);
    (f.backend.commit as jest.Mock).mockImplementationOnce(
      async (_name, _ids, jobId) => {
        f.setBlob({ size: 20, jobId });
        throw new TransferError("Response lost", true);
      }
    );
    await advanceJob(f.job, f.backend, f.save);
    expect(f.job.state).toBe("waiting");
    await advanceJob(f.saved(), f.backend, f.save);
    expect(f.saved().state).toBe("complete");
    expect(f.backend.commit).toHaveBeenCalledTimes(1);
  });
  test.each([undefined, "another-job"])(
    "never overwrites or accepts an unrelated existing blob (%s)",
    async (jobId) => {
      const f = fixture(20);
      (f.backend.inspectBlob as jest.Mock).mockResolvedValue({
        size: 20,
        jobId
      });
      await advanceJob(f.job, f.backend, f.save);
      expect(f.job.state).toBe("blocked");
      expect(f.backend.stage).not.toHaveBeenCalled();
      expect(f.backend.commit).not.toHaveBeenCalled();
    }
  );
  test("doesn't release a failed batch while other stage outcomes remain outstanding", async () => {
    const f = fixture();
    let finish!: () => void;
    const pending = new Promise<void>((resolve) => {
      finish = resolve;
    });
    (f.backend.stage as jest.Mock)
      .mockImplementationOnce(async () => {
        throw new TransferError("Google authorization required");
      })
      .mockImplementationOnce(() => pending);
    let settled = false;
    const operation = advanceJob(f.job, f.backend, f.save).then(() => {
      settled = true;
    });
    await new Promise((resolve) => setImmediate(resolve));
    expect(settled).toBe(false);
    expect(f.job.state).toBe("running");
    finish();
    await operation;
    expect(f.job.state).toBe("blocked");
    expect(f.backend.commit).not.toHaveBeenCalled();
  });
  test("limits automatic transient retries and redacts unexpected network errors", async () => {
    const f = fixture(20);
    (f.backend.inspectBlob as jest.Mock).mockRejectedValue(
      new TransferError("Azure returned HTTP 503", true)
    );
    for (let i = 0; i < 8; i++) await advanceJob(f.job, f.backend, f.save);
    expect(f.job.state).toBe("blocked");
    expect(f.job.attempts).toBe(8);
    (f.backend.inspectBlob as jest.Mock).mockRejectedValue(
      new Error("https://secret.test/?sig=credential")
    );
    await advanceJob(f.job, f.backend, f.save);
    expect(f.job.reason).not.toContain("credential");
  });
});

describe("queue network boundary", () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
    jest.useRealTimers();
  });
  test("times out an unresponsive fetch and exposes no source URL", async () => {
    jest.useFakeTimers();
    global.fetch = jest.fn(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(new Error("secret URL"))
          );
        })
    ) as any;
    const operation = boundedRequest("https://secret.test/?sig=credential");
    const assertion = expect(operation).rejects.toThrow(
      "Network request timed out"
    );
    await jest.advanceTimersByTimeAsync(25_000);
    await assertion;
  });
  test("lets independent service requests outlast the browser window but still aborts", async () => {
    jest.useFakeTimers();
    let aborted = false;
    global.fetch = jest.fn(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            aborted = true;
            reject(new Error("private URL"));
          });
        })
    ) as any;
    const backend = queueBackend(
      container,
      "https://proxy.test",
      async () => "cookie-fixture",
      75_000
    );
    const operation = backend.inspectBlob("archive.zip");
    const assertion = expect(operation).rejects.toThrow(
      "Network request timed out"
    );
    await jest.advanceTimersByTimeAsync(25_000);
    expect(aborted).toBe(false);
    await jest.advanceTimersByTimeAsync(50_000);
    await assertion;
    expect(aborted).toBe(true);
  });
  test.each([
    ["CannotVerifyCopySource", " (CannotVerifyCopySource)"],
    ["private-secret-header", ""]
  ])("only exposes recognized Azure error codes: %s", async (code, suffix) => {
    global.fetch = jest.fn(
      async () =>
        new Response("private response body", {
          status: 500,
          headers: { "x-ms-error-code": code }
        })
    );
    const backend = queueBackend(
      container,
      "https://proxy.test",
      async () => "cookie-fixture"
    );
    await expect(
      backend.stage(
        "archive.zip",
        "YWJj",
        "https://takeout.google.com/takeout/download/one",
        0,
        20
      )
    ).rejects.toThrow(`Azure copy returned HTTP 500${suffix}`);
    try {
      await backend.stage(
        "archive.zip",
        "YWJj",
        "https://takeout.google.com/takeout/download/one",
        0,
        20
      );
    } catch (error) {
      expect((error as Error).message).not.toContain("private");
    }
  });
  test("rejects a Google sign-in HTML response even if it has a valid size", async () => {
    global.fetch = jest.fn(
      async () =>
        new Response(null, {
          headers: { "Content-Type": "text/html", "Content-Length": "100" }
        })
    );
    const backend = queueBackend(
      container,
      "https://proxy.test",
      async () => "cookie-fixture"
    );
    await expect(
      backend.inspectSource("https://takeout.google.com/takeout/download/one")
    ).rejects.toThrow("sign-in page");
  });
  test("uses conditional commit, stable marker, and escaped blob names", async () => {
    const fetch = jest.fn(async () => new Response(null, { status: 201 }));
    global.fetch = fetch;
    const backend = queueBackend(
      container,
      "https://proxy.test",
      async () => "cookie-fixture"
    );
    await backend.commit("a #?&.zip", ["YWJj"], "job-fixture");
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(new URL(url).pathname).toBe("/backups/a%20%23%3F%26.zip");
    expect(new Headers(init.headers).get("If-None-Match")).toBe("*");
    // Azure metadata keys use identifier syntax; a hyphen causes HTTP 400.
    new Headers(init.headers).forEach((_value, key) => {
      if (key.startsWith("x-ms-meta-"))
        expect(key.slice("x-ms-meta-".length)).toMatch(/^[a-z_][a-z0-9_]*$/i);
    });
    expect(new Headers(init.headers).get("x-ms-meta-gtr_job")).toBe(
      "job-fixture"
    );
  });
  test("reconciles only block IDs with exact byte counts", () => {
    expect(
      parseBlockList(
        "<BlockList><UncommittedBlocks><Block><Name>YWJj</Name><Size>123</Size></Block></UncommittedBlocks></BlockList>"
      )
    ).toEqual({ YWJj: 123 });
  });
});

describe("export navigation validation", () => {
  test("recognizes both fresh and already-requested parts from Google's actual labels", () => {
    expect(parsePartLabel("Download again part 4 of 216")).toEqual({
      part: 4,
      total: 216
    });
    expect(parsePartLabel("Download part 10 of 216")).toEqual({
      part: 10,
      total: 216
    });
    expect(parsePartLabel("Download part 0 of 216")).toBeUndefined();
    expect(parsePartLabel("Download part 217 of 216")).toBeUndefined();
    expect(parsePartLabel("See report")).toBeUndefined();
  });
  const url = "https://takeout.google.com/takeout/download/example";
  test("requires a contiguous complete list of distinct Google download links", () => {
    expect(
      validateParts([
        { part: 1, url },
        { part: 2, url: url + "2" }
      ])
    ).toHaveLength(2);
    expect(validateParts([{ part: 2, url }])).toBeUndefined();
    expect(
      validateParts([
        { part: 1, url },
        { part: 2, url }
      ])
    ).toBeUndefined();
    expect(
      validateParts([{ part: 1, url: "https://attacker.test/download" }])
    ).toBeUndefined();
    expect(
      validateParts([{ part: 1, url: "https://takeout.google.com/settings" }])
    ).toBeUndefined();
  });
  test("accepts only a Takeout export page as an automation sender", () => {
    expect(
      exportPage(
        "https://takeout.google.com/manage/archive/00000000-0000-4000-8000-000000000001?x=y"
      )
    ).toBeTruthy();
    expect(
      exportPage("https://attacker.test/manage/archive/abc")
    ).toBeUndefined();
  });
});
