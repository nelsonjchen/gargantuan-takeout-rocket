import { transload, createJobPlan } from "../src/transload";

const ubuntuIso =
  "https://mirrors.advancedhosters.com/ubuntu-releases/20.04/ubuntu-20.04.4-desktop-amd64.iso";

describe("transload", () => {
  test("is able to produce a job plan from a source", async () => {
    const jobPlan = await createJobPlan(ubuntuIso);
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
    expect(jobPlan.length).toBe(3379068928);
  });

  test("can transload a test file from a linux iso mirror directly to azure", async () => {
    await transload(ubuntuIso, process.env.AZ_BLOB_SAS_URL!, "iso.dat");
  }, 30000);
});
