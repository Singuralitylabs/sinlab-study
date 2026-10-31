/** Tree tab (structure). */
export const MANAGE_CONTENTS_TREE_PATH = "/manage/contents";

/** Bulk-ops tab (filter + table). */
export const MANAGE_CONTENTS_BULK_PATH = "/manage/contents/bulk";

/** Query flag on edit/delete links opened from the bulk tab. */
export const MANAGE_CONTENTS_FROM_BULK = "bulk";

/**
 * Return path after edit/delete. Only the explicit bulk flag goes back to the bulk tab;
 * everything else (tree, deep links, missing param) returns to the tree.
 */
export function manageContentsReturnPath(from: string | null | undefined): string {
  return from === MANAGE_CONTENTS_FROM_BULK ? MANAGE_CONTENTS_BULK_PATH : MANAGE_CONTENTS_TREE_PATH;
}

export function manageContentsEditHref(contentId: number, fromBulk: boolean): string {
  const base = `${MANAGE_CONTENTS_TREE_PATH}/${contentId}/edit`;
  return fromBulk ? `${base}?from=${MANAGE_CONTENTS_FROM_BULK}` : base;
}

export function manageContentsDeleteHref(contentId: number, fromBulk: boolean): string {
  const base = `${MANAGE_CONTENTS_TREE_PATH}/${contentId}/delete`;
  return fromBulk ? `${base}?from=${MANAGE_CONTENTS_FROM_BULK}` : base;
}
