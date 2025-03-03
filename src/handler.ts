import { proxyPathnameToAzBlobSASUrl } from './azb'

export async function handleRequest(request: Request): Promise<Response> {
  const url = new URL(request.url)

  if (url.pathname.startsWith('/p-azb/')) {
    return handleProxyToAzStorageRequest(request)
  }

  if (url.pathname.startsWith('/p/')) {
    // return handleProxyToGoogleTakeoutRequest(request)
    // TODO: Implement this
    return new Response('Not implemented', {
      status: 501,
    })
  }

  if (url.pathname.startsWith('/version/')) {
    return new Response(
      JSON.stringify(
        {
          apiVersion: '2.0.0',
        },
        null,
        2,
      ),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
        },
      },
    )
  }

  // Check if the URL matches the path desired. If not, just redirect to GitHub
  // for project information
  return new Response(null, {
    status: 302,
    headers: {
      Location: 'https://github.com/nelsonjchen/gtr-proxy#readme',
    },
  })
}

export async function handleProxyToAzStorageRequest(request: Request): Promise<Response> {
  const url = new URL(request.url)

  // Only specially handle PUT requests with x-ms-copy-source
  if (request.method === 'PUT' && request.headers.get('x-ms-copy-source')) {
    const sourceUrl = new URL(request.headers.get('x-ms-copy-source')!)

    // Verify if it's a valid Google Takeout or test server URL
    if (!(validGoogleTakeoutUrl(sourceUrl) || validTestServerURL(sourceUrl))) {
      return new Response('Source URL must be a Google Takeout or valid test server URL', {
        status: 403,
      })
    }

    // For Google Takeout URLs, require cookie authentication
    if (validGoogleTakeoutUrl(sourceUrl)) {
      const authHeader = request.headers.get('x-ms-copy-source-authorization')
      if (!authHeader) {
        return new Response('Missing x-ms-copy-source-authorization header for Google Takeout URL', {
          status: 400,
        })
      }

      // Parse cookie data from authorization header
      const [scheme, cookieData] = authHeader.split(' ')
      if (scheme !== 'Gtr2Cookie' || !cookieData) {
        return new Response('Invalid authorization format - expected "Gtr2Cookie <cookie_data>"', {
          status: 400,
        })
      }

      try {
        const azUrl = proxyPathnameToAzBlobSASUrl(url)
        const originalResponse = await fetch(azUrl.toString(), {
          method: request.method,
        })

        return new Response(originalResponse.body, {
          status: originalResponse.status,
          headers: originalResponse.headers,
        })
      } catch (error) {
        return new Response(`Error processing request: ${error instanceof Error ? error.message : String(error)}`, {
          status: 500,
        })
      }
    }
  }

  // Handle regular Azure Storage requests
  try {
    const azUrl = proxyPathnameToAzBlobSASUrl(url)
    const originalResponse = await fetch(azUrl.toString(), {
      method: request.method,
      headers: request.headers,
    })

    return new Response(originalResponse.body, {
      status: originalResponse.status,
      headers: originalResponse.headers,
    })
  } catch {
    return new Response('Invalid URL', {
      status: 500,
    })
  }
}

export function validTestServerURL(url: URL): boolean {
  return (
    // Gargantuan Takeout Rocket 2 Dev Server on Cloud Run
    url.hostname.endsWith('gtr-2-dev-server-262382012399.us-central1.run.app')
  )
}

export function validGoogleTakeoutUrl(url: URL): boolean {
  return (
    // Domain for Takeout downloads
    (
      url.hostname.endsWith('takeout-download.usercontent.google.com') &&
      url.pathname.startsWith('/download/')
    )
  )
}
