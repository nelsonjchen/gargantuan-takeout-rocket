import { proxyPathnameToAzBlobSASUrl } from './azb'
import { serializeError } from 'serialize-error';


export async function handleRequest(request: Request): Promise<Response> {
  const url = new URL(request.url)

  if (url.pathname.startsWith('/t-azb/')) {
    return handleTransloadAzBlobRequest(request)
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


export async function handleTransloadAzBlobRequest(request: Request): Promise<Response> {
  // Check for a 'x-gtr-copy-source' header
  const copySource = request.headers.get('x-gtr-copy-source')
  if (!copySource) {
    return new Response('missing x-gtr-copy-source header', {
      status: 400,
    })
  };
  // x-gtr-copy-source is not a valid header for upstream. Strip it.
  const strippedHeaders = new Headers(request.headers)
  strippedHeaders.delete('x-gtr-copy-source')

  // Get a readable stream of the request body from the url of x-gtr-copy-source
  const copySourceUrl = new URL(copySource)
  // Make sure hostname is a valid test server or google URL
  if (!validGoogleTakeoutUrl(copySourceUrl) && !validTestServerURL(copySourceUrl)) {
    return new Response('invalid x-gtr-copy-source header: not takeout url or test server url', {
      status: 403,
    })
  }
  const copySourceResponse = await fetch(copySourceUrl.toString(), {
    method: 'GET',
  })
  // If the original request has some sort of error, return that error
  if (!copySourceResponse.ok) {
    return new Response(copySourceResponse.body, {
      status: copySourceResponse.status,
      headers: copySourceResponse.headers,
    })
  }
  // Get a readable stream of the original 
  const body = copySourceResponse.body
  // Return an error if body isn't a ReadableStream
  if (!(body instanceof ReadableStream)) {
    return new Response('body is not a ReadableStream', {
      status: 500,
    })
  }
  strippedHeaders.append('Content-Length', copySourceResponse.headers.get('Content-Length') || '0')


  const url = new URL(request.url)
  try {
    const azUrl = proxyPathnameToAzBlobSASUrl(url)

    const originalResponse = await fetch(azUrl.toString(), {
      method: request.method,
      headers: strippedHeaders,
      body
    })

    const response = new Response(originalResponse.body, {
      status: originalResponse.status,
      headers: originalResponse.headers,
    })

    return response
  } catch (e) {
    if (e instanceof Error) {
      const error = serializeError(e)
      return new Response(JSON.stringify(error),
        {
          status: 500,
        })
    }
    return new Response('unknown error', {
      status: 500,
    })
  }
}

export function validTestServerURL(url: URL): boolean {
  // https://github.com/nelsonjchen/put-block-from-url-esc-issue-demo-server/
  return (
    url.hostname.endsWith('gtr-test.677472.xyz') ||
    url.hostname.endsWith('3vngqvvpoq-uc.a.run.app') ||
    url.hostname.endsWith('releases.ubuntu.com') ||
    url.hostname == 'mirrors.advancedhosters.com'
  )
}

export function validGoogleTakeoutUrl(url: URL): boolean {
  return (
    url.hostname.endsWith('apidata.googleusercontent.com') &&
    (url.pathname.startsWith('/download/storage/v1/b/dataliberation/o/') ||
      url.pathname.startsWith('/download/storage/v1/b/takeout'))
  )
}
