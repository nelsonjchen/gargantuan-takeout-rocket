import type { Config } from '@jest/types'

const config: Config.InitialOptions = {
  testEnvironment: "miniflare",
  preset: 'ts-jest/presets/default-esm',
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  transform: {
    '^.+\\.(t|j)sx?$': [
      'ts-jest', {
        useEsm: true,
      }
    ]
  },
  testRegex: '/test/.*\\.test\\.ts$',

  collectCoverageFrom: ['src/**/*.{ts,js}'],
  verbose: true,
  // Load dotenv
  setupFiles: [
    'dotenv/config',
  ]
}

export default config
