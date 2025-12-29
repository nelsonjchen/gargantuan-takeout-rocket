import { test as base, chromium } from '@playwright/test';
import path from 'path';

export const test = base.extend({
    context: async ({ }, use) => {
        const pathToExtension = path.join(__dirname, '../../dist');
        const context = await chromium.launchPersistentContext('', {
            headless: false, // Extensions only work in full Chrome, not headless shell, but we can try to minimize visibility or use new headless modes if supported.
            // However, loading extensions usually requires `headless: false` or `headless: 'new'` with specific flags. 
            // For simplicity and reliability with extensions, specific args are needed.
            args: [
                `--disable-extensions-except=${pathToExtension}`,
                `--load-extension=${pathToExtension}`
            ],

        });
        await use(context);
        await context.close();
    },
    extensionId: async ({ context }, use) => {
        // for manifest v3, we might need a way to get the ID if we need to inspect background pages directly.
        // For this simple test, we might not strictly need it if we just check behavior.
        // But let's try to grab it if possible.
        // This is a placeholder if we need it later.
        let [background] = context.serviceWorkers();
        if (!background)
            background = await context.waitForEvent('serviceworker');

        const extensionId = background.url().split('/')[2];
        await use(extensionId);
    },
});
