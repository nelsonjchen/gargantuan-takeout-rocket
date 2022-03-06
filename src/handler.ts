import { decode } from '../node_modules/@cfworker/base64url/src/decode'

export async function handleRequest(request: Request): Promise<Response> {
  const url = new URL(request.url)

  // Check if the URL matches the path desired. If not, just redirect to GitHub
  if (url.pathname == '/') {
    return new Response(null, {
      status: 302,
      headers: {
        Location: 'https://github.com',
      },
    })
  }

  // Decode URL from base64

  const decoded_url = decode(url.pathname.substring(2))

  const originalResponse = await fetch(decoded_url)
  const response = new Response(originalResponse.body, {
    status: 200,
    headers: originalResponse.headers,
  })
  // response.headers.append(
  //   'Content-Disposition',
  //   'attachment; filename="1GB.bin"',
  // )
  return response
}
