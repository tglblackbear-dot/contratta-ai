import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, Download, FileText } from "lucide-react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { EmptyState, PageTitle, QueryState } from "../../components/ui/Page";
import { ContractRow } from "../dashboard/DashboardPage";
import { requireSupabase } from "../../lib/supabase";
import { AUTHORSHIP_PHRASE, verifyAuthorship } from "../../lib/attribution";
import type { Contract } from "../../types/database";

export function ContractsPage() {
  const [searchParams] = useSearchParams();
  const [filter, setFilter] = useState(searchParams.get("status") ?? "all");
  const query = useQuery({
    queryKey: ["contracts"],
    queryFn: async () => {
      const { data, error } = await requireSupabase().from("contracts")
        .select("id,title,contract_type,status,created_at,updated_at")
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Pick<Contract, "id" | "title" | "contract_type" | "status" | "created_at" | "updated_at">[];
    },
  });
  const filtered = useMemo(() => {
    if (filter === "all") return query.data ?? [];
    const statuses = filter.split(",");
    return (query.data ?? []).filter((item) => statuses.includes(item.status));
  }, [filter, query.data]);

  return (
    <>
      <PageTitle eyebrow="DOCUMENTOS" title="Meus contratos" description="Acompanhe seus rascunhos e documentos." action={<Link className="button button-primary" to="/app/new-contract"><FileText size={16} /> Criar contrato</Link>} />
      <section className="panel data-panel">
        <div className="filter-row">
          <label className="visually-hidden" htmlFor="contract-filter">Filtrar por status</label>
          <select id="contract-filter" className="select-input filter-select" value={filter} onChange={(event) => setFilter(event.target.value)}>
            <option value="all">Todos os status</option>
            <option value="draft">Rascunho</option>
            <option value="in_progress">Em elaboração</option>
            <option value="awaiting_signature">Aguardando assinatura</option>
            <option value="completed">Concluídos</option>
            <option value="cancelled">Cancelados</option>
          </select>
          <span className="result-count">{filtered.length} {filtered.length === 1 ? "contrato" : "contratos"}</span>
        </div>
        <QueryState loading={query.isLoading} error={query.error as Error | null}>
          {filtered.length ? <div className="contract-list">{filtered.map((contract) => <ContractRow key={contract.id} contract={contract} />)}</div> : <EmptyState title="Nenhum contrato encontrado" message={filter === "all" ? "Crie seu primeiro contrato para começar a organizar seus acordos." : "Não há contratos com este status."} action={filter === "all" ? <Link className="button button-secondary" to="/app/new-contract">Criar contrato</Link> : undefined} />}
        </QueryState>
      </section>
    </>
  );
}

export function ContractDetailPage() {
  const { contractId = "" } = useParams();
  const queryClient = useQueryClient();
  const [feedback, setFeedback] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [signatureError, setSignatureError] = useState("");
  const [signatureUrl, setSignatureUrl] = useState("");
  const [pdfUrl, setPdfUrl] = useState("");
  const [participantName, setParticipantName] = useState("");
  const [participantEmail, setParticipantEmail] = useState("");
  const [participantRole, setParticipantRole] = useState("Parte");
  const query = useQuery({
    queryKey: ["contract", contractId],
    queryFn: async () => {
      const { data, error } = await requireSupabase().from("contracts").select("*").eq("id", contractId).single();
      if (error) throw error;
      return data as Contract;
    },
    enabled: Boolean(contractId),
  });
  const versionsQuery = useQuery({
    queryKey: ["contract-versions", contractId],
    queryFn: async () => {
      const { data, error } = await requireSupabase().from("contract_versions")
        .select("id,version,created_at").eq("contract_id", contractId).order("version", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: Boolean(contractId),
  });

  const pdfMutation = useMutation({
    mutationFn: async (contract: Contract) => {
      if (!contract.content?.trim()) throw new Error("Este contrato ainda não tem conteúdo aprovado para exportar.");
      if (!(await verifyAuthorship())) throw new Error("A validação de integridade do documento falhou.");
      const { jsPDF } = await import("jspdf");
      const supabase = requireSupabase();
      const document = new jsPDF({ unit: "mm", format: "a4", compress: true });
      document.setProperties({
        title: contract.title,
        subject: `Documento Contratta AI | ${AUTHORSHIP_PHRASE}`,
        author: "Contratta AI",
        creator: "Contratta AI",
      });
      document.setFont("helvetica", "bold");
      document.setFontSize(18);
      document.text("CONTRATTA AI", 20, 20);
      document.setFont("helvetica", "normal");
      document.setFontSize(10);
      document.text(contract.title, 20, 30, { maxWidth: 170 });
      document.setDrawColor(226, 232, 240);
      document.line(20, 36, 190, 36);
      document.setFontSize(11);
      const lines = document.splitTextToSize(contract.content, 170) as string[];
      let y = 47;
      for (const line of lines) {
        if (y > 270) {
          document.addPage();
          y = 22;
        }
        document.text(line, 20, y);
        y += 6;
      }
      const pageCount = document.getNumberOfPages();
      for (let page = 1; page <= pageCount; page += 1) {
        document.setPage(page);
        document.setFontSize(9);
        document.setTextColor(100, 116, 139);
        document.text(`Versão gerada em ${new Date().toLocaleDateString("pt-BR")} · Página ${page} de ${pageCount}`, 20, 286);
      }
      const blob = document.output("blob");
      const digest = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
      const sha256 = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError || !userData.user) throw userError ?? new Error("Sessão não encontrada.");
      const { data: versionRows, error: versionsError } = await supabase
        .from("contract_versions").select("version").eq("contract_id", contract.id).order("version", { ascending: false }).limit(1);
      if (versionsError) throw versionsError;
      const version = (versionRows?.[0]?.version ?? 0) + 1;
      const filePath = `${userData.user.id}/${contract.id}/v${version}.pdf`;
      const { error: uploadError } = await supabase.storage.from("contract-documents").upload(filePath, blob, {
        contentType: "application/pdf",
        upsert: false,
      });
      if (uploadError) throw uploadError;
      const { error: insertError } = await supabase.from("contract_versions").insert({
        contract_id: contract.id,
        version,
        rendered_content: contract.content,
        sha256,
        file_path: filePath,
      });
      if (insertError) {
        await supabase.storage.from("contract-documents").remove([filePath]);
        throw insertError;
      }
      const { data: signed, error: signedError } = await supabase.storage
        .from("contract-documents").createSignedUrl(filePath, 60);
      if (signedError) throw signedError;
      return { signedUrl: signed.signedUrl, sha256, version };
    },
    onSuccess: ({ signedUrl, sha256, version }) => {
      setErrorMessage("");
      setPdfUrl(signedUrl);
      setFeedback(`PDF da versão ${version} salvo com SHA-256 ${sha256.slice(0, 16)}…`);
      void queryClient.invalidateQueries({ queryKey: ["contract", contractId] });
      void queryClient.invalidateQueries({ queryKey: ["contract-versions", contractId] });
    },
    onError: (error) => {
      setFeedback("");
      setErrorMessage(error.message);
    },
  });
  const signatureMutation = useMutation({
    mutationFn: async () => {
      const latestVersion = versionsQuery.data?.[0];
      if (!latestVersion) throw new Error("Gere um PDF antes de criar um link de aceite.");
      const { data, error } = await requireSupabase().functions.invoke("create-signature-link", {
        body: {
          contract_id: contractId,
          version_id: latestVersion.id,
          participant_name: participantName.trim(),
          participant_email: participantEmail.trim(),
          participant_role: participantRole.trim(),
        },
      });
      if (error || !data?.url) throw new Error("Não foi possível criar o link de aceite.");
      return data.url as string;
    },
    onSuccess: (url) => {
      setSignatureError("");
      setSignatureUrl(url);
      setParticipantName("");
      setParticipantEmail("");
    },
    onError: (error) => { setSignatureUrl(""); setSignatureError(error.message); },
  });

  return (
    <>
      <Link to="/app/contracts" className="back-link"><ArrowLeft size={15} /> Voltar aos contratos</Link>
      <QueryState loading={query.isLoading} error={query.error as Error | null}>
        {query.data && (
          <>
            <PageTitle eyebrow="DETALHES DO DOCUMENTO" title={query.data.title} description={`Tipo: ${query.data.contract_type.replaceAll("_", " ")} · Criado em ${new Date(query.data.created_at).toLocaleDateString("pt-BR")}`} action={
              query.data.content ? <button className="button button-primary" onClick={() => pdfMutation.mutate(query.data!)} disabled={pdfMutation.isPending}><Download size={16} /> {pdfMutation.isPending ? "Preparando PDF…" : "Exportar PDF"}</button> : <Link className="button button-primary" to={`/app/interview/${query.data.id}`}>Continuar entrevista <ArrowRight size={16} /></Link>
            } />
            {errorMessage && <p className="form-message error-message" role="alert">{errorMessage}</p>}
            {feedback && <p className="form-message success-message" role="status">{feedback}</p>}
            {pdfUrl && <p className="pdf-link-notice"><a href={pdfUrl} target="_blank" rel="noreferrer">Abrir PDF privado recém-gerado</a><span>O link expira em 60 segundos.</span></p>}
            <section className="panel document-panel">
              <div className="document-panel-heading"><FileText size={18} /><div><b>Conteúdo do contrato</b><span>Revise as informações antes de compartilhar ou formalizar.</span></div></div>
              {query.data.content ? <pre className="contract-document">{query.data.content}</pre> : <EmptyState title="Entrevista em andamento" message="O documento será preparado depois da revisão das informações da entrevista." action={<Link className="button button-secondary" to={`/app/interview/${query.data.id}`}>Retomar entrevista</Link>} />}
            </section>
            {query.data.content && (
              <section className="panel signature-panel">
                <div className="section-heading"><div><h2>Solicitar aceite eletrônico</h2><p>O link autoriza acesso somente a esta versão e pode ser usado uma vez.</p></div></div>
                <QueryState loading={versionsQuery.isLoading} error={versionsQuery.error as Error | null}>
                  {versionsQuery.data?.length ? (
                    <form className="signature-form" onSubmit={(event) => { event.preventDefault(); signatureMutation.mutate(); }}>
                      <p className="signature-version-note">A versão {versionsQuery.data[0].version} será vinculada ao convite.</p>
                      <label className="field-label">Nome completo do participante<input className="text-input" value={participantName} onChange={(event) => setParticipantName(event.target.value)} required maxLength={200} /></label>
                      <label className="field-label">E-mail <span className="optional-label">opcional</span><input className="text-input" type="email" value={participantEmail} onChange={(event) => setParticipantEmail(event.target.value)} /></label>
                      <label className="field-label">Papel no acordo<input className="text-input" value={participantRole} onChange={(event) => setParticipantRole(event.target.value)} required maxLength={80} /></label>
                      {signatureError && <p className="form-message error-message signature-feedback" role="alert">{signatureError}</p>}
                      <button className="button button-primary signature-submit" disabled={signatureMutation.isPending || !participantName.trim() || !participantRole.trim()}>{signatureMutation.isPending ? "Criando link…" : "Criar link de aceite"}</button>
                      {signatureUrl && <div className="signature-link-result"><span>Link de uso único — compartilhe apenas com o participante indicado:</span><a href={signatureUrl} target="_blank" rel="noreferrer">{signatureUrl}</a><button type="button" className="button button-secondary" onClick={async () => { try { await navigator.clipboard.writeText(signatureUrl); setSignatureError(""); } catch { setSignatureError("Não foi possível copiar o link neste navegador."); } }}>Copiar link</button></div>}
                    </form>
                  ) : <p className="signature-version-note">Gere um PDF privado desta versão antes de criar um convite de aceite.</p>}
                </QueryState>
              </section>
            )}
          </>
        )}
      </QueryState>
    </>
  );
}
