import { test } from './fixtures';
import { expect } from '@playwright/test';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const AZURE_SAS_URL = process.env.VITE_AZ_STORAGE_TEST_URL;

test('intercepts download and logs to console', async ({ context, page }) => {
    // Get the service worker (background script)
    let [background] = context.serviceWorkers();
    if (!background)
        background = await context.waitForEvent('serviceworker');

    // Enable the extension
    background.on('console', msg => console.log('BG Console:', msg.text()));

    await background.evaluate((azureSasUrl) => {
        return new Promise((resolve) => {
            chrome.storage.local.set({
                enabled: true,
                azureSasUrl: azureSasUrl, // Real SAS URL
                proxyBaseUrl: 'https://gtr-proxy.677472.xyz' // Real Proxy URL
            }, resolve);
        });
    }, AZURE_SAS_URL);

    // Navigate to a page to trigger download
    const pageWithExtension = await context.newPage();
    await pageWithExtension.goto('about:blank');
    await pageWithExtension.setContent('<a id="dlink" href="https://gtr-2-dev-server-262382012399.us-central1.run.app/download-no-cookie/test.txt">Download</a>');

    console.log("Trace: Clicking download link");
    await pageWithExtension.click('#dlink');

    // Wait a bit for the background script to process
    // Increase timeout to allow for real network request
    await page.waitForTimeout(10000);

    // Check storage for the intercepted download
    const { downloadsState, enabledState, debugLogs } = await background.evaluate(() => {
        return new Promise((resolve) => {
            chrome.storage.local.get(['downloads', 'enabled', 'debug_logs'], (result) => {
                resolve({
                    downloadsState: result.downloads || {},
                    enabledState: result.enabled,
                    debugLogs: result.debug_logs || []
                });
            });
        });
    });

    console.log('Debug logs:', debugLogs);

    console.log('Enabled state:', enabledState);
    expect(enabledState).toBe(true);

    console.log('Downloads state:', downloadsState);

    // Check if download was intercepted and completed
    const download = downloadsState['test.txt'];
    expect(download).toBeDefined();
    expect(download.name).toBe('test.txt');
    expect(download.status).toBe('complete');
});
