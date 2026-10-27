import { AppShell } from '@/components/layout/AppShell';
import { DutyRosterBoard } from '@/features/dispatch-tasks/DutyRosterBoard';

export default function VehicleBalancePage() {
  return <AppShell><main className="roster-page"><DutyRosterBoard query="" view="balance" /></main></AppShell>;
}
