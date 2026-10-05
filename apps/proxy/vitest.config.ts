import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config';

export default defineWorkersConfig({
    test: {
        poolOptions: {
            workers: {
                wrangler: { configPath: './wrangler.toml' },
                miniflare: {
                    bindings: {
                        AZ_STORAGE_TEST_URL_SEGMENT: 'urlcopytest/some-container/some_file.dat',
                    },
                },
            },
        },
    },
});
