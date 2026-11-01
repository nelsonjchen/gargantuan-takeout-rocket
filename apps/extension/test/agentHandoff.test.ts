import {
  checkNativeConnection,
  enableVerifiedHandoff,
  NativeConnectionError
} from "../src/agentHandoff";

beforeEach(() => {
  global.chrome = {
    permissions: { contains: jest.fn(async () => true) },
    runtime: {
      lastError: undefined,
      sendNativeMessage: jest.fn((_host, _request, callback) =>
        callback({
          ok: true,
          result: { availableSlots: 3, paused: false, needsAttention: false }
        })
      )
    }
  } as any;
});

test("detects a worker whose native API stayed unbound after permission grant", async () => {
  (chrome.runtime as any).sendNativeMessage = undefined;
  await expect(checkNativeConnection()).rejects.toMatchObject({
    code: "worker_restart_required"
  });
});

test("first grant persists handoff before restarting an idle worker", async () => {
  let persisted = false;
  const restart = jest.fn(() => expect(persisted).toBe(true));
  await expect(
    enableVerifiedHandoff(
      true,
      async () => {
        persisted = true;
      },
      async () => true,
      restart
    )
  ).resolves.toBe(true);
  expect(restart).toHaveBeenCalledTimes(1);
});

test("an existing grant or busy worker is not automatically restarted", async () => {
  const restart = jest.fn();
  const idle = jest.fn(async () => true);
  await expect(
    enableVerifiedHandoff(false, async () => {}, idle, restart)
  ).resolves.toBe(false);
  expect(idle).not.toHaveBeenCalled();
  await expect(
    enableVerifiedHandoff(
      true,
      async () => {},
      async () => false,
      restart
    )
  ).resolves.toBe(false);
  expect(restart).not.toHaveBeenCalled();
});

test("failed persistence prevents a restart", async () => {
  const restart = jest.fn();
  await expect(
    enableVerifiedHandoff(
      true,
      async () => {
        throw new Error("storage failed");
      },
      async () => true,
      restart
    )
  ).rejects.toThrow("storage failed");
  expect(restart).not.toHaveBeenCalled();
});

test("verifies the actual native roundtrip without sending download authentication", async () => {
  await expect(checkNativeConnection()).resolves.toEqual({
    availableSlots: 3,
    paused: false,
    needsAttention: false
  });
  expect(chrome.runtime.sendNativeMessage).toHaveBeenCalledWith(
    "com.gtr.agent",
    { method: "capacity" },
    expect.any(Function)
  );
});
test("missing optional permission is reported before invoking the host", async () => {
  (chrome.permissions.contains as jest.Mock).mockResolvedValue(false);
  await expect(checkNativeConnection()).rejects.toMatchObject({
    code: "permission_missing"
  });
  expect(chrome.runtime.sendNativeMessage).not.toHaveBeenCalled();
});
test.each([4, 6])(
  "accepts the service's configured %i-slot capacity",
  async (availableSlots) => {
    (chrome.runtime.sendNativeMessage as jest.Mock).mockImplementation(
      (_host, _request, callback) =>
        callback({
          ok: true,
          result: { availableSlots, paused: true, needsAttention: false }
        })
    );
    await expect(checkNativeConnection()).resolves.toMatchObject({
      availableSlots
    });
  }
);
test.each([-1, 1.5, 7])(
  "rejects invalid capacity %s",
  async (availableSlots) => {
    (chrome.runtime.sendNativeMessage as jest.Mock).mockImplementation(
      (_host, _request, callback) =>
        callback({
          ok: true,
          result: { availableSlots, paused: true, needsAttention: false }
        })
    );
    await expect(checkNativeConnection()).rejects.toThrow(
      "Local service capacity is unavailable"
    );
  }
);
test.each([
  ["Specified native messaging host not found.", "host_not_found"],
  [
    "Access to the specified native messaging host is forbidden.",
    "host_access_denied"
  ],
  ["Failed to start native messaging host.", "host_start_failed"],
  ["Native host has exited.", "host_exited"],
  ["Unknown https://private.test/?sig=SECRET", "native_channel_error"]
])(
  "returns a fixed actionable code for %s without echoing secrets",
  async (raw, code) => {
    (chrome.runtime.sendNativeMessage as jest.Mock).mockImplementation(
      (_host, _request, callback) => {
        chrome.runtime.lastError = { message: raw };
        callback(undefined);
        chrome.runtime.lastError = undefined;
      }
    );
    const error = await checkNativeConnection().catch((e) => e);
    expect(error).toBeInstanceOf(NativeConnectionError);
    expect(error.code).toBe(code);
    expect(error.message).not.toContain("SECRET");
  }
);
