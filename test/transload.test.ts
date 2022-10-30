import {
  transload,
  createJobPlan,
  sourceToGtrProxySource
} from "../src/transload";

const someFile =
  "https://mirrors.advancedhosters.com/freebsd/releases/ISO-IMAGES/11.2/FreeBSD-11.2-BETA1-sparc64-dvd1.iso";

describe("transload", () => {
  test("is able to produce a job plan from a source", async () => {
    const jobPlan = await createJobPlan(someFile);
    expect(jobPlan.chunks.length).toBeGreaterThan(0);
    expect(jobPlan.chunks[0].start).toBe(0);
    expect(jobPlan.chunks[0].size).toBe(500 * 1024 * 1024);
    expect(jobPlan.chunks[0].size).toBe(500 * 1024 * 1024);
    // expect(jobPlan.chunks[1].size).toBe(88843308);
    // Check last chunk in jobPlan
    expect(jobPlan.chunks[jobPlan.chunks.length - 1].start).toBeGreaterThan(0);
    expect(jobPlan.chunks[jobPlan.chunks.length - 1].size).toBeGreaterThan(0);
    expect(
      jobPlan.chunks[jobPlan.chunks.length - 1].start +
        jobPlan.chunks[jobPlan.chunks.length - 1].size
    ).toBe(jobPlan.length);

    //
    expect(jobPlan.length).toBe(2757754880);
  });

  test("can transload a test file from a linux iso mirror directly to azure", async () => {
    await transload(someFile, process.env.AZ_BLOB_SAS_URL!, "iso.dat");
  }, 30000);

  test("can construct a valid base64 url using the gtr proxy", () => {
    expect(sourceToGtrProxySource(someFile)).toBe(
      "https://gtr-proxy.677472.xyz/p/aHR0cHM6Ly9taXJyb3JzLmFkdmFuY2VkaG9zdGVycy5jb20vZnJlZWJzZC9yZWxlYXNlcy9JU08tSU1BR0VTLzkuMy9GcmVlQlNELTkuMy1SRUxFQVNFLWFtZDY0LWRpc2MxLmlzby54eg==/data.bin"
    );
  });

  test("can download a valid base64 url using the gtr proxy", async () => {
    const gtr_proxy_url = sourceToGtrProxySource(someFile);
    await transload(gtr_proxy_url, process.env.AZ_BLOB_SAS_URL!, "iso2.dat");
  }, 30000);
});
