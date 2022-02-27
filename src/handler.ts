export async function handleRequest(request: Request): Promise<Response> {
  const originalResponse = await fetch('https://speed.hetzner.de/1GB.bin')
  let response = new Response(originalResponse.body, {
    status: 200,
    headers: originalResponse.headers,
  });
  response.headers.append('Content-Disposition', 'attachment; filename="1GB.bin"')
  return response
}
