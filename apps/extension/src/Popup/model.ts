import { Download } from "../state";
import { validateTransloadConfig } from "../config";

export function destinationInfo(sas: string, proxy: string, now = Date.now()) {
  const error = validateTransloadConfig(sas, proxy, now);
  if (error && !error.startsWith("Azure access has expired")) return { error };
  const url = new URL(sas.trim());
  const expiry = url.searchParams.get("se");
  const expiresAt = expiry ? Date.parse(expiry) : undefined;
  if (expiry && !Number.isFinite(expiresAt))
    return { error: "The Azure expiry date is invalid." };
  let container = url.pathname.slice(1);
  try {
    container = decodeURIComponent(container);
  } catch {
    /* Keep a malformed path readable. */
  }
  const label = `${url.hostname.split(".")[0]} / ${container}`;
  return {
    label,
    expiresAt,
    error:
      expiresAt !== undefined && expiresAt <= now
        ? "Azure access has expired. Replace the SAS URL in Settings."
        : undefined
  };
}

export function formatBytes(bytes?: number) {
  if (bytes === undefined) return "";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const unit = bytes > 0 ? Math.min(Math.floor(Math.log10(bytes) / 3), 4) : 0;
  return `${new Intl.NumberFormat(undefined, {
    maximumFractionDigits: unit ? 2 : 0
  }).format(bytes / 1000 ** unit)} ${units[unit]}`;
}

export function safeReason(reason?: string) {
  return (
    reason
      ?.replace(/https?:\/\/[^\s<>]+/gi, "[URL hidden]")
      .replace(/\b[\w.-]+\.[a-z]{2,}\/[^\s<>]*\?[^\s<>]+/gi, "[URL hidden]")
      .replace(
        /\b(sig|signature|token|authorization|cookie)\s*[:=]\s*[^\s<>]+/gi,
        "$1=[hidden]"
      )
      .slice(0, 1500) || ""
  );
}

export function transferLabel(
  download: Download,
  active: boolean | undefined,
  checked = false
) {
  if (download.status === "complete") return "Complete";
  if (download.status === "failed") return "Failed";
  if (active === undefined)
    return checked ? "Status unavailable" : "Checking status";
  if (!active) return "Unconfirmed";
  return download.phase === "committing"
    ? "Finalizing"
    : download.phase === "inspecting"
    ? "Reading archive"
    : "Transferring";
}

export function failureGuidance(reason = "") {
  if (/content-length/i.test(reason))
    return {
      title: "Couldn’t read the archive size",
      action:
        "Open Takeout, confirm the archive is still available, and click Download again. Google may ask you to sign in."
    };
  if (/inspect source: HTTP (401|403)/i.test(reason))
    return {
      title: "Download access was denied",
      action:
        "Open Takeout and sign in again, then click Download on this archive."
    };
  if (/commit block list/i.test(reason))
    return {
      title: "Azure couldn’t finalize the archive",
      action:
        "Check this blob’s size in Azure before trying again. Copied blocks alone do not confirm a complete backup."
    };
  if (/403|AuthenticationFailed|AuthorizationPermissionMismatch/i.test(reason))
    return {
      title: "The transfer was denied access",
      action:
        "Check the Azure SAS expiry and permissions, then open Takeout to refresh your Google sign-in before trying again."
    };
  return {
    title: "The archive didn’t finish transferring",
    action:
      "Check the archive in Azure before trying again from Takeout. Use the error details below to investigate."
  };
}

export function groupDownloads(downloads: Download[]) {
  const groups = new Map<
    string,
    { id: string; date?: string; downloads: Download[] }
  >();
  for (const download of downloads) {
    const match = download.name.match(
      /^takeout-(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z-/
    );
    const date = match
      ? `${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6]}Z`
      : undefined;
    const validDate =
      date && Number.isFinite(Date.parse(date)) ? date : undefined;
    const id = validDate || "other";
    if (!groups.has(id)) groups.set(id, { id, date: validDate, downloads: [] });
    groups.get(id)!.downloads.push(download);
  }
  return [...groups.values()];
}

export function sortDownloads(downloads: Download[], active: string[] = []) {
  return [...downloads].sort((a, b) => {
    const running =
      Number(active.includes(b.name)) - Number(active.includes(a.name));
    if (running) return running;
    // Takeout's timestamp is in the name; old records have no stored timestamps.
    return (
      (b.startedAt || 0) - (a.startedAt || 0) ||
      b.name.localeCompare(a.name, undefined, { numeric: true })
    );
  });
}
