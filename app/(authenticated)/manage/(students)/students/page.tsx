import { Users } from "lucide-react";
import { redirect } from "next/navigation";
import { PageTitle } from "@/app/components/PageTitle";
import { formatDatePadded } from "@/app/lib/format-date";
import { fetchStudentsProgress } from "@/app/services/api/admin-server";
import { fetchCertificateCountsByUser } from "@/app/services/api/certificates-server";
import { checkAdminPermissions } from "@/app/services/auth/permissions";
import { getServerAuth } from "@/app/services/auth/server-auth";
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
  return formatDatePadded(dateString);
}

export default async function ManageStudentsPage() {
  const { userRole } = await getServerAuth();
  // Spec 6.2: student progress is admin-only (#335).
  if (!checkAdminPermissions(userRole)) {
    redirect("/manage");
  }

  const [{ data: students }, certificateCounts] = await Promise.all([
    fetchStudentsProgress(),
    fetchCertificateCountsByUser(),
  ]);

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
          <Table className="min-w-[760px]">
            <TableHeader>
              <TableRow>
                <TableHead>名前</TableHead>
                <TableHead>メール</TableHead>
                <TableHead className="text-center">進捗</TableHead>
                <TableHead className="text-center">修了証</TableHead>
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
                    <TableCell className="text-sm text-center">
                      {certificateCounts.get(student.user.id) ?? 0}枚
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
