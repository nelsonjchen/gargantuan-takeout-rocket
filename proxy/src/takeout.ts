export function takeoutUrlToProxyPathname(takeoutUrl: URL, base: string): URL {
  // Validate that it's a Google Takeout URL
  if (!validGoogleTakeoutUrl(takeoutUrl)) {
    throw new Error('Invalid Google Takeout URL')
  }

  // Extract the path and query parameters
  const path = takeoutUrl.pathname.replace('/download/', '')
  const query = takeoutUrl.searchParams.toString()

  // Create the proxified URL
  return new URL(`/p/takeout-download.usercontent.google.com/download/${path}?${query}`, base)
}

export function proxyPathnameToTakeoutUrl(proxyPath: URL): URL {
  // Extract the hostname and path from the proxy URL
  const pathParts = proxyPath.pathname.split('/')

  // The format should be /p/hostname/download/path
  if (pathParts.length < 4 || pathParts[1] !== 'p') {
    throw new Error('Invalid proxy URL format')
  }

  const hostname = pathParts[2]
  const downloadPath = pathParts.slice(3).join('/')
  const query = proxyPath.searchParams.toString()

  // Reconstruct the original Takeout URL
  return new URL(`https://${hostname}/${downloadPath}?${query}`)
}

export function validGoogleTakeoutUrl(url: URL): boolean {
  return (
    // Domain for Takeout downloads
    url.hostname.endsWith('takeout-download.usercontent.google.com') &&
    url.pathname.startsWith('/download/')
  )
}