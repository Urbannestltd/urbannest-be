/** Generates a random numeric code of the given length (default 6 digits), zero-padded. */
export function generateNumericCode(length = 6): string {
  const max = Math.pow(10, length);
  return Math.floor(Math.random() * max)
    .toString()
    .padStart(length, "0");
}
