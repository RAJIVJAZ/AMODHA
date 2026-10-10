/** Indian mobile numbers are stored as their 10 digits, e.g. "9876543210". */
export function normalizePhone(input: string) {
  const digits = input.replace(/\D/g, "");
  const local = digits.length > 10 ? digits.slice(-10) : digits;
  return /^[6-9]\d{9}$/.test(local) ? local : null;
}
