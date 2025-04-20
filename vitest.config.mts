import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config';

const config = defineWorkersConfig({
	test: {
		poolOptions: {
			workers: {
				wrangler: { configPath: './wrangler.jsonc' },
			},
		},
	},
});

export default config;
