import React, { useEffect, useState } from "react";
import { Download } from "../state";
import {
  failureGuidance,
  formatBytes,
  groupDownloads,
  safeReason,
  transferLabel
} from "./model";

function ArchiveRow({
  download,
  active,
  checked
}: {
  download: Download;
  active: boolean | undefined;
  checked: boolean;
}) {
  const pending = download.status === "pending";
  const statusClass = pending
    ? active
      ? "pending"
      : "unknown"
    : download.status;
  const percent = download.totalBytes
    ? Math.min(
        100,
        Math.max(
          0,
          Math.floor(
            ((download.transferredBytes || 0) / download.totalBytes) * 100
          )
        )
      )
    : undefined;
  const failure = failureGuidance(download.reason);
  const exactSize = download.size ?? download.totalBytes;
  return (
    <li className={`archive ${statusClass}`}>
      <div className="archive-top">
        <span className="archive-name">{download.name}</span>
        <span className={`status-label ${statusClass}`}>
          {transferLabel(download, active, checked)}
        </span>
      </div>
      {pending && percent !== undefined && (
        <div className="progress">
          <progress
            max={100}
            value={percent}
            aria-label={`Blocks copied for ${download.name}`}
            aria-valuetext={`${percent}% copied; ${
              active ? "archive not finalized yet" : "last recorded progress"
            }`}
          />
          <span>{percent}%</span>
        </div>
      )}
      <p className="archive-detail">
        {download.status === "complete"
          ? download.reason
            ? safeReason(download.reason)
            : `${formatBytes(download.size)} saved to Azure`
          : download.status === "failed"
          ? failure.title
          : active
          ? download.phase === "committing"
            ? "All bytes copied. Waiting for Azure to finalize the archive."
            : download.totalBytes
            ? `${formatBytes(download.transferredBytes || 0)} / ${formatBytes(
                download.totalBytes
              )} · ${download.completedBlocks || 0} of ${
                download.totalBlocks
              } blocks copied`
            : "Requesting the archive size from Google…"
          : active === undefined
          ? checked
            ? "Couldn’t reach the transfer worker. Reopen the extension to check again."
            : "Checking for a running transfer…"
          : "No running transfer found. Check this archive in Azure before downloading again."}
      </p>
      {pending &&
        active &&
        download.phase === "copying" &&
        !download.completedBlocks && (
          <p className="archive-help">
            {download.totalBlocks === 1
              ? "Copying this archive in one block. Progress updates when it finishes."
              : "Progress updates as each block finishes copying."}
          </p>
        )}
      {download.status === "failed" && (
        <p className="archive-help">{failure.action}</p>
      )}
      {pending && download.updatedAt && !active && (
        <p className="last-update">
          Last update {new Date(download.updatedAt).toLocaleString()}
        </p>
      )}
      {(download.reason || exactSize !== undefined || download.updatedAt) && (
        <details className="archive-details">
          <summary>
            {download.status === "failed"
              ? "Error details"
              : "Transfer details"}
          </summary>
          {download.status === "failed" && download.reason && (
            <pre>{safeReason(download.reason)}</pre>
          )}
          <dl>
            {exactSize !== undefined && (
              <>
                <dt>Archive size</dt>
                <dd>{exactSize.toLocaleString()} bytes</dd>
              </>
            )}
            {pending && download.transferredBytes !== undefined && (
              <>
                <dt>Bytes copied</dt>
                <dd>{download.transferredBytes.toLocaleString()}</dd>
              </>
            )}
            {download.updatedAt && (
              <>
                <dt>
                  {download.status === "complete" ? "Completed" : "Last update"}
                </dt>
                <dd>{new Date(download.updatedAt).toLocaleString()}</dd>
              </>
            )}
          </dl>
        </details>
      )}
    </li>
  );
}

function ExportGroup({
  group,
  initiallyOpen,
  activeNames,
  checked
}: {
  group: ReturnType<typeof groupDownloads>[number];
  initiallyOpen: boolean;
  activeNames: string[] | undefined;
  checked: boolean;
}) {
  const activeCount = group.downloads.filter(
    (d) => d.status === "pending" && activeNames?.includes(d.name)
  ).length;
  const attentionCount = group.downloads.filter(
    (d) =>
      d.status === "failed" ||
      (d.status === "pending" && checked && !activeNames?.includes(d.name))
  ).length;
  const [open, setOpen] = useState(initiallyOpen);
  useEffect(() => {
    if (activeCount) setOpen(true);
  }, [activeCount]);
  const rows = (
    <ol className="archive-list">
      {group.downloads.map((download) => (
        <ArchiveRow
          key={download.name}
          download={download}
          active={
            activeNames === undefined
              ? undefined
              : activeNames.includes(download.name)
          }
          checked={checked}
        />
      ))}
    </ol>
  );
  return (
    <details
      className="export-group"
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary>
        <span>
          {group.date
            ? new Date(group.date).toLocaleString(undefined, {
                month: "short",
                day: "numeric",
                year: "numeric",
                hour: "numeric",
                minute: "2-digit"
              })
            : "Other archives"}
        </span>
        <span className="export-count">
          {activeCount ? `${activeCount} active · ` : ""}
          {group.downloads.length}{" "}
          {group.downloads.length === 1 ? "archive" : "archives"}
          {attentionCount > 0 && (
            <span className="group-attention">
              {" "}
              · {attentionCount} need attention
            </span>
          )}
        </span>
      </summary>
      {rows}
    </details>
  );
}

export default function ArchiveHistory({
  downloads,
  activeNames,
  checked
}: {
  downloads: Download[];
  activeNames: string[] | undefined;
  checked: boolean;
}) {
  return (
    <div className="export-list">
      {groupDownloads(downloads).map((group, index) => (
        <ExportGroup
          key={group.id}
          group={group}
          initiallyOpen={index === 0}
          activeNames={activeNames}
          checked={checked}
        />
      ))}
    </div>
  );
}
