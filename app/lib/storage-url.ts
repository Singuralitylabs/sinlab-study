/**
 * Existing external URLs and public-relative paths pass through unchanged (backward compatibility).
 */
export function resolveStorageUrl(url: string): string {
  if (!url.startsWith("/storage/")) {
    return url;
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  return supabaseUrl ? `${supabaseUrl.replace(/\/$/, "")}${url}` : url;
}

const STORAGE_URL_PLACEHOLDER = /\{\{SUPABASE_STORAGE_URL\}\}/g;

/**
 * Replaces the {{SUPABASE_STORAGE_URL}} placeholder in Markdown with the public object URL prefix
 * so admin-authored
 * Markdown (text_content, description, etc.) can reference Storage images
 * environment-independently.
 */
export function resolveMarkdownStorageUrls(content: string): string {
  return content.replace(STORAGE_URL_PLACEHOLDER, resolveStorageUrl("/storage/v1/object/public"));
}
