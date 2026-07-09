/** App base path (e.g. `/` or `/nz-demographic-map/`). Always ends with `/`. */
const BASE_URL = import.meta.env.BASE_URL || '/'

/** Resolve a path under the app base for fetch / asset URLs. */
export function assetUrl(path: string): string {
  const clean = path.replace(/^\//, '')
  return `${BASE_URL}${clean}`
}

/** Absolute URL for PMTiles protocol (needs full origin + base). */
export function pmtilesUrl(path: string): string {
  const relative = assetUrl(path)
  if (typeof window === 'undefined') return relative
  return new URL(relative, window.location.origin).href
}
