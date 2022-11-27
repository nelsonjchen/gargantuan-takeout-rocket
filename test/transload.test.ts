import { transload, createJobPlan } from "../src/transload";

const someFile = "https://gtr-test.677472.xyz/2600MB.iso";

describe("transload", () => {
  test("is able to produce a job plan from a source", async () => {
    const jobPlan = await createJobPlan(someFile);
    expect(jobPlan.chunks.length).toBeGreaterThan(0);
    expect(jobPlan.chunks[0].start).toBe(0);
    const mb = 100;
    expect(jobPlan.chunks[0].size).toBe(mb * 1024 * 1024);
    expect(jobPlan.chunks[0].size).toBe(mb * 1024 * 1024);
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

  test("can transload a test file from the test site directly to azure", async () => {
    const AZURE_STORAGE_CONNECTION_STRING =
      process.env.AZURE_STORAGE_CONNECTION_STRING;
    if (!AZURE_STORAGE_CONNECTION_STRING) {
      throw new Error("No AZURE_STORAGE_CONNECTION_STRING");
    }
    await transload(someFile, AZURE_STORAGE_CONNECTION_STRING, "iso.dat");
  }, 30000);
});
