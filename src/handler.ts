export async function handleRequest(request: Request): Promise<Response> {
  const resp = await fetch('https://speed.hetzner.de/1GB.bin')

  return resp
}
