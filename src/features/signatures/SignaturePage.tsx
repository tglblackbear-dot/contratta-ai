import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { CheckCircle2, FileCheck2, ShieldAlert } from "lucide-react";
import { useParams } from "react-router-dom";
import { isSupabaseConfigured, requireSupabase } from "../../lib/supabase";

interface SignatureDocument {
  title: string;
  participant_name: string;
  participant_role: string;
  document_version: number;
  document_sha256: string;
  content: string;
  expires_at: string;
}

export function SignaturePage() {
  const { token = "" } = useParams();
  const [consent, setConsent] = useState(false);
  const [acceptedName, setAcceptedName] = useState("");
  const [acceptanceError, setAcceptanceError] = useState("");
  const documentQuery = useQuery({
    queryKey: ["public-signature", token],
    queryFn: async () => {
      const { data, error } = await requireSupabase().functions.invoke("register-acceptance", {
        body: { action: "lookup", token },
      });
      if (error) throw new Error("Este link é inválido, expirou ou já foi utilizado.");
      return data as SignatureDocument;
    },
    enabled: isSupabaseConfigured && /^[a-f0-9]{64}$/i.test(token),
    retry: false,
  });
  const acceptMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await requireSupabase().functions.invoke("register-acceptance", {
        body: { action: "accept", token, accepted: true },
      });
      if (error || !data?.accepted) throw new Error("Não foi possível registrar o aceite. Recarregue o documento e tente novamente.");
      return data as { accepted: true; participant_name: string; accepted_at: string };
    },
    onSuccess: (data) => {
      setAcceptanceError("");
      setAcceptedName(data.participant_name);
    },
    onError: (error) => setAcceptanceError(error.message),
  });

  if (!isSupabaseConfigured) {
    return <PublicState title="Serviço indisponível" message="A conexão com o serviço de documentos não está configurada." />;
  }
  if (!/^[a-f0-9]{64}$/i.test(token)) {
    return <PublicState title="Link inválido" message="Este link de aceite não é válido." />;
  }
  if (acceptedName) {
    return <PublicState success title="Aceite registrado" message={`${acceptedName}, seu aceite foi registrado. Guarde esta confirmação para seus registros.`} />;
  }
  if (documentQuery.isLoading) {
    return <PublicState title="Verificando documento" message="Aguarde enquanto confirmamos o acesso a esta versão." />;
  }
  if (documentQuery.error || !documentQuery.data) {
    return <PublicState title="Documento indisponível" message={documentQuery.error?.message ?? "Este link expirou, é inválido ou já foi utilizado."} />;
  }

  const document = documentQuery.data;
  return (
    <main className="public-sign-page">
      <header className="public-sign-header"><span className="brand-mark">C</span><span><b>contratta</b><small>DOCUMENTO PARA REVISÃO E ACEITE</small></span></header>
      <section className="public-sign-card">
        <div className="sign-card-title"><span className="sign-document-icon"><FileCheck2 size={20} /></span><div><span className="eyebrow">SOLICITAÇÃO DE ACEITE ELETRÔNICO</span><h1>{document.title}</h1><p>Versão {document.document_version} · Para {document.participant_name} · {document.participant_role}</p></div></div>
        <div className="signature-integrity"><ShieldAlert size={16} /><span>SHA-256 do documento: <code>{document.document_sha256}</code></span></div>
        <article className="sign-document-content"><pre>{document.content}</pre></article>
        <p className="signature-legal">Este registro documenta uma manifestação eletrônica de aceite e evidencia a versão apresentada. Ele não equivale automaticamente a uma assinatura qualificada. Leia o documento e procure orientação profissional se tiver dúvidas.</p>
        <label className="consent-check"><input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} /><span>Declaro que li a versão indicada acima e concordo com os termos apresentados para esta solicitação.</span></label>
        {acceptanceError && <p className="form-message error-message" role="alert">{acceptanceError}</p>}
        <button className="button button-primary sign-accept-button" disabled={!consent || acceptMutation.isPending} onClick={() => acceptMutation.mutate()}>{acceptMutation.isPending ? "Registrando aceite…" : "Confirmar meu aceite"} <CheckCircle2 size={17} /></button>
        <p className="sign-expiry">Link válido até {new Date(document.expires_at).toLocaleString("pt-BR")} e utilizável uma única vez.</p>
      </section>
      <p className="public-sign-footer">Contratta AI · Acesse apenas documentos que você reconhece e esperava receber.</p>
    </main>
  );
}

function PublicState({ title, message, success = false }: { title: string; message: string; success?: boolean }) {
  return (
    <main className="public-sign-page public-state-page">
      <header className="public-sign-header"><span className="brand-mark">C</span><span><b>contratta</b><small>DOCUMENTO PARA REVISÃO E ACEITE</small></span></header>
      <section className={`public-state-card${success ? " public-state-success" : ""}`}>
        {success ? <CheckCircle2 size={28} /> : <ShieldAlert size={28} />}
        <h1>{title}</h1><p>{message}</p>
      </section>
      <p className="public-sign-footer">Contratta AI · Acesse apenas documentos que você reconhece e esperava receber.</p>
    </main>
  );
}
