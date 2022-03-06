import { atob } from 'abab'

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
  const decoded_argument = atob(base64Url)
  if (decoded_argument == null) {
    return new Response('invalid base64', {
      status: 500,
    })
  }

  // Check if the URL is a valid URL
  try {
    const url = new URL(decoded_argument)
  } catch (_) {
    return new Response('invalid URL', {
      status: 500,
    })
  }

  const originalResponse = await fetch(decoded_argument, {
    method: 'request.method',
    headers: request.headers,
  })

  const response = new Response(originalResponse.body, {
    status: 200,
    headers: originalResponse.headers,
  })
  
  return response
}
