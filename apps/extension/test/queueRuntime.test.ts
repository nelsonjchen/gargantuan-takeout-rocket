import { QueueRuntime } from "../src/queueRuntime";
import * as network from "../src/queueBackend";
import { newJob, QueueBackend } from "../src/transferQueue";
import { ExportAutomation } from "../src/exportAutomation";

const container = "https://backup.blob.core.windows.net/backups?sig=test";
const page =
  "https://takeout.google.com/manage/archive/00000000-0000-4000-8000-000000000001";
const source = "https://takeout.google.com/takeout/download/example";
const turns = async () => {
  for (let i = 0; i < 30; i++)
    await new Promise((resolve) => setImmediate(resolve));
};
let store: Record<string, any>;
beforeEach(() => {
  store = {
    enabled: true,
    azureSasUrl: container,
    proxyBaseUrl: "https://proxy.test",
    downloads: {}
  };
  const clone = (v: any) => JSON.parse(JSON.stringify(v));
  global.chrome = {
    runtime: {
      lastError: undefined,
      onStartup: { addListener: jest.fn() },
      onInstalled: { addListener: jest.fn() }
    },
    alarms: {
      onAlarm: { addListener: jest.fn() },
      get: jest.fn(async () => undefined),
      create: jest.fn(async () => {})
    },
    tabs: { create: jest.fn(async () => ({ id: 100 })) },
    notifications: { create: jest.fn() },
    storage: {
      onChanged: { addListener: jest.fn() },
      local: {
        setAccessLevel: jest.fn(async () => {}),
        get: jest.fn((keys, cb) =>
          cb(
            keys === null
              ? clone(store)
              : Object.fromEntries(
                  (Array.isArray(keys) ? keys : [keys]).map((k) => [
                    k,
                    store[k] === undefined ? undefined : clone(store[k])
                  ])
                )
          )
        ),
        set: jest.fn((values, cb) => {
          Object.assign(store, clone(values));
          cb?.();
        })
      }
    }
  } as any;
});
afterEach(() => jest.restoreAllMocks());

function runtime() {
  return new QueueRuntime(
    async () => "cookie-fixture",
    async (download) => {
      store.downloads[download.name] = { ...download };
    }
  );
}
function pendingBackend() {
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  const backend: QueueBackend = {
    inspectSource: jest.fn(async () => 1),
    inspectBlob: jest.fn(async () => undefined),
    stagedBlocks: jest.fn(async () => ({})),
    stage: jest.fn(() => pending),
    commit: jest.fn()
  };
  jest.spyOn(network, "queueBackend").mockReturnValue(backend);
  return { backend, release };
}

test("never runs a fourth archive while three outcomes are reserved, including retry waits", async () => {
  const { backend, release } = pendingBackend();
  const queue = runtime();
  store.queuePaused = true;
  await Promise.all(
    [1, 2, 3, 4].map((n) => queue.enqueue(`${n}.zip`, source + n, container))
  );
  await turns();
  store.queuePaused = false;
  queue.wake();
  await turns();
  expect(queue.active.size).toBe(3);
  expect(backend.stage).toHaveBeenCalledTimes(3);
  // Commit verification deliberately fails: these three move to retry waits.
  release();
  await turns();
  expect(
    (await queue.jobs()).filter((j) => j.state === "waiting")
  ).toHaveLength(3);
  expect(backend.inspectSource).toHaveBeenCalledTimes(3);
  expect((await queue.jobs()).find((j) => j.name === "4.zip")?.state).toBe(
    "queued"
  );
});
test("simultaneous duplicate interceptions keep one durable job and one copy", async () => {
  const { backend, release } = pendingBackend();
  const queue = runtime();
  await Promise.all([
    queue.enqueue("one.zip", source, container),
    queue.enqueue("one.zip", source, container)
  ]);
  await turns();
  expect(await queue.jobs()).toHaveLength(1);
  expect(backend.stage).toHaveBeenCalledTimes(1);
  release();
  await turns();
});
test("legacy unconfirmed jobs reserve all slots and aren't acknowledged as new captures", async () => {
  const { backend, release } = pendingBackend();
  store.downloads = Object.fromEntries(
    [4, 8, 9].map((n) => [
      `old-${n}.zip`,
      { name: `old-${n}.zip`, status: "pending" }
    ])
  );
  const queue = runtime();
  expect(await queue.enqueue("old-4.zip", source, container)).toBe(false);
  await queue.enqueue("new.zip", source, container);
  await turns();
  expect(backend.stage).not.toHaveBeenCalled();
  expect(queue.active.size).toBe(0);
  release();
});
test("startup recreates recovery alarm and restricts sensitive records to trusted contexts", async () => {
  const queue = runtime();
  queue.install();
  await turns();
  expect(chrome.storage.local.setAccessLevel).toHaveBeenCalledWith({
    accessLevel: "TRUSTED_CONTEXTS"
  });
  expect(chrome.alarms.create).toHaveBeenCalledWith("gtr-queue-recovery", {
    periodInMinutes: 1
  });
  expect(chrome.runtime.onStartup.addListener).toHaveBeenCalled();
  expect(chrome.alarms.onAlarm.addListener).toHaveBeenCalled();
});

test("export navigation persists a reservation and never repeats an uncertain download", async () => {
  const automation = new ExportAutomation(runtime());
  const parts = [
    { part: 1, url: source },
    { part: 2, url: source + "2" }
  ];
  await automation.start(page, parts);
  expect(store["gtr-export-run"].requested.part).toBe(1);
  await automation.tick();
  await automation.start(page, parts);
  expect(chrome.tabs.create).toHaveBeenCalledTimes(1);
  await automation.captured({
    url: source + "unrelated",
    filename: "other.zip"
  } as any);
  expect(store["gtr-export-run"].next).toBe(0);
  await automation.captured({ url: source, filename: "one.zip" } as any);
  expect(store["gtr-export-run"].next).toBe(1);
  await automation.tick();
  expect(chrome.tabs.create).toHaveBeenCalledTimes(2);
  expect(store["gtr-export-run"].requested.part).toBe(2);
});
test("export automation respects legacy uncertainty, occupied slots, and pause", async () => {
  const queue = runtime();
  const automation = new ExportAutomation(queue);
  store.downloads = { old: { name: "old", status: "pending" } };
  await automation.start(page, [{ part: 1, url: source }]);
  expect(chrome.tabs.create).not.toHaveBeenCalled();
  store.downloads = {};
  for (let i = 0; i < 3; i++) {
    const job = newJob(`${i}.zip`, source, container);
    store[`gtr-job:${job.destination}/${job.name}`] = job;
  }
  await automation.tick();
  expect(chrome.tabs.create).not.toHaveBeenCalled();
  await automation.pause();
  expect(store["gtr-export-run"].enabled).toBe(false);
  expect(await automation.tick()).toContain("paused");
});
