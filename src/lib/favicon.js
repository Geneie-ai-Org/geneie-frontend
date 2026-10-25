/** Resolve a website URL to its conventional root favicon location. */
export function getFaviconUrl(value) {
  try {
    return new URL("/favicon.ico", value).toString();
  } catch {
    return null;
  }
}
