"use client";

import {
  Edit,
  Eye,
  EyeOff,
  FileText,
  Loader2,
  PenLine,
  Play,
  Presentation,
  Sparkles,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Fragment, useEffect, useMemo, useState } from "react";
import { CONTENT_TYPE_LABELS, CONTENT_TYPES, MAX_BULK_CONTENT_IDS } from "@/app/constants/content";
import type { ContentTableGroup, ContentTableRow } from "@/app/lib/content-grouping";
import type { ContentType } from "@/app/types";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

function getContentIcon(type: ContentType) {
  switch (type) {
    case "video":
      return <Play className="h-3 w-3" />;
    case "text":
      return <FileText className="h-3 w-3" />;
    case "exercise":
      return <PenLine className="h-3 w-3" />;
    case "slide":
      return <Presentation className="h-3 w-3" />;
    default:
      return <FileText className="h-3 w-3" />;
  }
}

type BulkAction = "publish" | "unpublish" | "open_trial" | "close_trial" | "set_type" | "delete";

interface ContentsTableProps {
  groups: ContentTableGroup[];
}

export function ContentsTable({ groups }: ContentsTableProps) {
  const router = useRouter();
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [typeDialogOpen, setTypeDialogOpen] = useState(false);
  const [newContentType, setNewContentType] = useState<ContentType>("video");

  const allContents = useMemo<ContentTableRow[]>(
    () => groups.flatMap((group) => group.contents),
    [groups]
  );
  const allIds = useMemo(() => allContents.map((content) => content.id), [allContents]);
  const selectedCount = selectedIds.size;
  const allSelected = allIds.length > 0 && allIds.every((id) => selectedIds.has(id));

  // フィルタ変更等で表示中のコンテンツ（groups/allIds）が変わったら、選択状態を
  // 現在表示中のIDとの積集合に絞る。絞らないと、非表示になった行の選択が
  // Set に残ったまま一括操作（削除含む）の対象に含まれてしまう。
  useEffect(() => {
    setSelectedIds((prev) => {
      if (prev.size === 0) return prev;
      const visible = new Set(allIds);
      let changed = false;
      const next = new Set<number>();
      for (const id of prev) {
        if (visible.has(id)) {
          next.add(id);
        } else {
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [allIds]);

  const publishedSelectedCount = allContents.filter(
    (content) => selectedIds.has(content.id) && content.is_published
  ).length;

  function toggleAll(checked: boolean) {
    setSelectedIds(checked ? new Set(allIds) : new Set());
  }

  function toggleGroup(group: ContentTableGroup, checked: boolean) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const content of group.contents) {
        if (checked) {
          next.add(content.id);
        } else {
          next.delete(content.id);
        }
      }
      return next;
    });
  }

  function toggleOne(id: number, checked: boolean) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) {
        next.add(id);
      } else {
        next.delete(id);
      }
      return next;
    });
  }

  async function runBulkAction(action: BulkAction, contentType?: ContentType) {
    setIsLoading(true);
    setErrorMessage(null);
    const ids = [...selectedIds];
    try {
      let totalUpdated = 0;
      // ids が MAX_BULK_CONTENT_IDS を超える場合、APIの上限に収まるようチャンク分割して送信する
      for (let i = 0; i < ids.length; i += MAX_BULK_CONTENT_IDS) {
        const chunk = ids.slice(i, i + MAX_BULK_CONTENT_IDS);
        const response = await fetch("/api/manage/contents/bulk", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ids: chunk,
            action,
            ...(action === "set_type" ? { contentType } : {}),
          }),
        });
        if (!response.ok) {
          const data = await response.json();
          setErrorMessage(data.error || "一括操作に失敗しました");
          return;
        }
        const data = await response.json();
        totalUpdated += typeof data.updated === "number" ? data.updated : 0;
      }

      setSelectedIds(new Set());
      setDeleteDialogOpen(false);
      setTypeDialogOpen(false);
      router.refresh();

      if (totalUpdated < ids.length) {
        setErrorMessage(
          `${ids.length}件中${ids.length - totalUpdated}件は更新できませんでした（他の操作により既に削除されている可能性があります）`
        );
      }
    } catch {
      setErrorMessage("一括操作中にエラーが発生しました");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      {errorMessage && (
        <Alert variant="destructive">
          <AlertDescription>{errorMessage}</AlertDescription>
        </Alert>
      )}

      {selectedCount > 0 && (
        <Card className="p-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium">{selectedCount}件選択中</span>
            <Button
              size="sm"
              variant="outline"
              disabled={isLoading}
              onClick={() => runBulkAction("publish")}
            >
              公開
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={isLoading}
              onClick={() => runBulkAction("unpublish")}
            >
              非公開
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={isLoading}
              onClick={() => runBulkAction("open_trial")}
            >
              お試しON
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={isLoading}
              onClick={() => runBulkAction("close_trial")}
            >
              お試しOFF
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={isLoading}
              onClick={() => setTypeDialogOpen(true)}
            >
              種別変更
            </Button>
            <Button
              size="sm"
              variant="destructive"
              disabled={isLoading}
              onClick={() => setDeleteDialogOpen(true)}
            >
              削除
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={isLoading}
              onClick={() => setSelectedIds(new Set())}
            >
              選択解除
            </Button>
            {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
          </div>
        </Card>
      )}

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <Checkbox
                  checked={allSelected}
                  onCheckedChange={(checked) => toggleAll(checked === true)}
                  aria-label="全選択"
                />
              </TableHead>
              <TableHead className="w-16">順序</TableHead>
              <TableHead>タイトル</TableHead>
              <TableHead className="w-24">種類</TableHead>
              <TableHead className="w-40">状態</TableHead>
              <TableHead className="text-right w-24">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {groups.map((group) => {
              const groupIds = group.contents.map((content) => content.id);
              const groupAllSelected =
                groupIds.length > 0 && groupIds.every((id) => selectedIds.has(id));
              return (
                <Fragment key={group.key}>
                  <TableRow className="bg-muted/50 hover:bg-muted/50">
                    <TableCell>
                      <Checkbox
                        checked={groupAllSelected}
                        onCheckedChange={(checked) => toggleGroup(group, checked === true)}
                        aria-label={`${group.label}を全選択`}
                      />
                    </TableCell>
                    <TableCell colSpan={5} className="text-sm font-medium">
                      {group.label}
                      <span className="ml-2 font-normal text-muted-foreground">
                        （{group.contents.length}件）
                      </span>
                    </TableCell>
                  </TableRow>
                  {group.contents.map((content) => (
                    <TableRow key={content.id}>
                      <TableCell>
                        <Checkbox
                          checked={selectedIds.has(content.id)}
                          onCheckedChange={(checked) => toggleOne(content.id, checked === true)}
                          aria-label={`${content.title}を選択`}
                        />
                      </TableCell>
                      <TableCell className="text-sm">{content.display_order}</TableCell>
                      <TableCell className="font-medium">
                        <span className="line-clamp-1">{content.title}</span>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="gap-1">
                          {getContentIcon(content.content_type)}
                          {CONTENT_TYPE_LABELS[content.content_type]}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap items-center gap-1">
                          {content.is_published ? (
                            <Badge variant="secondary" className="gap-1 bg-success/10 text-success">
                              <Eye className="h-3 w-3" />
                              公開
                            </Badge>
                          ) : (
                            <Badge variant="secondary" className="gap-1">
                              <EyeOff className="h-3 w-3" />
                              非公開
                            </Badge>
                          )}
                          {content.is_open_to_trial && (
                            <Badge variant="outline" className="gap-1">
                              <Sparkles className="h-3 w-3" />
                              お試し公開
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="icon-sm" asChild title="編集">
                            <Link href={`/manage/contents/${content.id}/edit`}>
                              <Edit className="h-4 w-4" />
                            </Link>
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            asChild
                            title="削除"
                            className="text-destructive hover:text-destructive"
                          >
                            <Link href={`/manage/contents/${content.id}/delete`}>
                              <Trash2 className="h-4 w-4" />
                            </Link>
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </Fragment>
              );
            })}
          </TableBody>
        </Table>
      </Card>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{selectedCount}件のコンテンツを削除しますか？</DialogTitle>
            <DialogDescription>
              削除したコンテンツは受講生から見えなくなります。この操作は一覧からは元に戻せません。
            </DialogDescription>
          </DialogHeader>
          {errorMessage && (
            <Alert variant="destructive">
              <AlertDescription>{errorMessage}</AlertDescription>
            </Alert>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              disabled={isLoading}
              onClick={() => setDeleteDialogOpen(false)}
            >
              キャンセル
            </Button>
            <Button
              variant="destructive"
              disabled={isLoading}
              onClick={() => runBulkAction("delete")}
            >
              {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
              削除する
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={typeDialogOpen} onOpenChange={setTypeDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{selectedCount}件のコンテンツ種別を変更しますか？</DialogTitle>
            <DialogDescription>
              種別固有の項目（動画URL・本文・演習内容など）は保持されますが、変更後は本文が未設定の状態になり得ます。表示内容は種別を元に戻すと復元されます。
            </DialogDescription>
          </DialogHeader>
          {publishedSelectedCount > 0 && (
            <Alert variant="destructive">
              <AlertDescription>
                選択中{publishedSelectedCount}
                件は公開中です。本文が未設定のまま受講生に表示される可能性があるため、先に非公開にすることを推奨します。
              </AlertDescription>
            </Alert>
          )}
          {errorMessage && (
            <Alert variant="destructive">
              <AlertDescription>{errorMessage}</AlertDescription>
            </Alert>
          )}
          <select
            value={newContentType}
            onChange={(e) => setNewContentType(e.target.value as ContentType)}
            className="h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs"
          >
            {CONTENT_TYPES.map((type) => (
              <option key={type} value={type}>
                {CONTENT_TYPE_LABELS[type]}
              </option>
            ))}
          </select>
          <DialogFooter>
            <Button variant="outline" disabled={isLoading} onClick={() => setTypeDialogOpen(false)}>
              キャンセル
            </Button>
            <Button disabled={isLoading} onClick={() => runBulkAction("set_type", newContentType)}>
              {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
              変更する
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
