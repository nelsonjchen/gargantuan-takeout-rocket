import { proxyPathnameToAzBlobSASUrl } from './azb'
import { proxyPathnameToTakeoutUrl } from './takeout'

export async function handleRequest(request: Request): Promise<Response> {
  const url = new URL(request.url)

  if (url.pathname.startsWith('/p-azb/')) {
    return handleProxyToAzStorageRequest(request)
  }

  if (url.pathname.startsWith('/p/')) {
    return handleProxyToGoogleTakeoutRequest(request)
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
      Location: 'https://github.com/nelsonjchen/gtr',
    },
  })
}

export async function handleProxyToAzStorageRequest(request: Request): Promise<Response> {
  const url = new URL(request.url)

  // Only specially handle PUT requests with x-ms-copy-source
  if (request.method === 'PUT' && request.headers.get('x-ms-copy-source')) {
    const sourceUrlString = request.headers.get('x-ms-copy-source')!
    const sourceUrl = new URL(sourceUrlString)

    // Check if the source URL is a proxified Google Takeout URL
    const isProxifiedTakeoutUrl = sourceUrl.pathname.startsWith('/p/') &&
      sourceUrl.hostname === request.headers.get('host')

    // If it's a proxified Google Takeout URL, convert it back to the original URL
    let actualSourceUrl = sourceUrl
    if (isProxifiedTakeoutUrl) {
      try {
        actualSourceUrl = proxyPathnameToTakeoutUrl(sourceUrl)
      } catch (error) {
        return new Response(`Invalid proxified Google Takeout URL: ${error instanceof Error ? error.message : String(error)}`, {
          status: 400,
        })
      }
    }

    // Verify if it's a valid Google Takeout or test server URL
    if (!(validGoogleTakeoutUrl(actualSourceUrl) || validTestServerURL(actualSourceUrl))) {
      return new Response('Source URL must be a Google Takeout or valid test server URL', {
        status: 403,
      })
    }

    // For Google Takeout URLs, require cookie authentication
    if (validGoogleTakeoutUrl(actualSourceUrl)) {
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
        // Create a new request to the Google Takeout URL with the cookie data
        const headers = new Headers(request.headers)
        headers.delete('x-ms-copy-source-authorization') // Remove the authorization header

        // Set the x-ms-copy-source header to the actual Google Takeout URL
        headers.set('x-ms-copy-source', actualSourceUrl.toString())

        // Add a special header that the proxy will use to add cookies to the request
        // This will be processed by the proxy to add cookies to the request to Google Takeout
        headers.set('x-ms-copy-source-cookie', cookieData)

        // Convert the proxy URL to the Azure Blob Storage URL
        const azUrl = proxyPathnameToAzBlobSASUrl(url)

        // Make the request to Azure Blob Storage
        const originalResponse = await fetch(azUrl.toString(), {
          method: request.method,
          headers: headers,
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

export async function handleProxyToGoogleTakeoutRequest(request: Request): Promise<Response> {
  const url = new URL(request.url)

  try {
    // Convert the proxy URL to the original Google Takeout URL
    const takeoutUrl = proxyPathnameToTakeoutUrl(url)

    // Verify if it's a valid Google Takeout or test server URL
    if (!(validGoogleTakeoutUrl(takeoutUrl) || validTestServerURL(takeoutUrl))) {
      return new Response('Source URL must be a Google Takeout or valid test server URL', {
        status: 403,
      })
    }

    // For all requests to Google Takeout, we get Authorization
    const authHeader = request.headers.get('Authorization')
    if (!authHeader) {
      return new Response('Missing Authorization header from AZB for Authorization to Cookie map', {
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

    // Create a new request with the cookie data
    const headers = new Headers(request.headers)
    headers.delete('Authorization') // Remove the authorization header
    headers.set('Cookie', cookieData) // Set the cookie header with the cookie data

    // Fetch the content from Google Takeout
    const response = await fetch(takeoutUrl, {
      method: request.method,
      headers: headers,
      body: request.method !== 'GET' && request.method !== 'HEAD' ? await request.blob() : undefined,
    })

    // Return the response
    return new Response(response.body, {
      status: response.status,
      headers: response.headers,
    })
  } catch (error) {
    return new Response(`Error processing request: ${error instanceof Error ? error.message : String(error)}`, {
      status: 500,
    })
  }
}
