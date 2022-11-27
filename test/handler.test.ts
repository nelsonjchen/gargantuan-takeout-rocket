import { handleRequest, validGoogleTakeoutUrl, validTestServerURL } from '../src/handler'
import {
  azBlobSASUrlToProxyPathname,
  proxyPathnameToAzBlobSASUrl,
} from '../src/azb'

// URL is too long, just move it to another file.
import { real_takeout_url, real_azb_url, file_test_200mb_url } from './real_url'

describe('handle', () => {
  test('has a function that can determine if a URL is from takeout, test server, or not', async () => {
    const bad_url = new URL('http://iscaliforniaonfire.com/')
    expect(validGoogleTakeoutUrl(bad_url)).toBeFalsy()
    expect(validGoogleTakeoutUrl(real_takeout_url)).toBeTruthy()
    expect(validTestServerURL(file_test_200mb_url)).toBeTruthy()
  })

  test('handle the file test URL', async () => {
    const AZ_STORAGE_TEST_URL_SEGMENT = process.env.AZ_STORAGE_TEST_URL_SEGMENT
    if (!AZ_STORAGE_TEST_URL_SEGMENT) {
      throw new Error('AZ_STORAGE_TEST_URL_SEGMENT environment variable is not set')
    }

    const file_source_url = file_test_200mb_url

    const request_url = `https://example.com/t-azb/${AZ_STORAGE_TEST_URL_SEGMENT}`

    const request = new Request(request_url, {
      method: 'PUT',
      headers: {
        'x-ms-blob-type': 'BlockBlob',
        'x-gtr-copy-source': file_source_url.toString(),
      },
    })

    const result = await handleRequest(
      request,
    )
    const ok = await result.text();
    expect(ok).toEqual('')

    expect(result.status).toEqual(201)
  }, 60000)

  test('redirect all other urls to somewhere else, like GitHub maybe', async () => {
    const result = await handleRequest(
      new Request(`https://example.com/`, { method: 'GET' }),
    )
    expect(result.status).toEqual(302)
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
        '/t-azb/urlcopytest/some-container/some_file.dat?sp=racwd&st=2022-04-03T02%3A09%3A13Z&se=2022-04-03T02%3A20%3A13Z&spr=https&sv=2020-08-04&sr=c&sig=u72iEGi5SLkPg8B7QVI5HXfHSnr3MOse%2FzWzhaYdbbU%3D',
        'https://example.com',
      ),
    )
    const url = proxyPathnameToAzBlobSASUrl(path)
    expect(url).toEqual(real_azb_url)
  })
})
