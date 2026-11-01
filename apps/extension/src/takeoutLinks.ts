export function parsePartLabel(
  label: string
): { part: number; total: number } | undefined {
  const match = /^Download(?: again)? part (\d+) of (\d+)$/.exec(label);
  if (!match) return undefined;
  const part = Number(match[1]);
  const total = Number(match[2]);
  return part >= 1 && part <= total && total <= 1000
    ? { part, total }
    : undefined;
}
