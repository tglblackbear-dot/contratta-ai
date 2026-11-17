import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BellRing, Download, ShieldAlert, Trash2 } from "lucide-react";
import { PageTitle } from "../../components/ui/Page";
import { clearOfflineUserData } from "../../lib/offlineInterviews";
import { requireSupabase } from "../../lib/supabase";
import { useAuth } from "../auth/AuthProvider";

async function loadOwnedRows(table: string, ownerColumn: string, ownerId: string) {
  const { data, error } = await requireSupabase().from(table).select("*").eq(ownerColumn, ownerId);
  if (error) throw new Error(`Não foi possível exportar ${table}: ${error.message}`);
  return data ?? [];
}

export function SettingsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [exporting, setExporting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [changingPush, setChangingPush] = useState(false);
  const [pushEndpoint, setPushEndpoint] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [feedback, setFeedback] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const pushQuery = useQuery({
    queryKey: ["push-subscription", user?.id, pushEndpoint],
    enabled: Boolean(user && pushEndpoint),
    queryFn: async () => {
      const { data, error } = await requireSupabase().from("push_subscriptions")
        .select("id").eq("owner_id", user!.id).eq("endpoint", pushEndpoint).maybeSingle();
      if (error) throw error;
      return Boolean(data);
    },
  });
  const pushSupported = typeof window !== "undefined"
    && window.isSecureContext
    && "serviceWorker" in navigator
    && "PushManager" in window
    && "Notification" in window;

  useEffect(() => {
    if (!pushSupported) return;
    let active = true;
    void navigator.serviceWorker.ready
      .then((registration) => registration.pushManager.getSubscription())
      .then((subscription) => {
        if (active) setPushEndpoint(subscription?.endpoint ?? "");
      })
      .catch((error: unknown) => {
        if (active) setErrorMessage(error instanceof Error ? error.message : "Não foi possível verificar as notificações deste dispositivo.");
      });
    return () => { active = false; };
  }, [pushSupported]);

  async function setPushNotifications(enabled: boolean) {
    if (!user || !pushSupported) return;
    setChangingPush(true);
    setErrorMessage("");
    setFeedback("");
    try {
      const client = requireSupabase();
      const registration = await navigator.serviceWorker.ready;
      let subscription = await registration.pushManager.getSubscription();
      if (enabled) {
        const applicationServerKey = import.meta.env.VITE_WEB_PUSH_PUBLIC_KEY?.trim();
        if (!applicationServerKey) throw new Error("Notificações push não estão configuradas para esta publicação.");
        const permission = Notification.permission === "default"
          ? await Notification.requestPermission()
          : Notification.permission;
        if (permission !== "granted") throw new Error("Permita notificações nas configurações do navegador para ativar o push.");
        if (!subscription) {
          const base64Key = applicationServerKey.replace(/-/g, "+").replace(/_/g, "/");
          const paddedKey = base64Key.padEnd(Math.ceil(base64Key.length / 4) * 4, "=");
          const rawKey = atob(paddedKey);
          const key = Uint8Array.from(rawKey, (character) => character.charCodeAt(0));
          subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
        }
        const serialized = subscription.toJSON();
        const p256dh = serialized.keys?.p256dh;
        const auth = serialized.keys?.auth;
        if (!subscription.endpoint || !p256dh || !auth) throw new Error("O navegador não forneceu os dados necessários para registrar o push.");
        const { error: subscriptionError } = await client.from("push_subscriptions").upsert({
          owner_id: user.id,
          endpoint: subscription.endpoint,
          p256dh,
          auth,
        }, { onConflict: "endpoint" });
        if (subscriptionError) throw subscriptionError;
        const { error: preferenceError } = await client.from("user_preferences")
          .upsert({ user_id: user.id, push_notifications: true }, { onConflict: "user_id" });
        if (preferenceError) throw preferenceError;
        setPushEndpoint(subscription.endpoint);
        setFeedback("Notificações push ativadas neste dispositivo.");
      } else {
        if (subscription) {
          const { error: removeError } = await client.from("push_subscriptions")
            .delete().eq("owner_id", user.id).eq("endpoint", subscription.endpoint);
          if (removeError) throw removeError;
          const unsubscribed = await subscription.unsubscribe();
          if (!unsubscribed) throw new Error("O navegador não confirmou o cancelamento da inscrição push.");
        }
        const { data: remaining, error: remainingError } = await client.from("push_subscriptions")
          .select("id").eq("owner_id", user.id).limit(1);
        if (remainingError) throw remainingError;
        if (!remaining?.length) {
          const { error: preferenceError } = await client.from("user_preferences")
            .upsert({ user_id: user.id, push_notifications: false }, { onConflict: "user_id" });
          if (preferenceError) throw preferenceError;
        }
        setPushEndpoint("");
        setFeedback("Notificações push desativadas neste dispositivo.");
      }
      await queryClient.invalidateQueries({ queryKey: ["push-subscription", user.id] });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Não foi possível atualizar as notificações push.");
    } finally {
      setChangingPush(false);
    }
  }

  async function exportData() {
    if (!user) return;
    setExporting(true);
    setErrorMessage("");
    setFeedback("");
    try {
      const tables = [
        ["profile", "profiles", "id"],
        ["frequent_parties", "frequent_parties", "owner_id"],
        ["contracts", "contracts", "owner_id"],
        ["contract_parties", "contract_parties", "owner_id"],
        ["interview_sessions", "interview_sessions", "owner_id"],
        ["interview_messages", "interview_messages", "owner_id"],
        ["contract_answers", "contract_answers", "owner_id"],
        ["contract_attachments", "contract_attachments", "owner_id"],
        ["contract_signatures", "contract_signatures", "owner_id"],
        ["contract_audit_logs", "contract_audit_logs", "owner_id"],
        ["installments", "installments", "owner_id"],
        ["payment_receipts", "payment_receipts", "owner_id"],
        ["notifications", "notifications", "owner_id"],
        ["user_preferences", "user_preferences", "user_id"],
        ["push_subscriptions", "push_subscriptions", "owner_id"],
        ["sync_operations", "sync_operations", "owner_id"],
        ["consent_records", "consent_records", "owner_id"],
      ] as const;
      const rows = await Promise.all(tables.map(async ([key, table, column]) =>
        [key, await loadOwnedRows(table, column, user.id)] as const
      ));
      const contracts = rows.find(([key]) => key === "contracts")?.[1] ?? [];
      const contractIds = contracts.map((item) => item.id).filter((id): id is string => typeof id === "string");
      let versions: unknown[] = [];
      if (contractIds.length) {
        const { data, error } = await requireSupabase().from("contract_versions")
          .select("*").in("contract_id", contractIds);
        if (error) throw new Error(`Não foi possível exportar versões de contratos: ${error.message}`);
        versions = data ?? [];
      }
      const payload = {
        product: "CONTRATTA AI",
        schema_version: 1,
        exported_at: new Date().toISOString(),
        account: { user_id: user.id, email: user.email ?? null },
        data: { ...Object.fromEntries(rows), contract_versions: versions },
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `contratta-ai-dados-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
      setFeedback("Exportação concluída. O arquivo JSON contém seus registros; os PDFs e anexos privados não estão incluídos.");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Não foi possível exportar seus dados.");
    } finally {
      setExporting(false);
    }
  }

  async function deleteAccount() {
    if (!user || confirmation !== "EXCLUIR") return;
    if (!window.confirm("Excluir permanentemente sua conta, seus registros e arquivos privados? Esta ação não pode ser desfeita.")) return;
    setDeleting(true);
    setErrorMessage("");
    setFeedback("");
    try {
      await clearOfflineUserData(user.id);
      const { error } = await requireSupabase().functions.invoke("delete-account");
      if (error) throw new Error(`A solicitação de exclusão não foi concluída: ${error.message}`);
      const { error: signOutError } = await requireSupabase().auth.signOut({ scope: "local" });
      if (signOutError) throw new Error(`A conta foi excluída, mas não foi possível limpar a sessão local: ${signOutError.message}. Feche o navegador e entre novamente apenas após novo cadastro.`);
      window.location.replace(`${import.meta.env.BASE_URL}login`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Não foi possível excluir a conta.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      <PageTitle eyebrow="PREFERÊNCIAS" title="Configurações e dados" description="Exporte uma cópia dos seus registros ou solicite a exclusão permanente da conta." />
      {errorMessage && <p className="form-message error-message page-message" role="alert">{errorMessage}</p>}
      {feedback && <p className="form-message success-message page-message" role="status">{feedback}</p>}
      <section className="panel data-panel settings-panel">
        <div className="section-heading">
          <div><h2>Notificações push</h2><p>Receba avisos de vencimentos e aceites mesmo quando o aplicativo estiver fechado.</p></div>
          <BellRing size={18} aria-hidden="true" />
        </div>
        {!pushSupported ? <p className="settings-note">Este navegador ou conexão não oferece notificações push. As notificações internas continuam disponíveis no aplicativo.</p> : (
          <div className="settings-action">
            <p className="settings-note">{pushQuery.isLoading ? "Verificando este dispositivo…" : pushQuery.data ? "Ativas neste dispositivo." : "Desativadas neste dispositivo."} A permissão do navegador é solicitada somente quando você ativa.</p>
            <button type="button" className="button button-secondary" disabled={changingPush || pushQuery.isLoading} onClick={() => void setPushNotifications(!pushQuery.data)}>
              {changingPush ? "Atualizando…" : pushQuery.data ? "Desativar neste dispositivo" : "Ativar neste dispositivo"}
            </button>
          </div>
        )}
      </section>
      <section className="panel data-panel settings-panel">
        <div className="section-heading">
          <div><h2>Exportar meus dados</h2><p>Baixe seus dados pessoais e registros em um arquivo JSON legível.</p></div>
          <button type="button" className="button button-secondary" onClick={() => void exportData()} disabled={exporting || !user}>
            <Download size={16} /> {exporting ? "Preparando arquivo…" : "Exportar dados"}
          </button>
        </div>
        <p className="settings-note">O arquivo inclui registros e metadados. PDFs e anexos privados devem ser baixados individualmente nas telas dos contratos.</p>
      </section>
      <section className="panel settings-danger-panel">
        <div className="settings-danger-heading"><ShieldAlert size={18} /><div><h2>Excluir conta e dados</h2><p>A exclusão remove a conta, os registros vinculados e os arquivos privados armazenados pela plataforma.</p></div></div>
        <label className="field-label">Digite <b>EXCLUIR</b> para habilitar a exclusão
          <input className="text-input" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} autoComplete="off" />
        </label>
        <button type="button" className="button button-danger" disabled={confirmation !== "EXCLUIR" || deleting} onClick={() => void deleteAccount()}>
          <Trash2 size={16} /> {deleting ? "Excluindo…" : "Excluir conta permanentemente"}
        </button>
      </section>
    </>
  );
}
