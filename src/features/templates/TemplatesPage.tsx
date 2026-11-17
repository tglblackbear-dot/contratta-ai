import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, FileText, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { EmptyState, PageTitle, QueryState } from "../../components/ui/Page";
import { requireSupabase } from "../../lib/supabase";
import type { ContractTemplate } from "../../types/database";

const categoryNames: Record<string, string> = {
  commercial: "Comercial",
  real_estate: "Imobiliário",
  services: "Serviços",
  finance: "Financeiro",
  other: "Outros",
};

export function TemplatesPage() {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const query = useQuery({
    queryKey: ["templates"],
    queryFn: async () => {
      const { data, error } = await requireSupabase().from("contract_templates")
        .select("id,slug,name,description,category,version,fields,clauses,updated_at")
        .eq("is_active", true).order("name");
      if (error) throw error;
      return (data ?? []) as ContractTemplate[];
    },
  });
  const categories = useMemo(() => [...new Set((query.data ?? []).map((item) => item.category))], [query.data]);
  const filtered = useMemo(() => (query.data ?? []).filter((item) => {
    const matchesText = `${item.name} ${item.description}`.toLocaleLowerCase("pt-BR").includes(search.toLocaleLowerCase("pt-BR"));
    return matchesText && (category === "all" || item.category === category);
  }), [category, query.data, search]);

  return (
    <>
      <PageTitle eyebrow="BIBLIOTECA" title="Modelos de contrato" description="Escolha um ponto de partida. Você revisa todos os dados antes de gerar o documento." />
      <section className="panel data-panel">
        <div className="template-tools">
          <label className="search-field"><Search size={16} /><span className="visually-hidden">Pesquisar modelos</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar modelos" /></label>
          <label className="visually-hidden" htmlFor="template-category">Filtrar categoria</label>
          <select id="template-category" className="select-input filter-select" value={category} onChange={(event) => setCategory(event.target.value)}>
            <option value="all">Todas as categorias</option>
            {categories.map((item) => <option value={item} key={item}>{categoryNames[item] ?? item}</option>)}
          </select>
        </div>
        <QueryState loading={query.isLoading} error={query.error as Error | null}>
          {filtered.length ? <div className="template-grid">
            {filtered.map((template) => (
              <article className="template-card" key={template.id}>
                <span className="template-icon"><FileText size={18} /></span>
                <span className="template-category">{categoryNames[template.category] ?? template.category} · v{template.version}</span>
                <h2>{template.name}</h2>
                <p>{template.description}</p>
                <div className="template-card-foot"><span>{template.fields.filter((field) => field.required).length} informações obrigatórias</span><Link to={`/app/templates/${template.id}`} aria-label={`Ver detalhes do modelo ${template.name}`}><ArrowRight size={16} /></Link></div>
              </article>
            ))}
          </div> : <EmptyState title="Nenhum modelo disponível" message={query.data?.length ? "Tente outra busca ou categoria." : "Os modelos serão carregados quando a migration e os dados iniciais forem aplicados ao Supabase."} />}
        </QueryState>
      </section>
    </>
  );
}

interface TemplateDetails extends ContractTemplate {
  purpose: string;
  reviewed_at: string | null;
  legal_references: string[];
  conditional_rules: Array<{ field?: string; operator?: string; value?: unknown; then?: unknown }>;
}

export function TemplateDetailPage() {
  const { templateId = "" } = useParams();
  const query = useQuery({
    queryKey: ["template", templateId],
    queryFn: async () => {
      const { data, error } = await requireSupabase().from("contract_templates")
        .select("id,slug,name,description,purpose,category,version,fields,clauses,conditional_rules,legal_references,reviewed_at,updated_at")
        .eq("id", templateId).eq("is_active", true).single();
      if (error) throw error;
      return data as TemplateDetails;
    },
    enabled: Boolean(templateId),
  });
  const template = query.data;

  return (
    <>
      <Link to="/app/templates" className="back-link"><ArrowLeft size={15} /> Biblioteca de modelos</Link>
      <QueryState loading={query.isLoading} error={query.error as Error | null}>
        {template && (
          <>
            <PageTitle eyebrow={categoryNames[template.category] ?? template.category} title={template.name} description={template.description} action={<Link className="button button-primary" to={`/app/new-contract?template=${template.slug}`}>Usar este modelo <ArrowRight size={16} /></Link>} />
            <section className="panel template-detail-panel">
              <p>{template.purpose || "Finalidade não detalhada."}</p>
              <div className="template-detail-meta"><span>Versão {template.version}</span><span>{template.reviewed_at ? `Revisado em ${new Date(`${template.reviewed_at}T00:00:00`).toLocaleDateString("pt-BR")}` : "Sem data de revisão registrada"}</span></div>
              <h2>Informações da entrevista</h2>
              <ul>{template.fields.map((field) => <li key={field.key}><b>{field.label}</b><span>{field.required ? "Obrigatória" : "Opcional"}</span></li>)}</ul>
              <h2>Regras condicionais</h2>
              {template.conditional_rules.length ? <ul>{template.conditional_rules.map((rule, index) => <li key={`${rule.field ?? "rule"}-${index}`}>{JSON.stringify(rule)}</li>)}</ul> : <p>Nenhuma regra condicional foi cadastrada neste modelo.</p>}
              <h2>Cláusulas previstas</h2>
              {template.clauses.length ? <ol>{template.clauses.map((clause, index) => <li key={`${clause.title}-${index}`}><b>{clause.title}</b><p>{clause.body}</p></li>)}</ol> : <p>Nenhuma cláusula foi cadastrada neste modelo.</p>}
              <h2>Referências jurídicas</h2>
              {template.legal_references.length ? <ul>{template.legal_references.map((reference) => <li key={reference}>{reference}</li>)}</ul> : <p>Nenhuma referência jurídica foi cadastrada. Revise a adequação do modelo à situação concreta.</p>}
            </section>
          </>
        )}
      </QueryState>
    </>
  );
}
