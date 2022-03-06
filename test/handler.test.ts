import { handleRequest } from '../src/handler'

import { btoa } from 'abab'

describe('handle', () => {
  beforeEach(() => {
    jest.resetModules()
  })

  test('handle GET', async () => {
    const encoded_url = btoa('http://iscaliforniaonfire.com/')
    const request_url = `https://example.com/p/${encoded_url}`
    console.debug(request_url)
    const result = await handleRequest(
      new Request(request_url, { method: 'GET' }),
    )
    // California is always on fire.
    expect(await result.text()).toEqual(expect.stringContaining('Yes'))
    expect(result.status).toEqual(200)
  })

  test('handle root get', async () => {
    const result = await handleRequest(
      new Request(`https://example.com/`, { method: 'GET' }),
    )
    expect(result.status).toEqual(302)
  })
})
