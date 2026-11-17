import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Pencil, Plus, Search, Trash2, UsersRound } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { EmptyState, PageTitle, QueryState } from "../../components/ui/Page";
import { formatCpfCnpj, partySchema } from "../../lib/validators";
import { requireSupabase } from "../../lib/supabase";
import type { FrequentParty } from "../../types/database";
import type { z } from "zod";

type PartyForm = z.infer<typeof partySchema>;

export function PartiesPage() {
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<FrequentParty | null>(null);
  const [search, setSearch] = useState("");
  const [feedback, setFeedback] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const query = useQuery({
    queryKey: ["parties"],
    queryFn: async () => {
      const { data, error } = await requireSupabase().from("frequent_parties")
        .select("id,owner_id,name,document,email,phone,address,created_at").order("name");
      if (error) throw error;
      return (data ?? []) as FrequentParty[];
    },
  });
  const createMutation = useMutation({
    mutationFn: async (values: PartyForm) => {
      const { data: userData, error: userError } = await requireSupabase().auth.getUser();
      if (userError || !userData.user) throw userError ?? new Error("Sessão não encontrada.");
      const { error } = await requireSupabase().from("frequent_parties").insert({
        owner_id: userData.user.id,
        name: values.name.trim(),
        document: values.document?.replace(/\D/g, "") || null,
        email: values.email?.trim() || null,
        phone: values.phone?.trim() || null,
        address: values.address?.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setErrorMessage("");
      setFeedback("Parte adicionada.");
      setShowForm(false);
      reset();
      void queryClient.invalidateQueries({ queryKey: ["parties"] });
      void queryClient.invalidateQueries({ queryKey: ["parties", "count"] });
      setEditing(null);
    },
    onError: (error) => { setFeedback(""); setErrorMessage(error.message); },
  });
  const updateMutation = useMutation({
    mutationFn: async (values: PartyForm) => {
      if (!editing) throw new Error("Selecione uma parte para editar.");
      const { error } = await requireSupabase().from("frequent_parties").update({
        name: values.name.trim(),
        document: values.document?.replace(/\D/g, "") || null,
        email: values.email?.trim() || null,
        phone: values.phone?.trim() || null,
        address: values.address?.trim() || null,
      }).eq("id", editing.id);
      if (error) throw error;
    },
    onSuccess: () => {
      setErrorMessage("");
      setFeedback("Dados da parte atualizados.");
      setShowForm(false);
      setEditing(null);
      reset();
      void queryClient.invalidateQueries({ queryKey: ["parties"] });
    },
    onError: (error) => { setFeedback(""); setErrorMessage(error.message); },
  });
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await requireSupabase().from("frequent_parties").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["parties"] });
      void queryClient.invalidateQueries({ queryKey: ["parties", "count"] });
    },
    onError: (error) => setErrorMessage(error.message),
  });
  const { register, handleSubmit, reset, formState: { errors } } = useForm<PartyForm>({ resolver: zodResolver(partySchema) });
  useEffect(() => {
    const editId = searchParams.get("edit");
    const party = query.data?.find((item) => item.id === editId);
    if (!editId || !party) return;
    setEditing(party);
    reset({ name: party.name, document: party.document ? formatCpfCnpj(party.document) : "", email: party.email ?? "", phone: party.phone ?? "", address: party.address ?? "" });
    setShowForm(true);
    setSearchParams({}, { replace: true });
  }, [query.data, reset, searchParams, setSearchParams]);
  const parties = (query.data ?? []).filter((party) => party.name.toLocaleLowerCase("pt-BR").includes(search.toLocaleLowerCase("pt-BR")));

  return (
    <>
      <PageTitle eyebrow="CONTATOS" title="Partes frequentes" description="Mantenha os dados de pessoas e empresas com quem você formaliza acordos." action={<button className="button button-primary" onClick={() => { setEditing(null); reset(); setShowForm((open) => !open); setFeedback(""); }}><Plus size={16} /> Adicionar parte</button>} />
      {feedback && <p className="form-message success-message page-message" role="status">{feedback}</p>}
      {errorMessage && <p className="form-message error-message page-message" role="alert">{errorMessage}</p>}
      {showForm && <section className="panel party-form-panel"><div className="section-heading"><div><h2>{editing ? "Editar parte" : "Nova parte"}</h2><p>Os campos são privados e podem ser corrigidos depois.</p></div></div>
        <form className="party-form" onSubmit={handleSubmit((values) => editing ? updateMutation.mutate(values) : createMutation.mutate(values))} noValidate>
          <label className="field-label">Nome completo ou razão social<input className="text-input" {...register("name")} />{errors.name && <span className="field-error">{errors.name.message}</span>}</label>
          <label className="field-label">CPF ou CNPJ <span className="optional-label">opcional</span><input className="text-input" {...register("document", { onChange: (event) => { event.target.value = formatCpfCnpj(event.target.value); } })} />{errors.document && <span className="field-error">{errors.document.message}</span>}</label>
          <label className="field-label">E-mail <span className="optional-label">opcional</span><input className="text-input" type="email" {...register("email")} />{errors.email && <span className="field-error">{errors.email.message}</span>}</label>
          <label className="field-label">Telefone <span className="optional-label">opcional</span><input className="text-input" {...register("phone")} /></label>
          <label className="field-label party-address">Endereço <span className="optional-label">opcional</span><input className="text-input" {...register("address")} /></label>
          <div className="party-form-actions"><button type="button" className="button button-secondary" onClick={() => { setShowForm(false); setEditing(null); reset(); }}>Cancelar</button><button className="button button-primary" disabled={createMutation.isPending || updateMutation.isPending}>{createMutation.isPending || updateMutation.isPending ? "Salvando…" : editing ? "Atualizar parte" : "Salvar parte"}</button></div>
        </form>
      </section>}
      <section className="panel data-panel">
        <div className="filter-row"><label className="search-field"><Search size={16} /><span className="visually-hidden">Pesquisar partes</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por nome" /></label><span className="result-count">{parties.length} cadastradas</span></div>
        <QueryState loading={query.isLoading} error={query.error as Error | null}>
          {parties.length ? <div className="party-list">{parties.map((party) => (
            <article className="party-row" key={party.id}>
              <span className="party-avatar"><UsersRound size={17} /></span><Link className="party-main" to={`/app/parties/${party.id}`}><b>{party.name}</b><small>{[party.document, party.email, party.phone].filter(Boolean).join(" · ") || "Sem dados complementares"}</small></Link>
              <button className="icon-button" aria-label={`Editar ${party.name}`} title="Editar parte" onClick={() => { setEditing(party); reset({ name: party.name, document: party.document ? formatCpfCnpj(party.document) : "", email: party.email ?? "", phone: party.phone ?? "", address: party.address ?? "" }); setShowForm(true); setFeedback(""); }}><Pencil size={15} /></button>
              <button className="icon-button danger-icon" aria-label={`Excluir ${party.name}`} title="Excluir parte" onClick={() => { if (window.confirm(`Excluir ${party.name} das partes frequentes?`)) deleteMutation.mutate(party.id); }}><Trash2 size={16} /></button>
            </article>
          ))}</div> : <EmptyState title={query.data?.length ? "Nenhuma parte encontrada" : "Sua agenda começa aqui"} message={query.data?.length ? "Tente buscar por outro nome." : "Cadastre pessoas ou empresas para selecionar nas próximas entrevistas."} action={!query.data?.length ? <button className="button button-secondary" onClick={() => setShowForm(true)}><Plus size={16} /> Adicionar parte</button> : undefined} />}
        </QueryState>
      </section>
    </>
  );
}

export function PartyDetailPage() {
  const { partyId = "" } = useParams();
  const query = useQuery({
    queryKey: ["party", partyId],
    queryFn: async () => {
      const { data, error } = await requireSupabase().from("frequent_parties")
        .select("id,name,document,email,phone,address,created_at")
        .eq("id", partyId).single();
      if (error) throw error;
      return data as Omit<FrequentParty, "owner_id">;
    },
    enabled: Boolean(partyId),
  });
  const party = query.data;

  return (
    <>
      <Link to="/app/parties" className="back-link">Voltar às partes</Link>
      <QueryState loading={query.isLoading} error={query.error as Error | null}>
        {party && (
          <>
            <PageTitle eyebrow="PARTE FREQUENTE" title={party.name} description="Confira os dados antes de usá-los em um contrato." action={<Link className="button button-primary" to={`/app/parties?edit=${party.id}`}>Editar dados</Link>} />
            <section className="panel party-detail-panel">
              <dl>
                <div><dt>CPF/CNPJ</dt><dd>{party.document ? formatCpfCnpj(party.document) : "Não informado"}</dd></div>
                <div><dt>E-mail</dt><dd>{party.email || "Não informado"}</dd></div>
                <div><dt>Telefone</dt><dd>{party.phone || "Não informado"}</dd></div>
                <div><dt>Endereço</dt><dd>{party.address || "Não informado"}</dd></div>
                <div><dt>Adicionada em</dt><dd>{new Date(party.created_at).toLocaleDateString("pt-BR")}</dd></div>
              </dl>
            </section>
          </>
        )}
      </QueryState>
    </>
  );
}
