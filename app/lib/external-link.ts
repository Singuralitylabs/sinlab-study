// Only absolute http(s) URLs count as external. Own-site links are written as relative paths in
// content, so no origin comparison is needed (which would require env access on the client too).
export function isExternalHref(href: string | undefined): href is string {
  return href !== undefined && /^https?:\/\//i.test(href.trim());
}
