import * as pako from 'pako'

export function decodeState(encodedCookies: string): string {
  // 1. Decode the Base64 string to a binary string
  const binaryString = atob(encodedCookies)

  // 2. Convert the binary string to a Uint8Array
  const bytes = new Uint8Array(binaryString.length)
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i)
  }

  // 3. Unzip the bytes using pako
  const unzipped = pako.ungzip(bytes)

  // 4. Convert the unzipped Uint8Array to a regular string
  // TextDecoder handles various character encodings correctly, unlike String.fromCharCode
  const decoder = new TextDecoder('utf-8')

  return decoder.decode(unzipped)
}
