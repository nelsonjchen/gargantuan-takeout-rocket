import { handleRequest, validGoogleTakeoutUrl } from '../src/handler'

import { btoa } from 'abab'

// URL is too long, just move it to another file.
import real_url from './real_url'

describe('handle', () => {
  test('has a function that can determine if a URL is from takeout or not', async () => {
    const bad_url = new URL('http://iscaliforniaonfire.com/')
    expect(validGoogleTakeoutUrl(bad_url)).toBeFalsy()
    expect(validGoogleTakeoutUrl(real_url)).toBeTruthy()
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
    const encoded_url = btoa(real_url.toString())
    const request_url = `https://example.com/p/${encoded_url}`
    console.debug(request_url)
    const result = await handleRequest(
      new Request(request_url, { method: 'GET' }),
    )

    expect(await result.text()).toEqual(
      expect.stringContaining('Locked Domain'),
    )
    expect(result.status).toEqual(200)
  })

  test('redirect all other urls to somewhere else, like GitHub maybe', async () => {
    const result = await handleRequest(
      new Request(`https://example.com/`, { method: 'GET' }),
    )
    expect(result.status).toEqual(302)
  })
})
