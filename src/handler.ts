export async function handleRequest(request: Request): Promise<Response> {
  const resp = await fetch(
    'https://put-block-from-url-esc-issue-demo-server-3vngqvvpoq-uc.a.run.app/red%2Fblue.txt',
  )

  return resp
}
