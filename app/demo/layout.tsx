import { DemoBanner } from "./components/DemoBanner";
import { DemoSideNav } from "./components/DemoSideNav";

export default function DemoLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <DemoBanner />
      <div className="sm:flex min-h-screen pt-10">
        <DemoSideNav />
        <main className="flex-1 sm:ml-64 p-6 pt-14 sm:pt-6">{children}</main>
      </div>
    </div>
  );
}
