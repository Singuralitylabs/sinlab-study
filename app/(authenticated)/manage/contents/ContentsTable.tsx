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
import { Fragment, useMemo, useState } from "react";
import type { ContentGroup } from "@/app/lib/content-grouping";
import type { ContentType, LearningContentWithWeek } from "@/app/types";
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

const CONTENT_TYPE_SET_OPTIONS: { value: ContentType; label: string }[] = [
  { value: "video", label: "動画" },
  { value: "text", label: "テキスト" },
  { value: "exercise", label: "演習" },
  { value: "slide", label: "スライド（PDF）" },
];

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

function getContentTypeLabel(type: ContentType) {
  switch (type) {
    case "video":
      return "動画";
    case "text":
      return "テキスト";
    case "exercise":
      return "演習";
    case "slide":
      return "スライド";
    default:
      return type;
  }
}

type BulkAction = "publish" | "unpublish" | "open_trial" | "close_trial";

interface ContentsTableProps {
  groups: ContentGroup[];
}

export function ContentsTable({ groups }: ContentsTableProps) {
  const router = useRouter();
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [typeDialogOpen, setTypeDialogOpen] = useState(false);
  const [newContentType, setNewContentType] = useState<ContentType>("video");

  const allContents = useMemo<LearningContentWithWeek[]>(
    () => groups.flatMap((group) => group.contents),
    [groups]
  );
  const allIds = useMemo(() => allContents.map((content) => content.id), [allContents]);
  const selectedCount = selectedIds.size;
  const allSelected = allIds.length > 0 && selectedIds.size === allIds.length;

  function toggleAll(checked: boolean) {
    setSelectedIds(checked ? new Set(allIds) : new Set());
  }

  function toggleGroup(group: ContentGroup, checked: boolean) {
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

  async function runBulkAction(
    action: BulkAction | "set_type" | "delete",
    contentType?: ContentType
  ) {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const response = await fetch("/api/manage/contents/bulk", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ids: [...selectedIds],
          action,
          ...(action === "set_type" ? { contentType } : {}),
        }),
      });
      if (response.ok) {
        setSelectedIds(new Set());
        setDeleteDialogOpen(false);
        setTypeDialogOpen(false);
        router.refresh();
      } else {
        const data = await response.json();
        setErrorMessage(data.error || "一括操作に失敗しました");
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
                          {getContentTypeLabel(content.content_type)}
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
          <select
            value={newContentType}
            onChange={(e) => setNewContentType(e.target.value as ContentType)}
            className="h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs"
          >
            {CONTENT_TYPE_SET_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
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
