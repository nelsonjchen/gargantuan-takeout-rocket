import pako from 'pako'
import { decodeState } from '../src/state_compression'
import { describe, expect, it } from 'vitest'

describe('State Compression', () => {
  it('test encoded cookies can be decoded by decodeState', () => {
    const cookies = 'A=123; B=456'
    const compressedData = pako.gzip(cookies)
    const b64encoded_string = btoa(
      String.fromCharCode(...new Uint8Array(compressedData)),
    )

    const decodedState = decodeState(b64encoded_string)
    expect(decodedState).toBe(cookies)
  })
})
