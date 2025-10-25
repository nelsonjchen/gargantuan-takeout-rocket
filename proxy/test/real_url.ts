export const real_takeout_url = new URL("https://takeout-download.usercontent.google.com/download/takeout-20241222T093656Z-002.zip?j=3647d71e-7af8-4aa7-9dc1-1f682197329a&i=1&user=798667665537&authuser=0")

import { env } from 'cloudflare:test'

if (!env.VITE_AZ_STORAGE_TEST_URL) {
  throw new Error('VITE_AZ_STORAGE_TEST_URL is not defined')
}
export const real_azb_url = new URL(env.VITE_AZ_STORAGE_TEST_URL)


// This endpoint will require a cookie named `testcookie` with value `valid` to download the file. If this cookie is not set or has an invalid value, it will return a 302 redirect to `/setup.html`, similar to Google Takeout.
export const file_test_cookie_url = new URL("https://gtr-2-dev-server-262382012399.us-central1.run.app/download/test.txt")

// This is a test endpoint with the custom Gtr2Cookie Authentication scheme.
// It will require a cookie named `testcookie` with value `valid` to download the file. If this cookie is not set or has an invalid value, it will return a 302 redirect to `/setup.html`, similar to Google Takeout.
export const file_test_gtr2cookie_auth_url = new URL("https://gtr-2-dev-server-262382012399.us-central1.run.app/download-gtr2cookie-auth/test.txt")
