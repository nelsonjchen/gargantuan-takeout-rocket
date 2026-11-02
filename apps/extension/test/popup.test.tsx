import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import App from "../src/Popup/App";
import ArchiveHistory from "../src/Popup/ArchiveHistory";
import {
  destinationInfo,
  transferLabel,
  sortDownloads,
  groupDownloads,
  safeReason,
  failureGuidance
} from "../src/Popup/model";
import { Download } from "../src/state";

const mockStorage: Record<string, unknown> = {
  enabled: false,
  azureSasUrl:
    "https://backup.blob.core.windows.net/archives?sig=private-token&se=2099-01-01T00%3A00%3A00Z",
  proxyBaseUrl: "https://proxy.test",
  downloads: {}
};
const initialStorage = { ...mockStorage };
beforeEach(() => Object.assign(mockStorage, initialStorage));
jest.mock("use-chrome-storage", () => ({
  useChromeStorageLocal: (key: string) => [
    mockStorage[key],
    jest.fn(),
    true,
    "",
    true
  ]
}));

test("renders saved state and hides credentials instead of treating persistence as an error", () => {
  const html = renderToStaticMarkup(<App />);
  expect(html).toContain("backup / archives");
  expect(html).toContain("Configured");
  expect(html).not.toContain("could not be read");
  expect(html).toContain('type="password"');
  expect(html).not.toContain('type="text"');
});

test("rejects an expired Azure credential while retaining its destination label", () => {
  const info = destinationInfo(
    "https://backup.blob.core.windows.net/archives?sig=secret&se=2020-01-01",
    "https://proxy.test"
  );
  expect(info.label).toBe("backup / archives");
  expect(info.error).toMatch(/expired/);
});

test("legacy pending records and disconnected workers never claim a live transfer", () => {
  const download: Download = { name: "old.zip", status: "pending" };
  expect(transferLabel(download, false)).toBe("Unconfirmed");
  expect(transferLabel(download, undefined)).toBe("Checking status");
  expect(transferLabel({ ...download, phase: "committing" }, true)).toBe(
    "Finalizing"
  );
});

test("puts running archives first and sorts history by Takeout date and numeric part", () => {
  const make = (name: string): Download => ({ name, status: "pending" });
  expect(
    sortDownloads(
      [
        make("takeout-20251231-9-004.zip"),
        make("takeout-20261004-1-001.zip"),
        make("takeout-20251231-13-001.zip")
      ],
      ["takeout-20251231-13-001.zip"]
    ).map((d) => d.name)
  ).toEqual([
    "takeout-20251231-13-001.zip",
    "takeout-20261004-1-001.zip",
    "takeout-20251231-9-004.zip"
  ]);
});

test("an enabled but expired credential tells the user downloads stay local", () => {
  mockStorage.enabled = true;
  mockStorage.azureSasUrl =
    "https://backup.blob.core.windows.net/archives?sig=secret&se=2020-01-01";
  const html = renderToStaticMarkup(<App />);
  expect(html).toContain("Azure access needs attention");
  expect(html).toContain("New downloads stay on this device");
  expect(html).toContain("Blocked");
  expect(html).not.toContain(
    "New Takeout downloads will transfer to your backup"
  );
});

test("credential status uses the supplied clock on either side of expiry", () => {
  const sas =
    "https://backup.blob.core.windows.net/archives?sig=secret&se=2026-10-05T20:00:00Z";
  expect(
    destinationInfo(
      sas,
      "https://proxy.test",
      Date.parse("2026-10-05T19:59:59Z")
    ).error
  ).toBeUndefined();
  expect(
    destinationInfo(
      sas,
      "https://proxy.test",
      Date.parse("2026-10-05T20:00:00Z")
    ).error
  ).toMatch(/expired/);
});

test("groups every archive by export, including different product part numbers and legacy names", () => {
  const downloads: Download[] = [
    { name: "takeout-20261004T203039Z-1-002.zip", status: "pending" },
    { name: "takeout-20251231T012820Z-13-001.zip", status: "failed" },
    { name: "takeout-20261004T203039Z-9-001.zip", status: "complete" },
    { name: "manual.zip", status: "complete" }
  ];
  const groups = groupDownloads(downloads);
  expect(groups.map((group) => [group.id, group.downloads.length])).toEqual([
    ["2026-10-04T20:30:39Z", 2],
    ["2025-12-31T01:28:20Z", 1],
    ["other", 1]
  ]);
  expect(groups.flatMap((group) => group.downloads)).toHaveLength(
    downloads.length
  );
});

test("mini archives explain single-block progress, and 100% copied still means finalizing", () => {
  const mini: Download = {
    name: "mini.zip",
    status: "pending",
    phase: "copying",
    totalBytes: 32,
    transferredBytes: 0,
    totalBlocks: 1,
    completedBlocks: 0
  };
  const render = (download: Download) =>
    renderToStaticMarkup(
      <ArchiveHistory
        downloads={[download]}
        activeNames={[download.name]}
        checked
      />
    );
  expect(render(mini)).toContain("Copying this archive in one block");
  const finalizing = render({
    ...mini,
    phase: "committing",
    transferredBytes: 32,
    completedBlocks: 1
  });
  expect(finalizing).toContain("Finalizing");
  expect(finalizing).toContain("Waiting for Azure to finalize");
  expect(finalizing).not.toContain("status-label complete");
});

test("failed worker checks are distinct from checks still in flight", () => {
  const pending: Download = { name: "pending.zip", status: "pending" };
  expect(transferLabel(pending, undefined, true)).toBe("Status unavailable");
  expect(transferLabel(pending, undefined, false)).toBe("Checking status");
  const html = renderToStaticMarkup(
    <ArchiveHistory downloads={[pending]} activeNames={undefined} checked />
  );
  expect(html).toContain("Couldn’t reach the transfer worker");
  expect(html).not.toContain("No running transfer found");
});

test("error details redact signed URLs and tokens while recovery distinguishes finalization failures", () => {
  const reason = safeReason(
    "Failed https://host.test/a?sig=first host.test/b?sig=second sig=third"
  );
  expect(reason).not.toMatch(/first|second|third/);
  expect(failureGuidance("No content-length header").action).toContain(
    "Open Takeout"
  );
  expect(failureGuidance("Failed to commit block list: 403").action).toContain(
    "Check this blob’s size in Azure"
  );
});
