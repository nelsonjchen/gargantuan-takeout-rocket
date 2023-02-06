import {
  transload,
  createJobPlan,
  sourceToGtrProxySource
} from "../src/transload";

const proxyBaseUrl = "https://gtr-proxy.677472.xyz";

const someFileUrl = "https://gtr-test.677472.xyz/200MB.zip";
// File exists on-demand. Does not always exist for obvious reasons.
// This is hosted on R2, so it is unlimited bandwidth, but not storage.
const superlargeFileUrl = "https://gtr-test.677472.xyz/50GB.dat";

describe("transload", () => {
  test("is able to produce a job plan from a source", async () => {
    const mb = 100;
    const jobPlan = await createJobPlan(someFileUrl, mb);
    console.log(`Got job plan: `, jobPlan);
    expect(jobPlan.chunks.length).toBeGreaterThan(0);
    expect(jobPlan.chunks[0].start).toBe(0);

    expect(jobPlan.chunks[0].size).toBe(mb * 1024 * 1024);
    // expect(jobPlan.chunks[1].size).toBe(88843308);
    // Check last chunk in jobPlan
    expect(jobPlan.chunks[jobPlan.chunks.length - 1].start).toBeGreaterThan(0);
    expect(jobPlan.chunks[jobPlan.chunks.length - 1].size).toBeGreaterThan(0);
    expect(
      jobPlan.chunks[jobPlan.chunks.length - 1].start +
        jobPlan.chunks[jobPlan.chunks.length - 1].size
    ).toBe(jobPlan.length);
    // Make sure none of the job plans have a size of 0
    jobPlan.chunks.forEach((chunk) => {
      expect(chunk.size).toBeGreaterThan(0);
    });
    //
    expect(jobPlan.length).toBe(209715200);
  });

  test("can tell azure to transload a file", async () => {
    const AZURE_STORAGE_CONNECTION_STRING =
      process.env.AZURE_STORAGE_CONNECTION_STRING;
    if (!AZURE_STORAGE_CONNECTION_STRING) {
      throw new Error("No AZURE_STORAGE_CONNECTION_STRING");
    }

    await transload(
      someFileUrl,
      AZURE_STORAGE_CONNECTION_STRING,
      "gtr-ext-test-medium-file.dat",
      proxyBaseUrl,
      50
    );
  }, 30000);

  test("can tell azure to transload a file that is from the proxy", async () => {
    const AZURE_STORAGE_CONNECTION_STRING =
      process.env.AZURE_STORAGE_CONNECTION_STRING;
    if (!AZURE_STORAGE_CONNECTION_STRING) {
      throw new Error("No AZURE_STORAGE_CONNECTION_STRING");
    }

    const proxifiedSomeFileUrl = sourceToGtrProxySource(someFileUrl);

    await transload(
      proxifiedSomeFileUrl,
      AZURE_STORAGE_CONNECTION_STRING,
      "gtr-ext-test-medium-file-proxy.dat"
    );
  }, 30000);

  test.skip("can transload a superlarge test file from the test site directly to azure", async () => {
    const AZURE_STORAGE_CONNECTION_STRING =
      process.env.AZURE_STORAGE_CONNECTION_STRING;
    if (!AZURE_STORAGE_CONNECTION_STRING) {
      throw new Error("No AZURE_STORAGE_CONNECTION_STRING");
    }

    const targetUrl = sourceToGtrProxySource(superlargeFileUrl);

    await transload(
      targetUrl,
      AZURE_STORAGE_CONNECTION_STRING,
      "gtr-ext-test-large-file.dat",
      proxyBaseUrl,
      1000
    );
  }, 60000);
});
