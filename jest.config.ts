import type { Config } from '@jest/types'

const config: Config.InitialOptions = {
  testEnvironment: "miniflare",
  transform: {
    '^.+\\.(t|j)sx?$': 'ts-jest',
  },
  testRegex: '/test/.*\\.test\\.ts$',

  collectCoverageFrom: ['src/**/*.{ts,js}'],
  verbose: true,
}

export default config
