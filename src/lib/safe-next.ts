// Where to send someone after signing in (`?next=`). Only a path on this site is allowed: browsers treat
// "/\evil.com" or a "/" followed by a tab and "/evil.com" as another site, so backslashes and control
// characters are refused, and the result must resolve to this origin.
export function safeNext(value: string | string[] | null | undefined, fallback: string): string {
  const next = Array.isArray(value) ? value[0] : value;
  if (!next || !next.startsWith("/") || next.startsWith("//") || /[\\\u0000-\u001f\u007f]/.test(next)) return fallback;
  try {
    const base = "https://mithaiwallah.invalid";
    const url = new URL(next, base);
    return url.origin === base ? url.pathname + url.search + url.hash : fallback;
  } catch {
    return fallback;
  }
}
