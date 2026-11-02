export function validateTransloadConfig(
  azureSasUrl: string | undefined,
  proxyBaseUrl: string | undefined,
  now = Date.now()
): string | undefined {
  const normalizedAzureSasUrl = azureSasUrl?.trim();
  const normalizedProxyBaseUrl = proxyBaseUrl?.trim();

  if (!normalizedAzureSasUrl) {
    return "Azure SAS URL is required";
  }

  let parsedAzureUrl: URL;
  try {
    parsedAzureUrl = new URL(normalizedAzureSasUrl);
  } catch (err) {
    return "Azure SAS URL is invalid";
  }

  if (parsedAzureUrl.protocol !== "https:") {
    return "Azure SAS URL must use https";
  }

  if (!parsedAzureUrl.pathname || parsedAzureUrl.pathname === "/") {
    return "Azure SAS URL must include a container path";
  }

  if (!parsedAzureUrl.searchParams.has("sig")) {
    return "Azure SAS URL must include a SAS signature";
  }
  const expiry = parsedAzureUrl.searchParams.get("se");
  if (expiry) {
    const expiresAt = Date.parse(expiry);
    if (!Number.isFinite(expiresAt)) return "Azure SAS expiry date is invalid";
    if (expiresAt <= now)
      return "Azure access has expired. Replace the SAS URL in Settings.";
  }

  if (normalizedProxyBaseUrl) {
    try {
      const parsedProxyUrl = new URL(normalizedProxyBaseUrl);
      if (!["http:", "https:"].includes(parsedProxyUrl.protocol)) {
        return "GTR proxy URL must use http or https";
      }
    } catch (err) {
      return "GTR proxy URL is invalid";
    }
  }

  return undefined;
}
