import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

/** Mirrors PageTitle so the heading does not jump when the real page replaces the skeleton. */
export function PageTitleSkeleton({
  breadcrumbs = false,
  description = true,
}: {
  breadcrumbs?: boolean;
  description?: boolean;
}) {
  return (
    <div className="mb-6">
      {breadcrumbs && <Skeleton className="h-4 w-56 mb-3" />}
      <Skeleton className="h-9 w-48" />
      {description && <Skeleton className="h-5 w-72 mt-2" />}
    </div>
  );
}

/** Link-card rows used by the announcements / certificates style lists. */
export function ListCardsSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="grid gap-3">
      {Array.from({ length: rows }, (_, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: static placeholders
        <Card key={i}>
          <CardContent className="flex items-center gap-3 py-4">
            <Skeleton className="h-5 w-5 shrink-0 rounded-full" />
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-5 w-2/3" />
              <Skeleton className="h-4 w-24" />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

/** Card with stacked label + input rows and a submit button (manage new / edit forms). */
export function FormCardSkeleton({ fields = 4 }: { fields?: number }) {
  return (
    <Card>
      <CardContent className="space-y-6 pt-6">
        {Array.from({ length: fields }, (_, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: static placeholders
          <div key={i} className="space-y-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-10 w-full" />
          </div>
        ))}
        <div className="flex gap-2">
          <Skeleton className="h-10 w-24" />
          <Skeleton className="h-10 w-24" />
        </div>
      </CardContent>
    </Card>
  );
}

/** Card wrapping a table whose cells are bars. `columns` is the number of columns. */
export function TableCardSkeleton({ columns = 5, rows = 6 }: { columns?: number; rows?: number }) {
  return (
    <Card>
      <Table>
        <TableHeader>
          <TableRow>
            {Array.from({ length: columns }, (_, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: static placeholders
              <TableHead key={i}>
                <Skeleton className="h-4 w-16" />
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {Array.from({ length: rows }, (_, r) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: static placeholders
            <TableRow key={r}>
              {Array.from({ length: columns }, (_, c) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: static placeholders
                <TableCell key={c}>
                  <Skeleton className="h-4 w-full max-w-40" />
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}

/** Default export target for manage new / edit routes (`max-w-3xl` form card). */
export function FormPageSkeleton({ fields = 4 }: { fields?: number }) {
  return (
    <div className="max-w-3xl mx-auto">
      <PageTitleSkeleton />
      <FormCardSkeleton fields={fields} />
    </div>
  );
}

/** Default export target for manage delete routes (`max-w-lg` confirmation card). */
export function DeletePageSkeleton() {
  return (
    <div className="max-w-lg mx-auto">
      <PageTitleSkeleton />
      <Card className="mt-6">
        <CardContent className="space-y-4 pt-6">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-2/3" />
          <div className="flex gap-2">
            <Skeleton className="h-10 w-24" />
            <Skeleton className="h-10 w-24" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/** Table list page (`max-w-*` wrapper chosen by the caller to match the real page). */
export function TablePageSkeleton({
  maxWidth,
  columns,
  rows = 6,
}: {
  maxWidth: string;
  columns: number;
  rows?: number;
}) {
  return (
    <div className={`${maxWidth} mx-auto`}>
      <PageTitleSkeleton />
      <TableCardSkeleton columns={columns} rows={rows} />
    </div>
  );
}
