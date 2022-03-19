interface TransloadOptions {}

export async function transload(
  source: string,
  destination: string,
  options: TransloadOptions = {}
) {
  console.log(`Transloading ${source} to ${destination}`);
}
