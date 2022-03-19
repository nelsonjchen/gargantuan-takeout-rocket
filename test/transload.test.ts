import { transload } from "../src/transload";

describe("transload", () => {
  test("can transload a test file from a linux iso mirror directly to azure", async () => {
    await transload(
      "https://mirrors.advancedhosters.com/ubuntu-releases/20.04/ubuntu-20.04.4-desktop-amd64.iso",
      process.env.AZ_BLOB_SAS_URL!
    );
  });
});
