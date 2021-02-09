import replace from "@rollup/plugin-replace";
import resolve from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";
import { terser } from "rollup-plugin-terser";
import serve from "rollup-plugin-serve";
import livereload from "rollup-plugin-livereload";
import typescript from "rollup-plugin-typescript2";
import babel from "rollup-plugin-babel";
import postcss from "rollup-plugin-postcss";
import multiInput from "rollup-plugin-multi-input";

const production = process.env.NODE_ENV === "production";

export default {
  input: ["src/popup.tsx", "src/background.ts", "src/content.ts"],
  output: {
    dir: "public/build",
    format: "esm"
  },
  plugins: [
    multiInput(),
    replace({
      "process.env.NODE_ENV": JSON.stringify(
        production ? "production" : "development"
      )
    }),
    resolve({
      browser: true,
      extensions: [".js", ".ts", ".tsx", ".jsx"]
    }),
    postcss({
      modules: true
    }),
    commonjs(),
    babel({
      exclude: ["node_modules/**"]
    }),
    typescript({
      sourceMap: !production
    }),
    production && terser(),
    !production && serve("public"),
    !production &&
      livereload({
        watch: "public"
      })
  ],
  watch: {
    clearScreen: false
  }
};
