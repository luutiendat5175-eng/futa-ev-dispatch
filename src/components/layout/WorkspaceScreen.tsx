import { AppShell } from './AppShell';

export function WorkspaceScreen({ title, description, children }: { title: string; description: string; children?: React.ReactNode }) {
  return <AppShell><section className="workspace-screen"><p className="workspace-eyebrow">EV DISPATCH</p><h1>{title}</h1><p className="workspace-description">{description}</p>{children ?? <div className="workspace-card">Chức năng này đã được liên kết vào hệ thống. Phần biểu mẫu và dữ liệu nghiệp vụ sẽ được hoàn thiện ở đợt tiếp theo.</div>}</section></AppShell>;
}
