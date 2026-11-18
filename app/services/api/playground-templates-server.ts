import type { PostgrestError } from "@supabase/supabase-js";
import { PLAYGROUND_TEMPLATE_SLUG_PATTERN, type PlaygroundKind } from "@/app/constants/playground";
import {
  generatePlaygroundTemplateSlug,
  isPlaygroundKind,
  type PlaygroundFileInput,
  playgroundFilesError,
  toPlaygroundCodeFiles,
} from "@/app/lib/playground";
import type { PlaygroundTemplateInput } from "@/app/services/api/schemas";
import type { PlaygroundTemplate } from "@/app/types";
import { createServerSupabaseClient } from "./supabase-server";

/**
 * Reads and writes use the normal client: RLS lets active / trial read published rows and lets
 * admin / maintainer do everything. service_role is never used here.
 */

export interface PlaygroundTemplateView {
  slug: string;
  title: string;
  kind: PlaygroundKind;
  files: PlaygroundFileInput[];
  isPublished: boolean;
}

export type ManagePlaygroundTemplateListItem = Pick<
  PlaygroundTemplate,
  "id" | "slug" | "title" | "kind" | "is_published" | "updated_at"
>;

const UNIQUE_VIOLATION = "23505";
const SLUG_ATTEMPTS = 3;

/** A row edited by hand in SQL could hold anything; such a row is treated as missing. */
function toView(
  row: Pick<PlaygroundTemplate, "slug" | "title" | "kind" | "files" | "is_published">
): PlaygroundTemplateView | null {
  if (!isPlaygroundKind(row.kind) || !Array.isArray(row.files)) {
    return null;
  }
  const files: PlaygroundFileInput[] = [];
  for (const item of row.files) {
    if (
      typeof item !== "object" ||
      item === null ||
      Array.isArray(item) ||
      typeof item.filename !== "string" ||
      typeof item.content !== "string"
    ) {
      return null;
    }
    files.push({ filename: item.filename, content: item.content });
  }
  if (playgroundFilesError(row.kind, files)) {
    return null;
  }
  return {
    slug: row.slug,
    title: row.title,
    kind: row.kind,
    files,
    isPublished: row.is_published,
  };
}

/**
 * Template behind a shared link. Learners only reach published rows (RLS); admin / maintainer also
 * reach drafts so they can check a link before publishing, and the page labels it as a draft.
 */
export async function fetchPlaygroundTemplateBySlug(
  slug: string
): Promise<PlaygroundTemplateView | null> {
  if (!PLAYGROUND_TEMPLATE_SLUG_PATTERN.test(slug)) {
    return null;
  }
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("playground_templates")
    .select("slug, title, kind, files, is_published")
    .eq("slug", slug)
    .maybeSingle();
  if (error) {
    console.error("コードを試す: ひな形の取得エラー:", error.message);
    return null;
  }
  return data ? toView(data) : null;
}

export async function fetchManagePlaygroundTemplates(): Promise<{
  data: ManagePlaygroundTemplateListItem[] | null;
  error: PostgrestError | null;
}> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("playground_templates")
    .select("id, slug, title, kind, is_published, updated_at")
    .order("updated_at", { ascending: false });
  if (error) {
    console.error("コードを試す: ひな形一覧（管理）の取得エラー:", error.message);
    return { data: null, error };
  }
  return { data, error: null };
}

export async function fetchManagePlaygroundTemplateById(
  id: number
): Promise<(PlaygroundTemplateView & { id: number }) | null> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("playground_templates")
    .select("id, slug, title, kind, files, is_published")
    .eq("id", id)
    .maybeSingle();
  if (error) {
    console.error("コードを試す: ひな形（管理）の取得エラー:", error.message);
    return null;
  }
  const view = data ? toView(data) : null;
  return view && data ? { ...view, id: data.id } : null;
}

function toRow(input: PlaygroundTemplateInput) {
  return {
    title: input.title,
    kind: input.kind,
    files: toPlaygroundCodeFiles(input.kind, input.files),
    is_published: input.is_published,
  };
}

/** The slug is fixed at creation so printed QR codes keep working after edits. */
export async function createPlaygroundTemplate(
  input: PlaygroundTemplateInput,
  createdBy: number
): Promise<{ data: { id: number } | null; error: PostgrestError | null }> {
  const supabase = await createServerSupabaseClient();
  let lastError: PostgrestError | null = null;
  for (let attempt = 0; attempt < SLUG_ATTEMPTS; attempt++) {
    const { data, error } = await supabase
      .from("playground_templates")
      .insert({ ...toRow(input), slug: generatePlaygroundTemplateSlug(), created_by: createdBy })
      .select("id")
      .single();
    if (!error && data) {
      return { data, error: null };
    }
    lastError = error;
    if (error?.code !== UNIQUE_VIOLATION) {
      break;
    }
  }
  console.error("コードを試す: ひな形の作成エラー:", lastError?.message);
  return { data: null, error: lastError };
}

export async function updatePlaygroundTemplate(
  id: number,
  input: PlaygroundTemplateInput
): Promise<{ error: PostgrestError | null; notFound: boolean }> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("playground_templates")
    .update(toRow(input))
    .eq("id", id)
    .select("id");
  if (error) {
    console.error("コードを試す: ひな形の更新エラー:", error.message);
    return { error, notFound: false };
  }
  return { error: null, notFound: (data ?? []).length === 0 };
}

/** Hard delete: nothing references a template, and a deleted link should simply 404. */
export async function deletePlaygroundTemplate(
  id: number
): Promise<{ error: PostgrestError | null; notFound: boolean }> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("playground_templates")
    .delete()
    .eq("id", id)
    .select("id");
  if (error) {
    console.error("コードを試す: ひな形の削除エラー:", error.message);
    return { error, notFound: false };
  }
  return { error: null, notFound: (data ?? []).length === 0 };
}
