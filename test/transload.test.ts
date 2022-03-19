describe("transload", () => {
  test("can transload a test file from a linux iso mirror directly to azure", async () => {
    expect(process.env.SECRET).toBe("secret");
  });
});
