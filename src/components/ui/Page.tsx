import type { ReactNode } from "react";

export function PageTitle({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="page-title-row">
      <div>
        {eyebrow && <span className="eyebrow">{eyebrow}</span>}
        <h1 className="page-title">{title}</h1>
        {description && <p className="page-description">{description}</p>}
      </div>
      {action && <div className="page-title-action">{action}</div>}
    </div>
  );
}

export function EmptyState({ title, message, action }: { title: string; message: string; action?: ReactNode }) {
  return (
    <div className="empty-state">
      <div className="empty-state-icon">C</div>
      <h3>{title}</h3>
      <p>{message}</p>
      {action}
    </div>
  );
}

export function QueryState({
  loading,
  error,
  children,
}: {
  loading: boolean;
  error: Error | null;
  children: ReactNode;
}) {
  if (loading) return <div className="inline-state" role="status">Carregando dados…</div>;
  if (error) return <div className="inline-state state-error" role="alert">Não foi possível carregar: {error.message}</div>;
  return children;
}
