import type {JestConfigWithTsJest} from 'ts-jest'


const config: JestConfigWithTsJest = {
  preset: "ts-jest/presets/default-esm",
  // Include dotenv
  setupFilesAfterEnv: ["dotenv/config"],
  transform: {
    '^.+\\.(t|j)sx?$': [
      'ts-jest', {
        useEsm: true,
      }
    ]
  },
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
    "^(\\.{1,2}/.*)\\.js$": "$1",
  },
  testEnvironment: "miniflare",
  testEnvironmentOptions: {
    // Miniflare doesn't yet support the `main` field in `wrangler.toml` so we
    // need to explicitly tell it where our built worker is. We also need to
    // explicitly mark it as an ES module.
    scriptPath: "dist/worker.mjs",
    modules: true,
  }
};


// noinspection JSUnusedGlobalSymbols
export default config
