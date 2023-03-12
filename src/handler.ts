import {proxyPathnameToAzBlobSASUrl} from './azb'
import {serializeError} from 'serialize-error';


export async function handleRequest(request: Request): Promise<Response> {
  const url = new URL(request.url)

  if (url.pathname.startsWith('/p/')) {
    return handleProxyToGoogleTakeoutRequest(request)
  }

  if (url.pathname.startsWith('/p-azb/')) {
    return handleProxyToAzStorageRequest(request)
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

export async function handleProxyToGoogleTakeoutRequest(
  request: Request,
): Promise<Response> {
  // Extracted URL is after the /p/ in the path with https:// prepended to it
  const original_url_segment = `https://${request.url.substring(request.url.indexOf('/p/') + 3)}`

  // Strip off "/dummy.bin" from the end of the URL if it is there.
  // This allows testing with azcopy which requires a nice filename at the end.
  const original_url_segment_stripped = original_url_segment.replace(/\/dummy.bin$/, '')

  // Replace %25 with % to get the original URL
  const original_url_segment_stripped_processed = original_url_segment_stripped.replace(/%25/g, '%')

  let extracted_url: URL
  try {
    // Replace %25 with % to get the original URL
    extracted_url = new URL(original_url_segment_stripped_processed)
  } catch (_) {
    return new Response('invalid URL', {
      status: 500,
    })
  }

  if (
    !(validGoogleTakeoutUrl(extracted_url) || validTestServerURL(extracted_url))
  ) {
    return new Response(
      'encoded url was not a google takeout or test server url',
      {
        status: 403,
      },
    )
  }

  // Pass the original URL processed. A URL object will malform the `%2B` to `+`.
  const originalResponse = await fetch(original_url_segment_stripped_processed, {
    method: request.method,
    headers: request.headers,
  })

  const response = new Response(originalResponse.body, {
    status: originalResponse.status,
    headers: originalResponse.headers,
  })

  console.log(response)

  return response
}

export async function handleProxyToAzStorageRequest(request: Request): Promise<Response> {
  const url = new URL(request.url)
  try {
    const azUrl = proxyPathnameToAzBlobSASUrl(url)
    const originalResponse = await fetch(azUrl.toString(), {
      method: request.method,
      headers: request.headers,
    })

    const response = new Response(originalResponse.body, {
      status: originalResponse.status,
      headers: originalResponse.headers,
    })
    console.log(`response: ${JSON.stringify(response)}`)

    return response
  } catch {
    return new Response('invalid URL', {
      status: 500,
    })
  }
}

export function validTestServerURL(url: URL): boolean {
  return (
    // Cloudflare Bucket test server with unlimited download bandwidth
    url.hostname.endsWith('gtr-test.677472.xyz') ||
    // https://github.com/nelsonjchen/put-block-from-url-esc-issue-demo-server/
    url.hostname.endsWith('3vngqvvpoq-uc.a.run.app')
  )
}

export function validGoogleTakeoutUrl(url: URL): boolean {
  return (
    url.hostname.endsWith('apidata.googleusercontent.com') &&
    (url.pathname.startsWith('/download/storage/v1/b/dataliberation/o/') ||
      url.pathname.startsWith('/download/storage/v1/b/takeout'))
  )
}
