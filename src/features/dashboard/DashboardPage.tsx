import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Check, Clock3, CreditCard, FilePlus2, FileText, Pencil, Plus, Trash2, UsersRound, X } from "lucide-react";
import { Link } from "react-router-dom";
import { useState, type ReactNode } from "react";
import { PageTitle, QueryState, EmptyState } from "../../components/ui/Page";
import { requireSupabase } from "../../lib/supabase";
import { useAuth } from "../auth/AuthProvider";
import type { Contract } from "../../types/database";

export function DashboardPage() {
  const { user } = useAuth();
  const contractsQuery = useQuery({
    queryKey: ["contracts", "dashboard"],
    queryFn: async () => {
      const { data, error } = await requireSupabase()
        .from("contracts")
        .select("id,title,contract_type,status,created_at,updated_at")
        .order("updated_at", { ascending: false })
        .limit(6);
      if (error) throw error;
      return (data ?? []) as Pick<Contract, "id" | "title" | "contract_type" | "status" | "created_at" | "updated_at">[];
    },
  });
  const statsQuery = useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: async () => {
      const client = requireSupabase();
      const results = await Promise.all([
        client.from("contracts").select("id", { count: "exact", head: true }),
        client.from("contracts").select("id", { count: "exact", head: true }).eq("status", "draft"),
        client.from("contracts").select("id", { count: "exact", head: true }).eq("status", "in_progress"),
        client.from("contracts").select("id", { count: "exact", head: true }).eq("status", "awaiting_signature"),
        client.from("contracts").select("id", { count: "exact", head: true }).eq("status", "completed"),
        client.from("installments").select("id", { count: "exact", head: true }).eq("status", "pending"),
      ]);
      const failure = results.find((result) => result.error);
      if (failure?.error) throw failure.error;
      return {
        total: results[0].count ?? 0,
        drafting: (results[1].count ?? 0) + (results[2].count ?? 0),
        awaitingSignature: results[3].count ?? 0,
        completed: results[4].count ?? 0,
        pendingInstallments: results[5].count ?? 0,
      };
    },
  });
  const partiesQuery = useQuery({
    queryKey: ["parties", "count"],
    queryFn: async () => {
      const { count, error } = await requireSupabase()
        .from("frequent_parties")
        .select("id", { count: "exact", head: true });
      if (error) throw error;
      return count ?? 0;
    },
  });
  const creditsQuery = useQuery({
    queryKey: ["credits", user?.id],
    enabled: Boolean(user?.id),
    queryFn: async () => {
      const { data, error } = await requireSupabase().from("user_credits").select("credits").eq("user_id", user!.id).maybeSingle();
      if (error) throw error;
      return data?.credits ?? 0;
    },
  });
  const credits = creditsQuery.data ?? 0;
  const contracts = contractsQuery.data ?? [];
  const displayName = user?.user_metadata?.full_name?.trim().split(/\s+/)[0] || "bem-vindo";

  return (
    <>
      <PageTitle eyebrow="SEU ESPAÇO DE TRABALHO" title={`Olá, ${displayName}.`} description="Vamos formalizar um novo acordo?" action={
        <div className="header-credit-box">
          <div className="header-credit-count"><span>Créditos disponíveis</span><strong>{credits}</strong></div>
          <Link className="button button-primary" to="/app/billing"><Plus size={16} /> Recarregar créditos</Link>
        </div>
      } />
      <section className="credit-info-panel">
        <span className="credit-info-icon"><CreditCard size={22} /></span>
        <div className="credit-info-copy">
          <h2>Como funcionam os créditos</h2>
          <p><strong>1 contrato = 1 crédito.</strong> Cada crédito custa <strong>R$ 6,00</strong> e pode ser recarregado quando quiser.</p>
          <ul>
            <li>O pagamento é feito com segurança pela InfinitePay (cartão ou Pix).</li>
            <li>Assim que o pagamento é confirmado, o crédito aparece aqui automaticamente.</li>
            <li>Seus créditos ficam disponíveis na sua conta até você usá-los.</li>
          </ul>
          <div className="credit-info-actions">
            <Link className="button button-primary" to="/app/billing">Recarregar créditos <ArrowRight size={15} /></Link>
            <a className="button button-secondary" href="https://wa.me/5571999383974" target="_blank" rel="noreferrer">Suporte técnico · Fabio.tec · (71) 99938-3974</a>
          </div>
        </div>
      </section>
      <section className="welcome-panel">
        <div className="welcome-copy">
          <span className="welcome-kicker">CONTRATOS COM MAIS CLAREZA</span>
          <h2>Um bom acordo começa com uma conversa.</h2>
          <p>Conte o que precisa formalizar. Organize as informações e revise cada detalhe antes de gerar o documento.</p>
          <Link className="button button-light" to="/app/new-contract"><FilePlus2 size={17} /> Criar novo contrato <ArrowRight size={16} /></Link>
        </div>
        <div className="welcome-art" aria-hidden="true">
          <div className="art-sheet"><span /><span /><span /><i /><span /></div>
          <div className="art-seal"><FileText size={23} /></div>
          <span className="art-sparkle sparkle-one">✦</span><span className="art-sparkle sparkle-two">✧</span>
        </div>
      </section>

      <QueryState loading={statsQuery.isLoading} error={statsQuery.error as Error | null}>
        <section className="stats-grid" aria-label="Resumo dos seus contratos">
          <StatCard label="Créditos disponíveis" value={credits} icon={<CreditCard size={18} />} tone="violet" to="/app/billing" />
          <StatCard label="Total de contratos" value={statsQuery.data?.total ?? 0} icon={<FileText size={18} />} tone="blue" to="/app/contracts" />
          <StatCard label="Em elaboração" value={statsQuery.data?.drafting ?? 0} icon={<Clock3 size={18} />} tone="amber" to="/app/contracts?status=draft,in_progress" />
          <StatCard label="Aguardando assinatura" value={statsQuery.data?.awaitingSignature ?? 0} icon={<UsersRound size={18} />} tone="violet" to="/app/contracts?status=awaiting_signature" />
          <StatCard label="Concluídos" value={statsQuery.data?.completed ?? 0} icon={<FileText size={18} />} tone="green" to="/app/contracts?status=completed" />
          <StatCard label="Parcelas pendentes" value={statsQuery.data?.pendingInstallments ?? 0} icon={<Clock3 size={18} />} tone="amber" to="/app/finance" />
        </section>
      </QueryState>

      <div className="dashboard-columns">
        <section className="panel recent-panel">
          <div className="section-heading">
            <div><h2>Atividade recente</h2><p>Seus contratos atualizados recentemente.</p></div>
            <Link to="/app/contracts" className="text-link">Ver todos <ArrowRight size={14} /></Link>
          </div>
          <QueryState loading={contractsQuery.isLoading} error={contractsQuery.error as Error | null}>
            {contracts.length ? (
              <div className="contract-list">
                {contracts.map((contract) => <ContractRow key={contract.id} contract={contract} />)}
              </div>
            ) : (
              <EmptyState title="Seu primeiro contrato começa aqui" message="Quando você criar um contrato, poderá acompanhar seu progresso por aqui." action={<Link className="button button-secondary" to="/app/new-contract"><Plus size={16} /> Criar contrato</Link>} />
            )}
          </QueryState>
        </section>
        <aside className="dashboard-side">
          <section className="panel quick-panel">
            <div className="section-heading"><div><h2>Acesso rápido</h2><p>Continue organizando seu espaço.</p></div></div>
            <Link className="quick-link" to="/app/new-contract"><span className="quick-icon quick-blue"><FilePlus2 size={17} /></span><span><b>Novo contrato</b><small>Comece uma entrevista</small></span><ArrowRight size={15} /></Link>
            <Link className="quick-link" to="/app/templates"><span className="quick-icon quick-violet"><FileText size={17} /></span><span><b>Explorar modelos</b><small>Veja tipos de contrato</small></span><ArrowRight size={15} /></Link>
            <Link className="quick-link" to="/app/parties"><span className="quick-icon quick-green"><UsersRound size={17} /></span><span><b>Partes frequentes</b><small>{partiesQuery.data ?? 0} cadastradas</small></span><ArrowRight size={15} /></Link>
            <Link className="quick-link" to="/app/billing"><span className="quick-icon quick-blue"><CreditCard size={17} /></span><span><b>Créditos</b><small>{credits} disponível(is) · contratar mais</small></span><ArrowRight size={15} /></Link>
          </section>
          <div className="privacy-card"><span className="privacy-lock">⌑</span><div><b>Seu espaço é privado</b><p>Seus dados ficam associados à sua conta e protegidos por políticas de acesso.</p></div></div>
        </aside>
      </div>
    </>
  );
}

function StatCard({ label, value, icon, tone, to }: { label: string; value: number; icon: ReactNode; tone: string; to: string }) {
  return <Link to={to} className="stat-card stat-card-link" title={label}><span className={`stat-icon ${tone}`}>{icon}</span><div><strong>{value}</strong><span>{label}</span></div></Link>;
}

export function ContractRow({ contract }: { contract: Pick<Contract, "id" | "title" | "contract_type" | "status" | "updated_at"> }) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(contract.title);
  const [confirming, setConfirming] = useState(false);

  const saveTitle = useMutation({
    mutationFn: async () => {
      const { error } = await requireSupabase().from("contracts").update({ title: title.trim() }).eq("id", contract.id).eq("owner_id", user!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      setEditing(false);
      void queryClient.invalidateQueries({ queryKey: ["contracts"] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
    },
  });

  const remove = useMutation({
    mutationFn: async () => {
      const client = requireSupabase();
      const prefix = `${user!.id}/${contract.id}`;
      const { data: files } = await client.storage.from("contract-documents").list(prefix);
      const paths = (files ?? []).map((file) => `${prefix}/${file.name}`);
      if (paths.length) await client.storage.from("contract-documents").remove(paths);
      const { error } = await client.from("contracts").delete().eq("id", contract.id).eq("owner_id", user!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["contracts"] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
    },
  });

  const statusLabels: Record<Contract["status"], string> = {
    draft: "Rascunho",
    in_progress: "Em elaboração",
    awaiting_signature: "Aguardando assinatura",
    completed: "Concluído",
    cancelled: "Cancelado",
  };

  if (editing) {
    return <div className="contract-row contract-row-editing">
      <form className="contract-edit-form" onSubmit={(event) => { event.preventDefault(); if (title.trim()) saveTitle.mutate(); }}>
        <input className="text-input" value={title} onChange={(event) => setTitle(event.target.value)} autoFocus maxLength={200} aria-label="Nome do contrato" />
        <button className="icon-button" type="submit" disabled={!title.trim() || saveTitle.isPending} title="Salvar"><Check size={16} /></button>
        <button className="icon-button" type="button" onClick={() => { setTitle(contract.title); setEditing(false); }} title="Cancelar"><X size={16} /></button>
      </form>
    </div>;
  }

  return (
    <div className="contract-row">
      <Link to={contract.status === "in_progress" ? `/app/interview/${contract.id}` : `/app/contracts/${contract.id}`} className="contract-row-main-link">
        <span className="contract-file-icon"><FileText size={17} /></span>
        <span className="contract-row-main"><b>{contract.title}</b><small>{contract.contract_type.replaceAll("_", " ")} · Atualizado {new Date(contract.updated_at).toLocaleDateString("pt-BR")}</small></span>
        <span className={`status-pill status-${contract.status}`}>{statusLabels[contract.status]}</span>
        <ArrowRight className="row-arrow" size={15} />
      </Link>
      <div className="contract-row-actions">
        <button className="icon-button" type="button" title="Editar nome" onClick={() => setEditing(true)}><Pencil size={15} /></button>
        <button className="icon-button icon-button-danger" type="button" title="Excluir contrato" onClick={() => setConfirming(true)}><Trash2 size={15} /></button>
      </div>
      {confirming && <div className="contract-confirm">
        <span>Excluir “{contract.title}”? Esta ação não pode ser desfeita.</span>
        <button className="button button-secondary" type="button" onClick={() => setConfirming(false)}>Cancelar</button>
        <button className="button button-danger" type="button" disabled={remove.isPending} onClick={() => remove.mutate()}>{remove.isPending ? "Excluindo…" : "Excluir"}</button>
      </div>}
    </div>
  );
}
