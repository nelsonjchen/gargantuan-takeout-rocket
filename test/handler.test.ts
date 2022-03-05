import { handleRequest } from '../src/handler'
import makeServiceWorkerEnv from 'service-worker-mock'

import { encode } from '../node_modules/@cfworker/base64url/src'

declare var global: any

describe('handle', () => {
  beforeEach(() => {
    Object.assign(global, makeServiceWorkerEnv())
    jest.resetModules()
  })

  test('handle GET', async () => {
    const encoded_url = encode('http://icanhazip.com/')
    const result = await handleRequest(
      new Request(`/p/${encoded_url}`, { method: 'GET' }),
    )
    expect(result.status).toEqual(200)
    const text = await result.text()
    expect(text).toEqual('request method: GET')
  })

  test('handle root get', async () => {
    const result = await handleRequest(new Request(`/`, { method: 'GET' }))
    expect(result.status).toEqual(302)
  })
})
