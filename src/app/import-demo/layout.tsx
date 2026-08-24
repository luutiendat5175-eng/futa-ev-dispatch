import { AppShell } from "@/components/layout/AppShell";
import { BatchDutyRosterUpload } from "@/features/import/BatchDutyRosterUpload";
import "./import-data.css";
import "./batch-roster.css";
export default function ImportLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AppShell>
      {children}
      <main className="import-page batch-import-page">
        <BatchDutyRosterUpload />
      </main>
    </AppShell>
  );
}
