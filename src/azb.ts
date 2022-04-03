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
  const blob_name = url_parts.slice(2).join('/')
  if (!blob_name) {
    throw new Error('invalid azblob url')
  }

  const query_params = azb_url.searchParams.toString()

  const proxified_path = new URL(
    `/p-azb/${account_name}/${container_name}/${blob_name}?${query_params}`,
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
  const blob_name = url_parts.slice(4).join('/')
  if (!blob_name) {
    throw new Error('invalid proxy url')
  }
  const query_params = proxy_path.searchParams.toString()
  return new URL(
    `https://${account_name}.blob.core.windows.net/${container_name}/${blob_name}?${query_params}`,
  )
}
