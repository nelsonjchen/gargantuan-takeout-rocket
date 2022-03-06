import { atob } from 'abab';

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

  const base64Url = url.pathname.substring(3)
  const decoded_url = atob(base64Url)
  if (decoded_url == null) {
    return new Response("invalid base64", {
      status: 500,
    })
  }

  const originalResponse = await fetch(decoded_url, {
    method: 'GET',
    headers: request.headers,
  })
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
