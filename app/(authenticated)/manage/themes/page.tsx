import { Edit, Eye, EyeOff, ImageIcon, Plus, Trash2 } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { PageTitle } from "@/app/components/PageTitle";
import { fetchAllThemes } from "@/app/services/api/admin-server";
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

export default async function ManageThemesPage() {
  const { data: themes } = await fetchAllThemes();

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <PageTitle title="テーマ管理" description="学習テーマの作成・編集・削除" />
        <Button asChild>
          <Link href="/manage/themes/new">
            <Plus className="h-4 w-4" />
            新規作成
          </Link>
        </Button>
      </div>

      {!themes || themes.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-muted-foreground">テーマがまだ登録されていません。</p>
            <Button asChild className="mt-4">
              <Link href="/manage/themes/new">最初のテーマを作成</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-16">順序</TableHead>
                <TableHead className="w-16">画像</TableHead>
                <TableHead>名前</TableHead>
                <TableHead>説明</TableHead>
                <TableHead className="text-center w-16">公開</TableHead>
                <TableHead className="text-right w-24">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {themes.map((theme) => (
                <TableRow key={theme.id}>
                  <TableCell className="text-sm">{theme.display_order}</TableCell>
                  <TableCell>
                    {theme.image_url ? (
                      <div className="relative w-10 h-10 rounded overflow-hidden">
                        <Image
                          src={theme.image_url}
                          alt={theme.name}
                          fill
                          className="object-cover"
                          sizes="40px"
                        />
                      </div>
                    ) : (
                      <div className="w-10 h-10 rounded bg-muted flex items-center justify-center">
                        <ImageIcon className="h-4 w-4 text-muted-foreground" />
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="font-medium">{theme.name}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {theme.description ? (
                      <span className="line-clamp-1">{theme.description}</span>
                    ) : (
                      "-"
                    )}
                  </TableCell>
                  <TableCell className="text-center">
                    {theme.is_published ? (
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
                        <Link href={`/manage/themes/${theme.id}/edit`}>
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
                        <Link href={`/manage/themes/${theme.id}/delete`}>
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
