import {
  handleRequest,
  handleProxyToGoogleTakeoutRequest,
  validGoogleTakeoutUrl,
  validTestServerURL,
} from '../src/handler'
import {
  azBlobSASUrlToProxyPathname,
  proxyPathnameToAzBlobSASUrl,
} from '../src/azb'
import {
  takeoutUrlToProxyPathname,
  proxyPathnameToTakeoutUrl,
} from '../src/takeout'

// URL is too long, just move it to another file.
import {
  real_takeout_url,
  real_azb_url,
  file_test_cookie_url,
  file_test_gtr2cookie_auth_url,
} from './real_url'

describe('handler utilities', () => {
  test('has functions that can determine if a URL is from takeout, test server, or not', async () => {
    const bad_url = new URL('http://iscaliforniaonfire.com/')
    expect(validGoogleTakeoutUrl(bad_url)).toBeFalsy()
    expect(validGoogleTakeoutUrl(real_takeout_url)).toBeTruthy()
    expect(validTestServerURL(file_test_cookie_url)).toBeTruthy()
  })
})

describe('handler', () => {
  test('redirect visiting the "front page" to GitHub', async () => {
    const result = await handleRequest(
      new Request(`https://example.com/`, { method: 'GET' }),
    )
    expect(result.status).toEqual(302)
    expect(result.headers.get('Location')).toContain('github.com')
  })

  test('returns version information', async () => {
    const result = await handleRequest(
      new Request(`https://example.com/version/`, { method: 'GET' }),
    )
    expect(result.status).toEqual(200)
    const data: {
      apiVersion: string
    } = await result.json()
    expect(data.apiVersion).toBe('2.0.0')
  })
})

describe('test server sanity check', () => {
  test('sanity check the test server URL to see if it is a valid URL', async () => {
    const testServerUrl = new URL(file_test_cookie_url)
    expect(validTestServerURL(testServerUrl)).toBeTruthy()

    // Check if you can do a fetch to the test server URL, and not get a redirect
    const noAuthResponse = await fetch(testServerUrl)
    // Check if the response is a redirect
    expect(noAuthResponse.redirected).toBeTruthy()
    // Now try it with a cookie to authenticate
    const cookieData = 'testcookie=valid;'
    const requestWithCookie = new Request(testServerUrl, {
      method: 'GET',
      headers: {
        'Cookie': cookieData,
      }
    })
    const responseWithCookie = await fetch(requestWithCookie)
    expect(responseWithCookie.status).toBe(200)
    // Make sure it is not a redirect-
    expect(responseWithCookie.redirected).toBeFalsy()
    // Check the response body for 0-9
    const responseBody = await responseWithCookie.text()
    expect(responseBody).toMatch(/[0-9]/)
  })
})

describe('azure proxy handler', () => {
  test('sanity check azb to make sure it can pass through Gtr2Cookie scheme', async () => {
    const AZ_STORAGE_TEST_URL = process.env.AZ_STORAGE_TEST_URL
    if (!AZ_STORAGE_TEST_URL) {
      throw new Error('AZ_STORAGE_TEST_URL_BASE environment variable is not set')
    }
    const cookieData = 'testcookie=valid'
    // Add the filename to AZ_STORAGE_TEST_URL
    const filename = 'sanity_test.txt'

    // Create URL object from the base URL
    const azUrl = new URL(AZ_STORAGE_TEST_URL)

    // Add filename to the path portion before query parameters
    // Extract the path without the leading slash, add filename, and set it back
    const pathParts = azUrl.pathname.split('/')
    // If the last part is empty (URL ended with /), replace it with filename
    // Otherwise add filename as a new part
    if (pathParts[pathParts.length - 1] === '') {
      pathParts[pathParts.length - 1] = filename
    } else {
      pathParts.push(filename)
    }
    azUrl.pathname = pathParts.join('/')

    const base_request_url = azBlobSASUrlToProxyPathname(
      azUrl,
      'https://example.com',
    )

    const request = new Request(base_request_url, {
      method: 'PUT',
      headers: {
        'x-ms-blob-type': 'BlockBlob',
        'x-ms-copy-source': file_test_gtr2cookie_auth_url.toString(),
        'x-ms-copy-source-authorization': `Gtr2Cookie ${cookieData}`,
      }
    })

    const result = await handleRequest(request)
    // This logs response status and body for debugging
    const responseText = await result.clone().text();
    console.log(`Response status: ${result.status}`);
    console.log(`Response body: ${responseText}`);

    expect(result.status).toBe(201);
  })

  test('rejects missing cookie authentication', async () => {
    const AZ_STORAGE_TEST_URL = process.env.AZ_STORAGE_TEST_URL
    if (!AZ_STORAGE_TEST_URL) {
      throw new Error('AZ_STORAGE_TEST_URL_BASE environment variable is not set')
    }

    const filename = 'sanity_test.txt'
    const azUrl = new URL(AZ_STORAGE_TEST_URL)
    const pathParts = azUrl.pathname.split('/')
    if (pathParts[pathParts.length - 1] === '') {
      pathParts[pathParts.length - 1] = filename
    } else {
      pathParts.push(filename)
    }
    azUrl.pathname = pathParts.join('/')
    const base_request_url = azBlobSASUrlToProxyPathname(
      azUrl,
      'https://example.com',
    )

    const request = new Request(base_request_url, {
      method: 'PUT',
      headers: {
        'x-ms-blob-type': 'BlockBlob',
        'x-ms-copy-source': real_takeout_url.toString(),
      }
    })

    const result = await handleRequest(request)
    expect(result.status).toBe(400)
    const error = await result.text()
    expect(error).toContain('Missing x-ms-copy-source-authorization header')
  })

  test('rejects invalid cookie authentication format', async () => {
    const AZ_STORAGE_TEST_URL = process.env.AZ_STORAGE_TEST_URL
    if (!AZ_STORAGE_TEST_URL) {
      throw new Error('AZ_STORAGE_TEST_URL_BASE environment variable is not set')
    }

    const filename = 'sanity_test.txt'
    const azUrl = new URL(AZ_STORAGE_TEST_URL)
    const pathParts = azUrl.pathname.split('/')
    if (pathParts[pathParts.length - 1] === '') {
      pathParts[pathParts.length - 1] = filename
    } else {
      pathParts.push(filename)
    }
    azUrl.pathname = pathParts.join('/')
    const base_request_url = azBlobSASUrlToProxyPathname(
      azUrl,
      'https://example.com',
    )

    base_request_url.pathname = base_request_url.pathname.replace(
      'test.dat',
      'cookie-auth-invalid.dat',
    )

    const request = new Request(base_request_url, {
      method: 'PUT',
      headers: {
        'x-ms-blob-type': 'BlockBlob',
        'x-ms-copy-source': real_takeout_url.toString(),
        'x-ms-copy-source-authorization': 'InvalidFormat cookie=data',
      }
    })

    const result = await handleRequest(request)
    expect(result.status).toBe(400)
    const error = await result.text()
    expect(error).toContain('Invalid authorization format')
  })

  test('handles proxying to azure', async () => {
    const result = await handleRequest(
      new Request(
        `https://example.com/p-azb/urlcopytest/some-container/some_file.dat?sp=racwd&st=2022-04-03T02%3A09%3A13Z&se=2022-04-03T02%3A20%3A13Z&spr=https&sv=2020-08-04&sr=c&sig=u72iEGi5SLkPg8B7QVI5HXfHSnr3MOse%2FzWzhaYdbbU%3D`,
        { method: 'GET' },
      ),
    )
    expect(result.status).toEqual(403)
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
        '/p-azb/urlcopytest/some-container/some_file.dat?sp=racwd&st=2022-04-03T02%3A09%3A13Z&se=2022-04-03T02%3A20%3A13Z&spr=https&sv=2020-08-04&sr=c&sig=u72iEGi5SLkPg8B7QVI5HXfHSnr3MOse%2FzWzhaYdbbU%3D',
        'https://example.com',
      ),
    )
    const url = proxyPathnameToAzBlobSASUrl(path)
    expect(url).toEqual(real_azb_url)
  })

  test('can proxify the Google Takeout URL', async () => {
    const path = takeoutUrlToProxyPathname(
      real_takeout_url,
      'https://example.com',
    )
    expect(path).toEqual(
      new URL(
        '/p/takeout-download.usercontent.google.com/download/takeout-20241222T093656Z-002.zip?j=3647d71e-7af8-4aa7-9dc1-1f682197329a&i=1&user=798667665537&authuser=0',
        'https://example.com',
      ),
    )
    const url = proxyPathnameToTakeoutUrl(path)
    expect(url).toEqual(real_takeout_url)
  })
})

describe('google takeout proxy handler', () => {
  test('handles cookie authentication for Google Takeout', async () => {
    // Mock fetch to avoid actual network requests
    global.fetch = jest.fn().mockImplementation(() =>
      Promise.resolve({
        status: 200,
        headers: new Headers(),
        body: null,
      })
    );

    const cookieData = 'SOCS=test_cookie;SID=test_sid;HSID=test_hsid'
    const proxyUrl = takeoutUrlToProxyPathname(
      real_takeout_url,
      'https://example.com',
    )

    const request = new Request(proxyUrl, {
      method: 'GET',
      headers: {
        'x-ms-copy-source-authorization': `Gtr2Cookie ${cookieData}`,
      }
    })

    const result = await handleProxyToGoogleTakeoutRequest(request)
    expect(result.status).toBe(200)

    // Verify that fetch was called with the correct URL and headers
    expect(fetch).toHaveBeenCalledWith(
      real_takeout_url.toString(),
      expect.objectContaining({
        method: 'GET',
        headers: expect.any(Headers),
      })
    )

    // Check that the Cookie header was set correctly
    const fetchCall = (fetch as jest.Mock).mock.calls[0];
    const fetchOptions = fetchCall[1];
    expect(fetchOptions.headers.get('Cookie')).toBe(cookieData);

    // Restore the original fetch
    (global.fetch as jest.Mock).mockRestore();
  })

  test('rejects missing cookie authentication for Google Takeout', async () => {
    const proxyUrl = takeoutUrlToProxyPathname(
      real_takeout_url,
      'https://example.com',
    )

    const request = new Request(proxyUrl, {
      method: 'GET',
    })

    const result = await handleProxyToGoogleTakeoutRequest(request)
    expect(result.status).toBe(400)
    const error = await result.text()
    expect(error).toContain('Missing x-ms-copy-source-authorization header')
  })

  test('rejects invalid cookie authentication format for Google Takeout', async () => {
    const proxyUrl = takeoutUrlToProxyPathname(
      real_takeout_url,
      'https://example.com',
    )

    const request = new Request(proxyUrl, {
      method: 'GET',
      headers: {
        'x-ms-copy-source-authorization': 'InvalidFormat cookie=data',
      }
    })

    const result = await handleProxyToGoogleTakeoutRequest(request)
    expect(result.status).toBe(400)
    const error = await result.text()
    expect(error).toContain('Invalid authorization format')
  })
})
