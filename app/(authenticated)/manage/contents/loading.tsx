import { Fragment } from "react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default function ManageContentsLoading() {
  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <Skeleton className="h-8 w-40 mb-2" />
          <Skeleton className="h-4 w-56" />
        </div>
        <Skeleton className="h-9 w-24" />
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-16">
                <Skeleton className="h-4 w-8" />
              </TableHead>
              <TableHead>
                <Skeleton className="h-4 w-16" />
              </TableHead>
              <TableHead className="w-24">
                <Skeleton className="h-4 w-8" />
              </TableHead>
              <TableHead className="w-40">
                <Skeleton className="h-4 w-8" />
              </TableHead>
              <TableHead className="w-24">
                <Skeleton className="h-4 w-8" />
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {[1, 2].map((group) => (
              <Fragment key={group}>
                <TableRow className="bg-muted/50 hover:bg-muted/50">
                  <TableCell colSpan={5}>
                    <Skeleton className="h-4 w-48" />
                  </TableCell>
                </TableRow>
                {[1, 2, 3].map((row) => (
                  <TableRow key={row}>
                    <TableCell>
                      <Skeleton className="h-4 w-6" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-4 w-48" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-5 w-16 rounded-full" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-5 w-14 rounded-full" />
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        <Skeleton className="h-7 w-7 rounded" />
                        <Skeleton className="h-7 w-7 rounded" />
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </Fragment>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
