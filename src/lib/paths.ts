/** Joins the Astro base path and a route/asset path. `base` may or may not end with a slash. */
export function withBase(base: string, path = ''): string {
  const b = base.endsWith('/') ? base : base + '/';
  return b + path.replace(/^\/+/, '');
}
