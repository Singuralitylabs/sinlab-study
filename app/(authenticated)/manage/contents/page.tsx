import {
  Edit,
  Eye,
  EyeOff,
  FileText,
  PenLine,
  Play,
  Plus,
  Presentation,
  Sparkles,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { Fragment } from "react";
import { PageTitle } from "@/app/components/PageTitle";
import { groupContentsByWeek, sortContentsByHierarchy } from "@/app/lib/content-grouping";
import { fetchAllContents } from "@/app/services/api/admin-server";
import type { ContentType } from "@/app/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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

export default async function AdminContentsPage() {
  const { data: contents } = await fetchAllContents();
  const groups = contents ? groupContentsByWeek(sortContentsByHierarchy(contents)) : [];

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <PageTitle title="コンテンツ管理" description="学習コンテンツの作成・編集・削除" />
        <Button asChild>
          <Link href="/manage/contents/new">
            <Plus className="h-4 w-4" />
            新規作成
          </Link>
        </Button>
      </div>

      {!contents || contents.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-muted-foreground">コンテンツがまだ登録されていません。</p>
            <Button asChild className="mt-4">
              <Link href="/manage/contents/new">最初のコンテンツを作成</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-16">順序</TableHead>
                <TableHead>タイトル</TableHead>
                <TableHead className="w-24">種類</TableHead>
                <TableHead className="w-40">状態</TableHead>
                <TableHead className="text-right w-24">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {groups.map((group) => (
                <Fragment key={group.key}>
                  <TableRow className="bg-muted/50 hover:bg-muted/50">
                    <TableCell colSpan={5} className="text-sm font-medium">
                      {group.label}
                      <span className="ml-2 font-normal text-muted-foreground">
                        （{group.contents.length}件）
                      </span>
                    </TableCell>
                  </TableRow>
                  {group.contents.map((content) => (
                    <TableRow key={content.id}>
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
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
