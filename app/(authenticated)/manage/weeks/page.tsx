import { Edit, Eye, EyeOff, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { PageTitle } from "@/app/components/PageTitle";
import { fetchAllWeeks } from "@/app/services/api/admin-server";
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

export default async function ManageWeeksPage() {
  const { data: weeks } = await fetchAllWeeks();

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <PageTitle title="週管理" description="学習週の作成・編集・削除" />
        <Button asChild>
          <Link href="/manage/weeks/new">
            <Plus className="h-4 w-4" />
            新規作成
          </Link>
        </Button>
      </div>

      {!weeks || weeks.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-muted-foreground">週がまだ登録されていません。</p>
            <Button asChild className="mt-4">
              <Link href="/manage/weeks/new">最初の週を作成</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-16">順序</TableHead>
                <TableHead>フェーズ</TableHead>
                <TableHead>名前</TableHead>
                <TableHead className="text-center w-16">公開</TableHead>
                <TableHead className="text-right w-24">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {weeks.map((week) => (
                <TableRow key={week.id}>
                  <TableCell className="text-sm">{week.display_order}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {week.phase?.name || "-"}
                  </TableCell>
                  <TableCell className="font-medium">{week.name}</TableCell>
                  <TableCell className="text-center">
                    {week.is_published ? (
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
                        <Link href={`/manage/weeks/${week.id}/edit`}>
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
                        <Link href={`/manage/weeks/${week.id}/delete`}>
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
