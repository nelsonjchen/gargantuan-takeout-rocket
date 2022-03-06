import { atob } from 'abab'

export async function handleRequest(request: Request): Promise<Response> {
  const url = new URL(request.url)

  // Check if the URL matches the path desired. If not, just redirect to GitHub
  // for project information
  if (url.pathname == '/' || !url.pathname.startsWith('/p/')) {
    return new Response(null, {
      status: 302,
      headers: {
        Location: 'https://github.com/nelsonjchen/gtr-proxy',
      },
    })
  }

  // Decode URL from base64
  const base64strMatches =
    /\/p\/((?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?)/.exec(
      url.pathname,
    )
  if (!base64strMatches) {
    return new Response('could not find base64 url', {
      status: 500,
    })
  }
  const base64Url = base64strMatches[1]
  const decoded_argument = atob(base64Url)
  if (decoded_argument == null) {
    return new Response('invalid base64', {
      status: 500,
    })
  }

  // Check if the URL is a valid URL
  let decoded_url: URL
  try {
    decoded_url = new URL(decoded_argument)
  } catch (_) {
    return new Response('invalid URL', {
      status: 500,
    })
  }

  if (
    !(validGoogleTakeoutUrl(decoded_url) || validTestServerURL(decoded_url))
  ) {
    return new Response('url is not a google takeout or test server url', {
      status: 403,
    })
  }

  const originalResponse = await fetch(decoded_url.toString(), {
    method: request.method,
    headers: request.headers,
  })

  const response = new Response(originalResponse.body, {
    status: originalResponse.status,
    headers: originalResponse.headers,
  })

  return response
}

export function validTestServerURL(url: URL): boolean {
  // https://github.com/nelsonjchen/put-block-from-url-esc-issue-demo-server/
  return url.hostname.endsWith('3vngqvvpoq-uc.a.run.app')
}

export function validGoogleTakeoutUrl(url: URL): boolean {
  return (
    url.hostname.endsWith('apidata.googleusercontent.com') &&
    url.pathname.startsWith('/download/storage/v1/b/dataliberation/o/')
  )
}
