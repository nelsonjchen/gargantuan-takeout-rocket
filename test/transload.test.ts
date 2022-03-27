import {
  transload,
  createJobPlan,
  sourceToGtrProxySource
} from "../src/transload";

const someIso =
  "https://mirrors.advancedhosters.com/freebsd/releases/ISO-IMAGES/9.3/FreeBSD-9.3-RELEASE-amd64-disc1.iso.xz";
const a2_7gigIso =
  "https://mirrors.advancedhosters.com/debian-cd/11.3.0-live/amd64/iso-hybrid/debian-live-11.3.0-amd64-cinnamon.iso";

describe("transload", () => {
  test("is able to produce a job plan from a source", async () => {
    const jobPlan = await createJobPlan(someIso);
    expect(jobPlan.chunks.length).toBeGreaterThan(0);
    expect(jobPlan.chunks[0].start).toBe(0);
    expect(jobPlan.chunks[0].size).toBe(100 * 1024 * 1024);
    expect(jobPlan.chunks[1].start).toBe(100 * 1024 * 1024);
    expect(jobPlan.chunks[1].size).toBe(100 * 1024 * 1024);
    // Check last chunk in jobPlan
    expect(jobPlan.chunks[jobPlan.chunks.length - 1].start).toBeGreaterThan(0);
    expect(jobPlan.chunks[jobPlan.chunks.length - 1].size).toBeGreaterThan(0);
    expect(
      jobPlan.chunks[jobPlan.chunks.length - 1].start +
        jobPlan.chunks[jobPlan.chunks.length - 1].size
    ).toBe(jobPlan.length);

    //
    expect(jobPlan.length).toBe(403416108);
  });

  test("can transload a test file from a linux iso mirror directly to azure", async () => {
    await transload(someIso, process.env.AZ_BLOB_SAS_URL!, "iso.dat");
  }, 30000);

  test("can construct a valid base64 url using the gtr proxy", () => {
    expect(sourceToGtrProxySource(someIso)).toBe(
      "https://gtr-proxy.mindflakes.com/p/aHR0cHM6Ly9taXJyb3JzLmFkdmFuY2VkaG9zdGVycy5jb20vZnJlZWJzZC9yZWxlYXNlcy9JU08tSU1BR0VTLzkuMy9GcmVlQlNELTkuMy1SRUxFQVNFLWFtZDY0LWRpc2MxLmlzby54eg=="
    );
  });

  test("can download a valid base64 url using the gtr proxy", async () => {
    const gtr_proxy_url = sourceToGtrProxySource(someIso);
    await transload(gtr_proxy_url, process.env.AZ_BLOB_SAS_URL!, "iso2.dat");
  }, 30000);

  test.skip("can download a larger base64 url using the gtr proxy", async () => {
    const gtr_proxy_url = sourceToGtrProxySource(a2_7gigIso);
    await transload(gtr_proxy_url, process.env.AZ_BLOB_SAS_URL!, "iso3.dat");
  }, 60000);

  test("can download a larger base64 url", async () => {
    await transload(a2_7gigIso, process.env.AZ_BLOB_SAS_URL!, "iso4.dat");
  }, 60000);
});
