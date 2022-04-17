const esbuild = require("esbuild");

esbuild
  .build({
    entryPoints: ["./src/background.ts", "./src/popup.tsx"],
    bundle: true,
    // Let's not minify to make the review easier
    minify: false,
    sourcemap: process.env.NODE_ENV !== "production",
    target: ["chrome58", "firefox57"],
    outdir: "./public/build",
    watch: process.env.ESB_WATCH == "true",
    define: {
      "process.env.NODE_ENV": `"${process.env.NODE_ENV}"`
    }
  })
  .catch(() => process.exit(1));
