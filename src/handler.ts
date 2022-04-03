import { atob } from 'abab'

export async function handleRequest(request: Request): Promise<Response> {
  const url = new URL(request.url)

  if (url.pathname.startsWith('/p/')) {
    return handleTakeoutRequest(request)
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

export async function handleTakeoutRequest(
  request: Request,
): Promise<Response> {
  const url = new URL(request.url)

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
  return (
    url.hostname.endsWith('3vngqvvpoq-uc.a.run.app') ||
    url.hostname.endsWith('releases.ubuntu.com') ||
    url.hostname == 'mirrors.advancedhosters.com'
  )
}

export function validGoogleTakeoutUrl(url: URL): boolean {
  return (
    url.hostname.endsWith('apidata.googleusercontent.com') &&
    url.pathname.startsWith('/download/storage/v1/b/dataliberation/o/')
  )
}

export function azBlobSASUrlToProxyPathname(azb_url: URL, base: string): URL {
  const hostname_parts = azb_url.hostname.split('.')
  const url_parts = azb_url.pathname.split('/')
  const account_name = hostname_parts[0]
  if (!account_name) {
    throw new Error('invalid azblob url')
  }
  const container_name = url_parts[1]
  if (!container_name) {
    throw new Error('invalid azblob url')
  }
  const query_params = azb_url.searchParams.toString()

  const proxified_path = new URL(
    `/p-azb/${account_name}/${container_name}?${query_params}`,
    base,
  )
  return proxified_path
}

export function proxyPathnameToAzBlobSASUrl(proxy_path: URL): URL {
  const url_parts = proxy_path.pathname.split('/')
  const account_name = url_parts[2]
  if (!account_name) {
    throw new Error('invalid proxy url')
  }
  const container_name = url_parts[3]
  if (!container_name) {
    throw new Error('invalid proxy url')
  }
  const query_params = proxy_path.searchParams.toString()
  return new URL(
    `https://${account_name}.blob.core.windows.net/${container_name}?${query_params}`,
  )
}
