export interface ServiceCapacity {
  archiveLimit: number;
  unfinishedJobs: number;
  availableSlots: number;
  paused: boolean;
  needsAttention: boolean;
}
export class NativeConnectionError extends Error {
  constructor(public readonly code: string, message: string) {
    super(`[${code}] ${message}`);
    Object.setPrototypeOf(this, NativeConnectionError.prototype);
  }
}
function connectionError(raw = ""): NativeConnectionError {
  if (/host.*not found/i.test(raw))
    return new NativeConnectionError(
      "host_not_found",
      "Edge cannot find the registered GTR native helper."
    );
  if (/forbidden|not allowed|blocked by|access.*denied/i.test(raw))
    return new NativeConnectionError(
      "host_access_denied",
      "Edge denied access to the GTR native helper. Check the extension origin and managed policy."
    );
  if (/failed to start/i.test(raw))
    return new NativeConnectionError(
      "host_start_failed",
      "Edge found the helper but could not launch it."
    );
  if (/host has exited|native host.*exited/i.test(raw))
    return new NativeConnectionError(
      "host_exited",
      "The native helper exited before responding."
    );
  return new NativeConnectionError(
    "native_channel_error",
    "Edge could not communicate with the GTR native helper."
  );
}
function nativeRequest(request: object): Promise<any> {
  return new Promise((resolve, reject) => {
    if (typeof chrome.runtime.sendNativeMessage !== "function") {
      reject(
        new NativeConnectionError(
          "worker_restart_required",
          "Restart GTR after granting nativeMessaging so the worker can bind the native API."
        )
      );
      return;
    }
    chrome.runtime.sendNativeMessage("com.gtr.agent", request, (response) => {
      if (chrome.runtime.lastError)
        reject(connectionError(chrome.runtime.lastError.message));
      else if (!response?.ok)
        reject(
          new NativeConnectionError(
            "service_not_acknowledged",
            "The helper did not acknowledge the request. Check the service before retrying."
          )
        );
      else resolve(response);
    });
  });
}
export async function enableVerifiedHandoff(
  firstGrant: boolean,
  persist: () => Promise<void>,
  idle: () => Promise<boolean>,
  restart: () => void
): Promise<boolean> {
  await serviceCapacity();
  // An optional API can remain unbound in a worker started before its grant.
  // Persist the user's selection BEFORE restarting, and don't interrupt work.
  await persist();
  if (firstGrant && (await idle())) {
    restart();
    return true;
  }
  return false;
}
export async function checkNativeConnection(): Promise<ServiceCapacity> {
  if (
    !(await chrome.permissions.contains({ permissions: ["nativeMessaging"] }))
  )
    throw new NativeConnectionError(
      "permission_missing",
      "Grant the nativeMessaging permission with Enable native handoff first."
    );
  return serviceCapacity();
}
export async function handoffNewDownload(request: {
  id: string;
  params: {
    name: string;
    source: string;
    container: string;
    proxy: string;
    cookies: string;
  };
}): Promise<string> {
  const response = await nativeRequest({ ...request, method: "submit" });
  if (
    response.owner !== "gtr-transfer-service" ||
    typeof response.jobId !== "string"
  )
    throw new Error("Local service acknowledgement was invalid");
  return response.jobId;
}
export async function serviceCapacity(): Promise<ServiceCapacity> {
  const response = await nativeRequest({ method: "capacity" });
  const result = response.result;
  if (
    !result ||
    !Number.isInteger(result.archiveLimit) ||
    result.archiveLimit < 1 ||
    result.archiveLimit > 6 ||
    !Number.isSafeInteger(result.unfinishedJobs) ||
    result.unfinishedJobs < 0 ||
    !Number.isInteger(result.availableSlots) ||
    result.availableSlots < 0 ||
    result.availableSlots > result.archiveLimit ||
    typeof result.paused !== "boolean" ||
    typeof result.needsAttention !== "boolean"
  )
    throw new Error("Local service capacity is unavailable");
  return result;
}
