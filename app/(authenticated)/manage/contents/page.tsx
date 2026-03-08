import {
  Edit,
  Eye,
  EyeOff,
  FileText,
  PenLine,
  Play,
  Plus,
  Presentation,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { PageTitle } from "@/app/components/PageTitle";
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
        <Card className="overflow-x-auto">
          <Table className="min-w-[800px]">
            <TableHeader>
              <TableRow>
                <TableHead className="w-16">順序</TableHead>
                <TableHead>タイトル</TableHead>
                <TableHead className="w-24">種類</TableHead>
                <TableHead>週</TableHead>
                <TableHead>フェーズ</TableHead>
                <TableHead className="text-center w-20">公開</TableHead>
                <TableHead className="text-right w-24">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {contents.map((content) => (
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
                  <TableCell className="text-sm text-muted-foreground">
                    {content.week?.name || "-"}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {content.week?.phase?.name || "-"}
                  </TableCell>
                  <TableCell className="text-center">
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
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
