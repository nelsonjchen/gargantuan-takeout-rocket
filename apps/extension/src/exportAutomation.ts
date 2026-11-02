import { QueueRuntime, readLocal, writeLocal } from "./queueRuntime";
import { validateTransloadConfig } from "./config";
import { MAX_TRANSFERS } from "./transferQueue";
import { serviceCapacity } from "./agentHandoff";

export interface ExportPart {
  part: number;
  url: string;
  name?: string;
}
interface ExportRun {
  page: string;
  parts: ExportPart[];
  enabled: boolean;
  next: number;
  requested?: { part: number; url: string; at: number; tabId?: number };
  notice?: string;
}
const KEY = "gtr-export-run";
export function exportPage(url: string): string | undefined {
  try {
    const u = new URL(url);
    return u.origin === "https://takeout.google.com" &&
      /^\/manage\/archive\/[a-f0-9-]+$/.test(u.pathname)
      ? u.origin + u.pathname
      : undefined;
  } catch {
    return undefined;
  }
}
export function validateParts(value: unknown): ExportPart[] | undefined {
  if (!Array.isArray(value) || !value.length || value.length > 1000) return;
  const parts: ExportPart[] = [];
  for (let i = 0; i < value.length; i++) {
    const p = value[i];
    if (p?.part !== i + 1 || typeof p.url !== "string") return;
    try {
      const u = new URL(p.url);
      if (
        u.origin !== "https://takeout.google.com" ||
        !u.pathname.startsWith("/takeout/download") ||
        u.username ||
        u.password
      )
        return;
    } catch {
      return;
    }
    parts.push({ part: p.part, url: p.url });
  }
  if (new Set(parts.map((p) => p.url)).size !== parts.length) return;
  return parts;
}

export class ExportAutomation {
  private busy = false;
  constructor(private queue: QueueRuntime) {}
  async start(page: string, parts: unknown): Promise<string> {
    const validated = validateParts(parts);
    if (!exportPage(page) || !validated)
      return "Could not identify every download link. No export was started.";
    const prior = (await readLocal(KEY))[KEY] as ExportRun | undefined;
    if (prior && prior.page !== page && (prior.enabled || prior.requested))
      return "Another export is already reserved. Resolve or pause it first.";
    // Repeated Start never resets an uncertain request or a captured part.
    const run =
      prior?.page === page
        ? { ...prior, enabled: true }
        : { page, parts: validated, enabled: true, next: 0 };
    await writeLocal({ [KEY]: run });
    await this.tick();
    return "Export queue enabled. Keep this Takeout page open; Google may ask you to sign in in a new tab.";
  }
  async pause(): Promise<void> {
    const run = (await readLocal(KEY))[KEY] as ExportRun | undefined;
    if (run) await writeLocal({ [KEY]: { ...run, enabled: false } });
  }
  async tick(): Promise<string> {
    if (this.busy) return "Checking the export queue…";
    this.busy = true;
    try {
      const data = await readLocal([
        KEY,
        "enabled",
        "azureSasUrl",
        "proxyBaseUrl",
        "queuePaused",
        "downloads",
        "agentServiceEnabled"
      ]);
      const run = data[KEY] as ExportRun | undefined;
      if (!run) return "Ready to queue this export.";
      if (!run.enabled)
        return "Export queue paused. Transfers already captured can continue.";
      if (run.requested)
        return `Part ${
          run.requested.part
        } requested. Waiting for download capture${
          Date.now() - run.requested.at > 120_000
            ? "; check its Google tab or GTR before retrying"
            : " or Google sign-in"
        }.`;
      if (!data.enabled || data.queuePaused)
        return "Enable downloads to Azure and resume the transfer queue first.";
      const error = validateTransloadConfig(
        data.azureSasUrl,
        data.proxyBaseUrl
      );
      if (error) return error;
      const jobs = await this.queue.jobs();
      const legacy = Object.values(data.downloads || {}).filter(
        (d: any) =>
          d.owner !== "service" &&
          d.status === "pending" &&
          !jobs.some((j) => j.name === d.name)
      );
      if (legacy.length)
        return "Earlier transfers have unconfirmed outcomes. Resolve them in GTR before starting more parts.";
      let serviceUnfinishedJobs: number | undefined;
      if (data.agentServiceEnabled) {
        const capacity = await serviceCapacity();
        if (capacity.paused)
          return "The local transfer service is paused. Resume it through its agent endpoint.";
        if (capacity.needsAttention)
          return "The local service has a blocked job or unresolved reservation. Check its agent endpoint.";
        serviceUnfinishedJobs = capacity.unfinishedJobs;
        if (!capacity.availableSlots)
          return "The local service's transfer slots are occupied. The next part will start automatically.";
      }
      if (jobs.some((j) => j.state === "blocked"))
        return "A transfer needs attention. Fix access or the reported error, then resume in GTR.";
      if (jobs.filter((j) => j.state !== "complete").length >= MAX_TRANSFERS)
        return "Transfer slots are occupied. The next part will start automatically.";
      if (run.next >= run.parts.length) {
        if (serviceUnfinishedJobs !== undefined && serviceUnfinishedJobs > 0)
          return "All parts handed to the local service. Waiting for its remaining jobs.";
        if (jobs.some((j) => j.state !== "complete"))
          return "All parts requested. Waiting for Azure verification.";
        return "All listed parts have been captured and their transfer jobs completed. Preserve Google's omission report separately.";
      }
      const part = run.parts[run.next];
      // Reserve BEFORE navigation. A crash here deliberately leaves an uncertain
      // request for review instead of opening a duplicate Google download.
      run.requested = { part: part.part, url: part.url, at: Date.now() };
      await writeLocal({ [KEY]: run });
      const tab = await chrome.tabs.create({ url: part.url, active: true });
      // A download can arrive before create's callback. Do not overwrite its ACK.
      const current = (await readLocal(KEY))[KEY] as ExportRun;
      if (current.requested?.url === part.url) {
        current.requested.tabId = tab.id;
        await writeLocal({ [KEY]: current });
      }
      return `Part ${part.part} requested. Complete Google sign-in if asked.`;
    } finally {
      this.busy = false;
    }
  }
  async captured(item: chrome.downloads.DownloadItem): Promise<void> {
    const run = (await readLocal(KEY))[KEY] as ExportRun | undefined;
    const request = run?.requested;
    if (!run || !request || ![item.url, item.referrer].includes(request.url))
      return;
    // Called only after durable enqueue; match the original URL exactly, never
    // assign an unrelated manual download to the outstanding export part.
    run.parts[run.next].name = item.filename;
    run.next++;
    run.requested = undefined;
    await writeLocal({ [KEY]: run });
    // Leave Google tabs available to the user; don't close authentication UI.
  }
}
