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
  test('redirect visiting the "front page" to GitHub', async () => {
    const result = await handleRequest(
      new Request(`https://example.com/`, {method: 'GET'}),
    )
    expect(result.status).toEqual(302)
    expect(result.headers.get('Location')).toContain('github.com')
  })

  test('returns version information', async () => {
    const result = await handleRequest(
      new Request(`https://example.com/version/`, {method: 'GET'}),
    )
    expect(result.status).toEqual(200)
    const data: {
      apiVersion: string
    } = await result.json()
    expect(data.apiVersion).toBe('2.0.0')
  })
})

describe('azure proxy handler', () => {
  test('handles cookie authentication for Google Takeout downloads', async () => {
    const AZ_STORAGE_TEST_URL_SEGMENT = process.env.AZ_STORAGE_TEST_URL_SEGMENT
    if (!AZ_STORAGE_TEST_URL_SEGMENT) {
      throw new Error('AZ_STORAGE_TEST_URL_SEGMENT environment variable is not set')
    }

    const cookieData = 'SOCS=test_cookie;SID=test_sid;HSID=test_hsid'
    const base_request_url = new URL(
      `https://example.com/p-azb/${AZ_STORAGE_TEST_URL_SEGMENT}`,
    )

    const request = new Request(base_request_url, {
      method: 'PUT',
      headers: {
        'x-ms-blob-type': 'BlockBlob',
        'x-ms-copy-source': real_takeout_url.toString(),
        'x-ms-copy-source-authorization': `Gtr2Cookie ${cookieData}`,
      }
    })

    const result = await handleRequest(request)
    expect(result.status).toBe(201)
  })

  test('rejects missing cookie authentication', async () => {
    const AZ_STORAGE_TEST_URL_SEGMENT = process.env.AZ_STORAGE_TEST_URL_SEGMENT
    if (!AZ_STORAGE_TEST_URL_SEGMENT) {
      throw new Error('AZ_STORAGE_TEST_URL_SEGMENT environment variable is not set')
    }

    const base_request_url = new URL(
      `https://example.com/p-azb/${AZ_STORAGE_TEST_URL_SEGMENT}`,
    )
    base_request_url.pathname = base_request_url.pathname.replace(
      'test.dat',
      'cookie-auth-missing.dat',
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
    const AZ_STORAGE_TEST_URL_SEGMENT = process.env.AZ_STORAGE_TEST_URL_SEGMENT
    if (!AZ_STORAGE_TEST_URL_SEGMENT) {
      throw new Error('AZ_STORAGE_TEST_URL_SEGMENT environment variable is not set')
    }

    const base_request_url = new URL(
      `https://example.com/p-azb/${AZ_STORAGE_TEST_URL_SEGMENT}`,
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
        {method: 'GET'},
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
})
