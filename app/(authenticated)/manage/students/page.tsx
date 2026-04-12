import { Users } from "lucide-react";
import { PageTitle } from "@/app/components/PageTitle";
import { fetchStudentsProgress } from "@/app/services/api/admin-server";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

function formatDate(dateString: string | null) {
  if (!dateString) return "-";
  return new Date(dateString).toLocaleDateString("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

export default async function ManageStudentsPage() {
  const { data: students } = await fetchStudentsProgress();

  return (
    <div className="max-w-4xl mx-auto">
      <PageTitle title="受講生進捗" description="受講生の学習進捗状況" />

      {!students || students.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center">
            <Users className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">受講生がまだいません。</p>
          </CardContent>
        </Card>
      ) : (
        <Card className="overflow-x-auto">
          <Table className="min-w-[700px]">
            <TableHeader>
              <TableRow>
                <TableHead>名前</TableHead>
                <TableHead>メール</TableHead>
                <TableHead className="text-center">進捗</TableHead>
                <TableHead className="text-right">最終アクティビティ</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {students.map((student) => {
                const progress =
                  student.totalContents > 0
                    ? Math.round((student.completedContents / student.totalContents) * 100)
                    : 0;

                return (
                  <TableRow key={student.user.id}>
                    <TableCell className="font-medium">{student.user.display_name}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {student.user.email}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Progress value={progress} className="flex-1" />
                        <span className="text-sm text-muted-foreground w-16 text-right">
                          {student.completedContents}/{student.totalContents}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground text-right">
                      {formatDate(student.lastActivity)}
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
