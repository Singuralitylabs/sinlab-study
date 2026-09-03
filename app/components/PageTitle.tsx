import { ChevronRight, Home } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

interface BreadcrumbItem {
  label: string;
  href?: string;
}

interface PageTitleProps {
  title: string;
  breadcrumbs?: BreadcrumbItem[];
  description?: string;
  /** タイトル横に表示する補助バッジ（未公開バッジ等） */
  badge?: ReactNode;
}

export function PageTitle({ title, breadcrumbs, description, badge }: PageTitleProps) {
  return (
    <div className="mb-6">
      {breadcrumbs && breadcrumbs.length > 0 && (
        <nav className="flex items-center gap-1 text-sm text-muted-foreground mb-3">
          <Link href="/" className="hover:text-foreground flex items-center transition-colors">
            <Home className="h-4 w-4" />
          </Link>
          {breadcrumbs.map((item) => (
            <span key={item.label} className="flex items-center gap-1">
              <ChevronRight className="h-4 w-4" />
              {item.href ? (
                <Link href={item.href} className="hover:text-foreground transition-colors">
                  {item.label}
                </Link>
              ) : (
                <span className="text-foreground">{item.label}</span>
              )}
            </span>
          ))}
        </nav>
      )}
      <div className="flex items-center gap-2">
        <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
        {badge}
      </div>
      {description && <p className="text-muted-foreground mt-1">{description}</p>}
    </div>
  );
}
