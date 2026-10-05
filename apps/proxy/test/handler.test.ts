import { describe, expect, test, vi, afterEach, beforeEach } from 'vitest'
import { env } from 'cloudflare:test'

vi.mock('../src/state_compression', () => ({
  decodeState: vi.fn(() => 'Cookie=dummy'),
}))
import {
  handleRequest,
  validGoogleTakeoutUrl,
  validTestServerURL,
} from '../src/handler'
import {
  azBlobSASUrlToProxyPathname,
  proxyPathnameToAzBlobSASUrl,
} from '../src/azb'

// URL is too long, just move it to another file.
import {
  real_takeout_url,
  real_azb_url,
  file_test_small_url,
  file_test_large_url,
  small_test_string_encoded_url,
  small_test_string_plus_encoded_url,
} from './real_url'

describe('handler utilities', () => {
  test('has functions that can determine if a URL is from takeout, test server, or not', async () => {
    const bad_url = new URL('http://iscaliforniaonfire.com/')
    expect(validGoogleTakeoutUrl(bad_url)).toBeFalsy()
    expect(validGoogleTakeoutUrl(real_takeout_url)).toBeTruthy()
    expect(validTestServerURL(file_test_small_url)).toBeTruthy()
  })
})

describe('handler', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  test('redirect visiting the "front page" to GitHub', async () => {
    const result = await handleRequest(
      new Request(`https://example.com/`, { method: 'GET' }),
    )
    expect(result.status).toEqual(302)
    expect(result.headers.get('Location')).toContain('github.com')
  })
})

describe('azure proxy handler', () => {
  beforeEach(() => {
    // Default mock for Azure tests: return success (201 or 200)
    global.fetch = vi.fn().mockResolvedValue(new Response('', { status: 201 }))
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  test('handles proxying to azure', async () => {
    // This specific test EXPECTS 403, so we override the default mock
    global.fetch = vi.fn().mockResolvedValue(new Response('', { status: 403 }))

    const result = await handleRequest(
      new Request(
        `https://example.com/p-azb/example/container/blob.dat?sp=racwd&st=2000-01-01T00%3A00%3A00Z&se=2000-01-01T00%3A15%3A00Z&spr=https&sv=2020-08-04&sr=c&sig=EXAMPLE`,
        { method: 'GET' },
      ),
    )

    // This should be a rejection, as if we visited the URL with a GET directly to Azure. The signature has long since expired.
    expect(result.status).toEqual(403)
  })

  test('handles proxying a transload request to azure with azure transloading from cloudflare itself', async () => {
    global.fetch = vi.fn().mockResolvedValue(new Response('', { status: 201 })) // Azure PutBlock returns 201 normally

    // Not exactly a clean unit test since it depends on a properly deployed proxy already, but it'll do.
    const AZ_STORAGE_TEST_URL_SEGMENT = (env as any).AZ_STORAGE_TEST_URL_SEGMENT
    if (!AZ_STORAGE_TEST_URL_SEGMENT) {
      throw new Error(
        'AZ_STORAGE_TEST_URL_SEGMENT environment variable is not set',
      )
    }

    const file_source_url = file_test_small_url

    const base_request_url = new URL(
      `https://example.com/p-azb/${AZ_STORAGE_TEST_URL_SEGMENT}`,
    )
    // Change filename of request URL
    base_request_url.pathname = base_request_url.pathname.replace(
      'test.dat',
      'p-azb-transload-direct.dat',
    )

    // Do a single block upload
    const single_block_request = new Request(base_request_url, {
      method: 'PUT',
      headers: {
        'x-ms-blob-type': 'BlockBlob',
        'x-ms-copy-source': file_source_url.toString(),
      },
    })

    const single_block_result = await handleRequest(single_block_request)
    const single_block_ok = await single_block_result.text()
    expect(single_block_ok).toEqual('')
  })

  test('handles proxying a transload request to azure with azure transloading from cloudflare via the proxy', async () => {
    // Not exactly a clean unit test since it depends on a properly deployed proxy already, but it'll do.
    const AZ_STORAGE_TEST_URL_SEGMENT = (env as any).AZ_STORAGE_TEST_URL_SEGMENT
    if (!AZ_STORAGE_TEST_URL_SEGMENT) {
      throw new Error(
        'AZ_STORAGE_TEST_URL_SEGMENT environment variable is not set',
      )
    }

    // Construct the file_source_url that is proxied to the proxy
    // "https://gtr-proxy.677472.xyz/p/" is prepended to the file_test_small_url with file_test_small_url's scheme removed.
    const file_source_url = new URL(
      `https://gtr-proxy.677472.xyz/p/${file_test_large_url
        .toString()
        .replace('https://', '')}`,
    )

    const base_request_url = new URL(
      `https://example.com/p-azb/${AZ_STORAGE_TEST_URL_SEGMENT}`,
    )
    // Change filename of request URL
    base_request_url.pathname = base_request_url.pathname.replace(
      'test.dat',
      'p-azb-transload-via-proxy.dat',
    )

    // Do a single block upload
    const single_block_request = new Request(base_request_url, {
      method: 'PUT',
      headers: {
        'x-ms-blob-type': 'BlockBlob',
        'x-ms-copy-source': file_source_url.toString(),
      },
    })

    const single_block_result = await handleRequest(single_block_request)
    const single_block_ok = await single_block_result.text()
    expect(single_block_ok).toEqual('')
  })

  test('handles proxying a transload request with encoded URL to azure with azure transloading from cloudflare via the proxy', async () => {
    // Not exactly a clean unit test since it depends on a properly deployed proxy already, but it'll do.
    const AZ_STORAGE_TEST_URL_SEGMENT = (env as any).AZ_STORAGE_TEST_URL_SEGMENT
    if (!AZ_STORAGE_TEST_URL_SEGMENT) {
      throw new Error(
        'AZ_STORAGE_TEST_URL_SEGMENT environment variable is not set',
      )
    }

    // Construct the file_source_url that is proxied to the proxy
    // "https://gtr-proxy.677472.xyz/p/" is prepended to the file_test_small_url with file_test_small_url's scheme removed.
    const file_source_url = new URL(
      `https://gtr-proxy.677472.xyz/p/${small_test_string_encoded_url
        .toString()
        .replace('https://', '')}`,
    )

    const base_request_url = new URL(
      `https://example.com/p-azb/${AZ_STORAGE_TEST_URL_SEGMENT}`,
    )
    // Change filename of request URL
    base_request_url.pathname = base_request_url.pathname.replace(
      'test.dat',
      'p-azb-transload-encoded-url-via-proxy.dat',
    )

    // Do a single block upload
    const single_block_request = new Request(base_request_url, {
      method: 'PUT',
      headers: {
        'x-ms-blob-type': 'BlockBlob',
        'x-ms-copy-source': file_source_url.toString(),
      },
    })

    const single_block_result = await handleRequest(single_block_request)
    const single_block_ok = await single_block_result.text()
    expect(single_block_ok).toEqual('')
  })

  test('handles proxying a transload request with plus in the encoded URL to azure with azure transloading from cloudflare via the proxy', async () => {
    // Not exactly a clean unit test since it depends on a properly deployed proxy already, but it'll do.
    const AZ_STORAGE_TEST_URL_SEGMENT = (env as any).AZ_STORAGE_TEST_URL_SEGMENT
    if (!AZ_STORAGE_TEST_URL_SEGMENT) {
      throw new Error(
        'AZ_STORAGE_TEST_URL_SEGMENT environment variable is not set',
      )
    }

    // Construct the file_source_url that is proxied to the proxy
    // "https://gtr-proxy.677472.xyz/p/" is prepended to the file_test_small_url with file_test_small_url's scheme removed.
    const file_source_url = new URL(
      `https://gtr-proxy.677472.xyz/p/${small_test_string_plus_encoded_url
        .toString()
        .replace('https://', '')}`,
    )

    const base_request_url = new URL(
      `https://example.com/p-azb/${AZ_STORAGE_TEST_URL_SEGMENT}`,
    )
    // Change filename of request URL
    base_request_url.pathname = base_request_url.pathname.replace(
      'test.dat',
      'p-azb-transload-plus-encoded-url-via-proxy.dat',
    )

    // Do a single block upload
    const single_block_request = new Request(base_request_url, {
      method: 'PUT',
      headers: {
        'x-ms-blob-type': 'BlockBlob',
        'x-ms-copy-source': file_source_url.toString(),
      },
    })

    const single_block_result = await handleRequest(single_block_request)
    const single_block_ok = await single_block_result.text()
    expect(single_block_ok).toEqual('')
  })
})

describe('takeout proxy handler', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  test('handles proxying to takeout test server on non-existent link', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValue(
        new Response("This path actually doesn't exist.", { status: 404 }),
      )

    const result = await handleRequest(
      new Request(
        `https://example.com/p/put-block-from-url-esc-issue-demo-server-3vngqvvpoq-uc.a.run.app/red/blue.txt?a=dummy`,
        { method: 'GET' },
      ),
    )

    expect(result.status).toEqual(404)
    expect(await result.text()).toEqual("This path actually doesn't exist.")
  })

  test('handles proxying a HEAD request as GET to takeout test server', async () => {
    // Mock the response as if it were a GET request (with body)
    global.fetch = vi.fn().mockResolvedValue(
      new Response('This path exists!', {
        status: 200,
        headers: { 'Content-Length': '17' },
      }),
    )

    const result = await handleRequest(
      new Request(
        `https://example.com/p/put-block-from-url-esc-issue-demo-server-3vngqvvpoq-uc.a.run.app/red/blue.txt?a=dummy`,
        { method: 'HEAD' },
      ),
    )

    expect(result.status).toEqual(200)
    // The fetch mock should have been called with GET
    const fetchCalls = vi.mocked(global.fetch).mock.calls
    expect(fetchCalls.length).toBeGreaterThan(0)
    const [url, init] = fetchCalls[0]
    expect(url.toString()).toContain('https://')
    expect(init).toHaveProperty('method', 'GET')

    // The response body should be null/empty for a HEAD request
    expect(await result.text()).toEqual('')
    expect(result.headers.get('Content-Length')).toEqual('17')
  })

  test('handles proxying to takeout test server on existent link with escaping', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValue(new Response('This path exists!', { status: 200 }))

    const result = await handleRequest(
      new Request(
        `https://example.com/p/put-block-from-url-esc-issue-demo-server-3vngqvvpoq-uc.a.run.app/red%2Fblue.txt?a=dummy`,
        { method: 'GET' },
      ),
    )

    expect(result.status).toEqual(200)
    expect(await result.text()).toEqual('This path exists!')
  })

  test('handles proxying to takeout test server on existent link with extra escaping', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValue(new Response('This path exists!', { status: 200 }))

    const result = await handleRequest(
      new Request(
        `https://example.com/p/put-block-from-url-esc-issue-demo-server-3vngqvvpoq-uc.a.run.app/red%252Fblue.txt?a=dummy`,
        { method: 'GET' },
      ),
    )

    expect(result.status).toEqual(200)
    expect(await result.text()).toEqual('This path exists!')
  })

  test('handles proxying to takeout test server on existent link with extra escaping and dummy appended', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValue(new Response('This path exists!', { status: 200 }))

    const result = await handleRequest(
      new Request(
        `https://example.com/p/put-block-from-url-esc-issue-demo-server-3vngqvvpoq-uc.a.run.app/red%252Fblue.txt/dummy.bin?a=dummy`,
        { method: 'GET' },
      ),
    )

    expect(result.status).toEqual(200)
    expect(await result.text()).toEqual('This path exists!')
  })
})

describe('url-parser', () => {
  test('can proxify the azure blob SAS URL', async () => {
    const path = azBlobSASUrlToProxyPathname(
      real_azb_url,
      'https://example.com',
    )
    expect(path).toEqual(
      new URL(
        '/p-azb/example/container/blob.dat?sp=racwd&st=2000-01-01T00%3A00%3A00Z&se=2000-01-01T00%3A15%3A00Z&spr=https&sv=2020-08-04&sr=c&sig=EXAMPLE',
        'https://example.com',
      ),
    )
    const url = proxyPathnameToAzBlobSASUrl(path)
    expect(url).toEqual(real_azb_url)
  })
})
