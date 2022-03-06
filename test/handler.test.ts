import { handleRequest } from '../src/handler'

import { btoa } from 'abab'

declare var global: any

describe('handle', () => {
  beforeEach(() => {
    jest.resetModules()
  })

  test('handle GET', async () => {
    const encoded_url = btoa('http://icanhazip.com/')
    const result = await handleRequest(
      new Request(`https://example.com/p/${encoded_url}`, { method: 'GET' }),
    )
    expect(await result.text()).toBe('test')
    expect(result.status).toEqual(200)
    const text = await result.text()
    expect(text).toEqual('request method: GET')
  })

  test('handle root get', async () => {
    const result = await handleRequest(new Request(`https://example.com/`, { method: 'GET' }))
    expect(result.status).toEqual(302)
  })
})
