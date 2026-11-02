require("esbuild")
  .build({
    entryPoints: [__dirname + "/server.ts"],
    outfile: __dirname + "/build/gtr-agent.cjs",
    bundle: true,
    platform: "node",
    target: "node22",
    sourcemap: true,
    logLevel: "info"
  })
  .then(() =>
    require("node:fs").copyFileSync(
      __dirname + "/lease.py",
      __dirname + "/build/lease.py"
    )
  )
  .catch(() => process.exit(1));
