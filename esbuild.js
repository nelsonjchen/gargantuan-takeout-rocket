const esbuild = require("esbuild");

esbuild
  .context({
    entryPoints: ["./src/background.ts", "./src/popup.tsx"],
    bundle: true,
    // Let's not minify to make the review easier
    minify: false,
    sourcemap: process.env.NODE_ENV !== "production",
    target: ["chrome58", "firefox57"],
    outdir: "./public/build",
    define: {
      "process.env.NODE_ENV": `"${process.env.NODE_ENV}"`
    }
  })
  .then((context) => {
    if (process.env.ESB_WATCH === "true") {
      // Enable watch mode
      context.watch();
    } else {
      // Build once and exit if not in watch mode
      context.rebuild().then((result) => {
        context.dispose();
      });
    }
  })
  .catch(() => process.exit(1));
