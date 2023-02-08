export function azBlobSASUrlToProxyPathname(azb_url: URL, base: string): URL {
  const hostname_parts = azb_url.hostname.split(".");
  const url_parts = azb_url.pathname.split("/");
  const account_name = hostname_parts[0];
  if (!account_name) {
    throw new Error("invalid azblob url (no account name)");
  }
  const container_name = url_parts[1];
  if (!container_name) {
    throw new Error("invalid azblob url (no container name)");
  }
  const blob_name = url_parts.slice(2).join("/");
  if (!blob_name) {
    throw new Error("invalid azblob url (no blob name)");
  }

  const query_params = azb_url.searchParams.toString();

  const proxified_path = new URL(
    `/p-azb/${account_name}/${container_name}/${blob_name}?${query_params}`,
    base
  );

  return proxified_path;
}
