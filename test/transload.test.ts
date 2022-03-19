import { transload, createJobPlan } from "../src/transload";

const ubuntuIso =
  "https://mirrors.advancedhosters.com/ubuntu-releases/20.04/ubuntu-20.04.4-desktop-amd64.iso";

describe("transload", () => {
  test("is able to produce a job plan from a source", async () => {
    const jobPlan = await createJobPlan(ubuntuIso);
  });

  test("can transload a test file from a linux iso mirror directly to azure", async () => {
    await transload(ubuntuIso, process.env.AZ_BLOB_SAS_URL!);
  });
});
