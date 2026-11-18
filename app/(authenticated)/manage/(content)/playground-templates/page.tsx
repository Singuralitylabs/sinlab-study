import { Edit, Eye, EyeOff, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { PageTitle } from "@/app/components/PageTitle";
import {
  MANAGE_PLAYGROUND_TEMPLATES_PATH,
  PLAYGROUND_KIND_LABELS,
  playgroundTemplatePath,
} from "@/app/constants/playground";
import { formatDate } from "@/app/lib/format-date";
import { isPlaygroundKind } from "@/app/lib/playground";
import { fetchManagePlaygroundTemplates } from "@/app/services/api/playground-templates-server";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
import { TemplateShareButtons } from "./TemplateShareButtons";

export default async function ManagePlaygroundTemplatesPage() {
  const { data: templates, error } = await fetchManagePlaygroundTemplates();

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <PageTitle
          title="コードを試す ひな形"
          description="体験会などで配るコードを作り、リンクや QR コードで配ります"
        />
        <Button asChild>
          <Link href={`${MANAGE_PLAYGROUND_TEMPLATES_PATH}/new`}>
            <Plus className="h-4 w-4" />
            新規作成
          </Link>
        </Button>
      </div>

      {error ? (
        <Alert variant="destructive">
          <AlertDescription>
            ひな形の取得に失敗しました。時間をおいて再度お試しください。
          </AlertDescription>
        </Alert>
      ) : !templates || templates.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-muted-foreground">ひな形はまだありません。</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>題名</TableHead>
                <TableHead className="w-48">種類</TableHead>
                <TableHead className="w-28">公開</TableHead>
                <TableHead className="w-28">更新日</TableHead>
                <TableHead className="text-right w-52">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {templates.map((template) => {
                const path = playgroundTemplatePath(template.slug);
                return (
                  <TableRow key={template.id}>
                    <TableCell className="font-medium">
                      <Link href={path} className="hover:underline">
                        {template.title}
                      </Link>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {isPlaygroundKind(template.kind)
                        ? PLAYGROUND_KIND_LABELS[template.kind]
                        : template.kind}
                    </TableCell>
                    <TableCell>
                      {template.is_published ? (
                        <Badge variant="secondary" className="gap-1 bg-success/10 text-success">
                          <Eye className="h-3 w-3" />
                          公開中
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="gap-1">
                          <EyeOff className="h-3 w-3" />
                          非公開
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDate(template.updated_at)}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
                        <TemplateShareButtons path={path} title={template.title} />
                        <Button variant="ghost" size="icon-sm" asChild title="編集">
                          <Link href={`${MANAGE_PLAYGROUND_TEMPLATES_PATH}/${template.id}/edit`}>
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
                          <Link href={`${MANAGE_PLAYGROUND_TEMPLATES_PATH}/${template.id}/delete`}>
                            <Trash2 className="h-4 w-4" />
                          </Link>
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
