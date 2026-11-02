import { Download } from "./state";
import { validateTransloadConfig } from "./config";
import {
  advanceJob,
  destinationIdentity,
  jobDownload,
  MAX_TRANSFERS,
  newJob,
  TransferJob
} from "./transferQueue";
import { queueBackend } from "./queueBackend";

const PREFIX = "gtr-job:";
const ALARM = "gtr-queue-recovery";
export const readLocal = (
  keys: string | string[] | null
): Promise<Record<string, any>> =>
  new Promise((resolve, reject) => {
    chrome.storage.local.get(keys, (result) =>
      chrome.runtime.lastError
        ? reject(new Error("Could not read extension storage"))
        : resolve(result)
    );
  });
export const writeLocal = (values: Record<string, unknown>): Promise<void> =>
  new Promise((resolve, reject) => {
    chrome.storage.local.set(values, () =>
      chrome.runtime.lastError
        ? reject(new Error("Could not save extension storage"))
        : resolve()
    );
  });

export class QueueRuntime {
  private pumping?: Promise<void>;
  private wakeRequested = false;
  private writes: Promise<void> = Promise.resolve();
  readonly active = new Set<string>();
  constructor(
    private cookies: (url: string) => Promise<string>,
    private saveDownload: (download: Download) => Promise<void>
  ) {}

  async jobs(): Promise<TransferJob[]> {
    const data = await readLocal(null);
    return Object.entries(data)
      .filter(([key]) => key.startsWith(PREFIX))
      .map(([, value]) => value as TransferJob);
  }
  private key(job: TransferJob) {
    return PREFIX + job.destination + "/" + job.name;
  }
  private async save(job: TransferJob, progress?: Download) {
    await writeLocal({ [this.key(job)]: job });
    if (progress) await this.saveDownload(progress);
    if (job.state === "complete" || job.state === "blocked") {
      chrome.notifications.create(`gtr-${job.id}`, {
        title:
          job.state === "complete"
            ? "GTR backup verified"
            : "GTR needs attention",
        message:
          job.state === "complete"
            ? `${job.name} is committed in Azure.`
            : `${job.name}: ${
                job.reason || "Open Takeout Rocket to check the job."
              }`,
        type: "basic",
        iconUrl: "/logo512.png"
      });
    }
  }
  async enqueue(
    name: string,
    source: string,
    container: string
  ): Promise<boolean> {
    // Serialize duplicate downloads through their persistent destination key.
    const operation = this.writes.then(async () => {
      const candidate = newJob(name, source, container);
      const key = this.key(candidate);
      const existing = (await readLocal(key))[key] as TransferJob | undefined;
      if (this.active.has(name)) return true;
      if (existing && existing.state !== "blocked") return true;
      if (existing) {
        // Explicit re-download refreshes expiring source access, retaining IDs.
        existing.source = source;
        existing.state = "queued";
        existing.attempts = 0;
        existing.reason = undefined;
        await this.save(existing, jobDownload(existing));
      } else {
        // Legacy pending records have no resumable plan. Never silently replay.
        const history = (await readLocal("downloads")).downloads || {};
        if (history[name]?.status === "pending") {
          chrome.notifications.create("gtr-legacy-pending", {
            title: "GTR needs an earlier transfer checked",
            message: `${name} has an unconfirmed earlier attempt. No duplicate transfer was started.`,
            type: "basic",
            iconUrl: "/logo512.png"
          });
          return false;
        }
        if (history[name]?.status === "complete" && history[name]?.size) {
          const settings = await readLocal("proxyBaseUrl");
          const existingBlob = await queueBackend(
            container,
            settings.proxyBaseUrl || "https://gtr-proxy.677472.xyz",
            this.cookies
          ).inspectBlob(name);
          if (existingBlob?.size === history[name].size) return true;
        }
        await this.save(candidate, jobDownload(candidate));
      }
      return true;
    });
    this.writes = operation.then(
      () => {},
      () => {}
    );
    const captured = await operation;
    this.wake();
    return captured;
  }
  wake(): void {
    if (this.pumping) {
      this.wakeRequested = true;
      return;
    }
    if (!this.pumping) {
      this.pumping = this.pump()
        .catch(() => {
          console.error(
            "Transfer queue paused; storage or configuration could not be read."
          );
        })
        .finally(() => {
          this.pumping = undefined;
          if (this.wakeRequested) {
            this.wakeRequested = false;
            this.wake();
          }
        });
    }
  }
  async resume(): Promise<void> {
    await this.writes;
    // Avoid replacing an in-flight checkpoint with an older snapshot.
    for (const job of await this.jobs()) {
      if (
        !this.active.has(job.name) &&
        (job.state === "waiting" || job.state === "blocked")
      ) {
        job.state = "queued";
        job.attempts = 0;
        job.retryAt = undefined;
        job.reason = undefined;
        await this.save(job, jobDownload(job));
      }
    }
    this.wake();
  }
  private async pump() {
    const deadline = Date.now() + 120_000;
    while (Date.now() < deadline) {
      const settings = await readLocal([
        "azureSasUrl",
        "proxyBaseUrl",
        "downloads",
        "queuePaused"
      ]);
      if (settings.queuePaused) return;
      const container = settings.azureSasUrl?.trim() || "";
      const proxy =
        settings.proxyBaseUrl?.trim() || "https://gtr-proxy.677472.xyz";
      if (validateTransloadConfig(container, proxy)) return;
      const jobs = await this.jobs();
      // Unconfirmed legacy jobs reserve slots until their outcome is resolved.
      const legacy = Object.values(settings.downloads || {}).filter(
        (d: any) =>
          d.owner !== "service" &&
          d.status === "pending" &&
          !jobs.some((j) => j.name === d.name)
      ).length;
      const ready = jobs
        .filter((j) => j.state !== "complete")
        .sort((a, b) => a.createdAt - b.createdAt)
        .slice(0, Math.max(0, MAX_TRANSFERS - legacy))
        .filter(
          (j) =>
            j.destination === destinationIdentity(container) &&
            (j.state === "queued" ||
              j.state === "running" ||
              (j.state === "waiting" && (j.retryAt || 0) <= Date.now()))
        );
      if (!ready.length) return;
      const outcomes = await Promise.allSettled(
        ready.map(async (job) => {
          this.active.add(job.name);
          try {
            await advanceJob(
              job,
              queueBackend(container, proxy, this.cookies),
              (record, progress) => this.save(record, progress)
            );
          } finally {
            this.active.delete(job.name);
          }
        })
      );
      if (outcomes.some((result) => result.status === "rejected"))
        throw new Error("Could not checkpoint the transfer batch");
    }
  }
  install(): void {
    // No polling credentials or remote control endpoint. Only the extension's
    // existing local queue is woken; browser sleep/offline is recoverable.
    chrome.alarms.onAlarm.addListener((alarm) => {
      if (alarm.name === ALARM) this.wake();
    });
    const start = async () => {
      await chrome.storage.local.setAccessLevel({
        accessLevel: "TRUSTED_CONTEXTS"
      });
      const alarm = await chrome.alarms.get(ALARM);
      if (!alarm) await chrome.alarms.create(ALARM, { periodInMinutes: 1 });
      this.wake();
    };
    chrome.runtime.onStartup.addListener(() => {
      void start().catch(() => {});
    });
    chrome.runtime.onInstalled.addListener(() => {
      void start().catch(() => {});
    });
    chrome.storage.onChanged.addListener((changes, area) => {
      if (
        area === "local" &&
        (changes.azureSasUrl || changes.proxyBaseUrl || changes.queuePaused)
      )
        this.wake();
    });
    void start().catch(() => {
      console.error("Could not initialize queue recovery");
    });
  }
}
