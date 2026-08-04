export function hasDifferences(values: unknown[]): boolean {
  return new Set(values.map((value) => JSON.stringify(value))).size > 1;
}
