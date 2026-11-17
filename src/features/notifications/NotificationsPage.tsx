import { useEffect, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, Check, Clock3 } from "lucide-react";
import { Link } from "react-router-dom";
import { EmptyState, PageTitle, QueryState } from "../../components/ui/Page";
import { useAuth } from "../auth/AuthProvider";
import { requireSupabase } from "../../lib/supabase";

interface NotificationItem {
  id: string;
  type: string;
  title: string;
  body: string;
  contract_id: string | null;
  source_type: string | null;
  source_id: string | null;
  read_at: string | null;
  scheduled_for: string | null;
  created_at: string;
}

export function NotificationsPage() {
  const { user } = useAuth();
  const client = requireSupabase();
  const queryClient = useQueryClient();
  const queryKey = ["notifications", user?.id];
  const query = useQuery({
    queryKey,
    enabled: Boolean(user),
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await client.from("notifications")
        .select("id,type,title,body,contract_id,source_type,source_id,read_at,scheduled_for,created_at")
        .eq("owner_id", user!.id).order("created_at", { ascending: false }).limit(100);
      if (error) throw error;
      return (data ?? []) as NotificationItem[];
    },
  });
  const visible = useMemo(() => (query.data ?? []).filter((item) =>
    !item.scheduled_for || Date.parse(item.scheduled_for) <= Date.now()
  ), [query.data]);
  const unreadIds = visible.filter((item) => !item.read_at).map((item) => item.id);

  const markRead = useMutation({
    mutationFn: async (ids: string[]) => {
      if (!ids.length || !user) return;
      const { error } = await client.from("notifications")
        .update({ read_at: new Date().toISOString() })
        .eq("owner_id", user.id).in("id", ids).is("read_at", null);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });

  useEffect(() => {
    if (!user || !client) return;
    const channel = client.channel(`notifications-${user.id}`)
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "notifications",
        filter: `owner_id=eq.${user.id}`,
      }, () => {
        void queryClient.invalidateQueries({ queryKey });
      })
      .subscribe();
    return () => { void client.removeChannel(channel); };
  }, [client, queryClient, user, user?.id]);

  return (
    <>
      <PageTitle
        eyebrow="LEMBRETES"
        title="Notificações"
        description="Aceites registrados e lembretes de vencimento dos seus contratos."
        action={unreadIds.length > 0 ? (
          <button className="button button-secondary" disabled={markRead.isPending} onClick={() => markRead.mutate(unreadIds)}>
            <Check size={15} /> Marcar todas como lidas
          </button>
        ) : undefined}
      />
      {markRead.error && <p className="form-message error-message" role="alert">{markRead.error.message}</p>}
      <QueryState loading={query.isLoading} error={query.error as Error | null}>
        {visible.length ? (
          <section className="panel notifications-list" aria-label="Lista de notificações">
            {visible.map((notification) => (
              <article className={`notification-card${notification.read_at ? "" : " notification-unread"}`} key={notification.id}>
                <span className="notification-icon"><Bell size={17} /></span>
                <div className="notification-copy">
                  <div className="notification-title"><h2>{notification.title}</h2>{!notification.read_at && <span>Nova</span>}</div>
                  <p>{notification.body}</p>
                  <small><Clock3 size={12} /> {new Date(notification.scheduled_for ?? notification.created_at).toLocaleString("pt-BR")}</small>
                  <div className="notification-actions">
                    {notification.contract_id && <Link to={`/app/contracts/${notification.contract_id}`}>Abrir contrato</Link>}
                    {!notification.read_at && <button type="button" onClick={() => markRead.mutate([notification.id])}>Marcar como lida</button>}
                  </div>
                </div>
              </article>
            ))}
          </section>
        ) : (
          <EmptyState title="Tudo em dia" message="Novos aceites e lembretes de vencimento aparecerão aqui." />
        )}
      </QueryState>
    </>
  );
}
