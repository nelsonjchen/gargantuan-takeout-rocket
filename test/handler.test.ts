import { handleRequest, validGoogleTakeoutUrl } from '../src/handler'

import { btoa } from 'abab'

// URL is too long, just move it to another file.
import { real_takeout_url, real_azb_url }  from './real_url'

describe('handle', () => {
  test('has a function that can determine if a URL is from takeout or not', async () => {
    const bad_url = new URL('http://iscaliforniaonfire.com/')
    expect(validGoogleTakeoutUrl(bad_url)).toBeFalsy()
    expect(validGoogleTakeoutUrl(real_takeout_url)).toBeTruthy()
  })

  test('does not handle non-takeout URL', async () => {
    const encoded_url = btoa('http://iscaliforniaonfire.com/')
    const request_url = `https://example.com/p/${encoded_url}`
    console.debug(request_url)
    const result = await handleRequest(
      new Request(request_url, { method: 'GET' }),
    )

    expect(result.status).toEqual(403)
  })

  test('handle a real google takeout url that is expired', async () => {
    const encoded_url = btoa(real_takeout_url.toString())
    const request_url = `https://example.com/p/${encoded_url}`
    console.debug(request_url)
    const result = await handleRequest(
      new Request(request_url, { method: 'GET' }),
    )

    expect(await result.text()).toEqual(
      expect.stringContaining('Locked Domain'),
    )
    expect(result.status).toEqual(401)
  })

  test('handle a real google takeout url that is expired and has bs at the end', async () => {
    const encoded_url = btoa(real_takeout_url.toString())
    // Seen with calls by Azure
    const request_url = `https://example.com/p/${encoded_url}?timeout=901`
    console.debug(request_url)
    const result = await handleRequest(
      new Request(request_url, { method: 'GET' }),
    )

    expect(await result.text()).toEqual(
      expect.stringContaining('Locked Domain'),
    )
    expect(result.status).toEqual(401)
  })

  test('redirect all other urls to somewhere else, like GitHub maybe', async () => {
    const result = await handleRequest(
      new Request(`https://example.com/`, { method: 'GET' }),
    )
    expect(result.status).toEqual(302)
  })

  test('handles urls to somewhere else, like GitHub maybe', async () => {
    const result = await handleRequest(
      new Request(`https://example.com/azbp/urlcopytest/some-container?sp=r&st=2022-04-02T18:23:20Z&se=2022-04-03T06:24:20Z&spr=https&sv=2020-08-04&sr=c&sig=KNz4a1xHnmfi7afzrnkBFtls52YIZ0xtzn1Y7udqXBw%3D`, { method: 'GET' }),
    )

    // This should be a rejection, as if we visited the URL with a GET directly.
    expect(result.status).toEqual(403)
  })
})

describe('url-parser', () => {
  test('can proxify the azure blob SAS URL', async () => {
    const proxify_url = proxifyAzureBlobSASUrl(real_azb_url, 'https://example.com')
    expect(proxify_url).toEqual(
      new URL("https://urlcopytest.blob.core.windows.net/some-container?sp=racwd&st=2022-04-03T02:09:13Z&se=2022-04-03T02:20:13Z&spr=https&sv=2020-08-04&sr=c&sig=u72iEGi5SLkPg8B7QVI5HXfHSnr3MOse%2FzWzhaYdbbU%3D")
    )
  })
})
