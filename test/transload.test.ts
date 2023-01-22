import { transload, createJobPlan } from "../src/transload";

const someFile = "https://gtr-test.677472.xyz/200MB.zip";
// File exists on-demand. Does not always exist for obvious reasons.
// This is hosted on R2, so it is unlimited bandwidth, but not storage.
const superlargeFile = "https://gtr-test.677472.xyz/50GB.dat";

describe("transload", () => {
  test("is able to produce a job plan from a source", async () => {
    const mb = 100;
    const jobPlan = await createJobPlan(someFile, mb);
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

  test("can transload a test file from the test site directly to azure", async () => {
    const AZURE_STORAGE_CONNECTION_STRING =
      process.env.AZURE_STORAGE_CONNECTION_STRING;
    if (!AZURE_STORAGE_CONNECTION_STRING) {
      throw new Error("No AZURE_STORAGE_CONNECTION_STRING");
    }

    await transload(someFile, AZURE_STORAGE_CONNECTION_STRING, "iso.dat");
  }, 30000);

  test.skip("can transload a superlarge test file from the test site directly to azure", async () => {
    const AZURE_STORAGE_CONNECTION_STRING =
      process.env.AZURE_STORAGE_CONNECTION_STRING;
    if (!AZURE_STORAGE_CONNECTION_STRING) {
      throw new Error("No AZURE_STORAGE_CONNECTION_STRING");
    }

    await transload(
      superlargeFile,
      AZURE_STORAGE_CONNECTION_STRING,
      "superlarge.dat"
    );
  }, 60000);
});
