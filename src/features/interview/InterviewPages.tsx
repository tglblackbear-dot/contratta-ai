import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, Check, LoaderCircle, MessageCircle, Mic, Pause, Play, Send, Sparkles } from "lucide-react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { EmptyState, PageTitle, QueryState } from "../../components/ui/Page";
import { interviewResponseSchema } from "../../lib/validators";
import { requireSupabase } from "../../lib/supabase";
import type { ContractTemplate, InterviewMessage, InterviewSession, OfflineInterviewOperation, OfflineInterviewSnapshot } from "../../types/database";
import { DocumentOcr } from "../contracts/DocumentOcr";
import {
  enqueueOfflineInterviewMessage,
  markOfflineInterviewOperationConflict,
  readOfflineInterview,
  removeOfflineInterviewOperation,
  saveOfflineInterview,
} from "../../lib/offlineInterviews";
import { useAuth } from "../auth/AuthProvider";

interface SpeechRecognitionResultEvent extends Event {
  results: ArrayLike<ArrayLike<{ transcript: string }>>;
}

interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: SpeechRecognitionResultEvent) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

export function NewContractPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [templateId, setTemplateId] = useState("");
  const [title, setTitle] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const templatesQuery = useQuery({
    queryKey: ["templates"],
    queryFn: async () => {
      const { data, error } = await requireSupabase().from("contract_templates")
        .select("id,slug,name,description,category,version,fields,clauses,updated_at")
        .eq("is_active", true).order("name");
      if (error) throw error;
      return (data ?? []) as ContractTemplate[];
    },
  });
  const selectedTemplate = templatesQuery.data?.find((template) => template.id === templateId);

  const start = useMutation({
    mutationFn: async () => {
      if (!selectedTemplate) throw new Error("Escolha um modelo para continuar.");
      const { data, error } = await requireSupabase().rpc("start_interview_session", {
        p_template_id: selectedTemplate.id,
        p_title: title.trim() || null,
      });
      if (error) throw new Error(`Não foi possível iniciar a entrevista: ${error.message}`);
      if (typeof data !== "string") throw new Error("O serviço não confirmou a criação da entrevista.");
      return data;
    },
    onSuccess: (id) => navigate(`/app/interview/${id}`),
    onError: (error) => setErrorMessage(error.message),
  });

  const templateFromUrl = searchParams.get("template");
  useEffect(() => {
    if (!templateFromUrl || !templatesQuery.data || templateId) return;
    const match = templatesQuery.data.find((item) => item.slug === templateFromUrl);
    if (match) setTemplateId(match.id);
  }, [templateFromUrl, templateId, templatesQuery.data]);

  return (
    <>
      <Link to="/app" className="back-link"><ArrowLeft size={15} /> Voltar ao início</Link>
      <PageTitle eyebrow="NOVO DOCUMENTO" title="Vamos começar" description="Escolha um modelo como ponto de partida. Você poderá revisar as informações antes de gerar o documento." />
      <QueryState loading={templatesQuery.isLoading} error={templatesQuery.error as Error | null}>
        {templatesQuery.data?.length ? (
          <div className="new-contract-layout">
            <section className="panel new-contract-form">
              <label className="field-label">Qual modelo combina com seu acordo?
                <select className="select-input" value={templateId} onChange={(event) => setTemplateId(event.target.value)}>
                  <option value="">Selecione um modelo</option>
                  {templatesQuery.data.map((template) => <option value={template.id} key={template.id}>{template.name}</option>)}
                </select>
              </label>
              {selectedTemplate && <div className="selected-template"><span className="template-icon"><MessageCircle size={18} /></span><span className="template-category">{selectedTemplate.category.replaceAll("_", " ")}</span><h2>{selectedTemplate.name}</h2><p>{selectedTemplate.description}</p><small>Versão {selectedTemplate.version} · {selectedTemplate.fields.filter((field) => field.required).length} informações obrigatórias</small></div>}
              <label className="field-label">Como deseja identificar este contrato? <span className="optional-label">opcional</span>
                <input className="text-input" value={title} onChange={(event) => setTitle(event.target.value)} placeholder={selectedTemplate?.name ?? "Ex.: Venda da motocicleta"} />
              </label>
              {errorMessage && <p className="form-message error-message" role="alert">{errorMessage}</p>}
              <button className="button button-primary" disabled={!selectedTemplate || start.isPending} onClick={() => start.mutate()}>{start.isPending ? "Preparando entrevista…" : "Iniciar entrevista"} <ArrowRight size={16} /></button>
            </section>
            <aside className="interview-intro-card"><span className="intro-sparkle"><Sparkles size={18} /></span><h2>Uma conversa, no seu ritmo.</h2><p>Conte o que já sabe. A entrevista aproveita as informações que você fornecer e aponta o que ainda precisa ser esclarecido.</p><div className="intro-step"><span>01</span><p><b>Conte sobre o acordo</b><small>Use suas próprias palavras.</small></p></div><div className="intro-step"><span>02</span><p><b>Revise os detalhes</b><small>Confirme as informações importantes.</small></p></div><div className="intro-step"><span>03</span><p><b>Prepare o documento</b><small>Leia tudo antes de exportar.</small></p></div><p className="legal-note">O conteúdo é um ponto de partida e deve ser revisado pelas partes. A plataforma não substitui aconselhamento jurídico.</p></aside>
          </div>
        ) : <EmptyState title="Nenhum modelo disponível" message="Aplique a migration e os dados iniciais do projeto Supabase para habilitar novas entrevistas." action={<Link className="button button-secondary" to="/app/templates">Ver biblioteca de modelos</Link>} />}
      </QueryState>
    </>
  );
}

async function useInterviewCache<T>(
  userId: string | undefined,
  sessionId: string,
  select: (snapshot: OfflineInterviewSnapshot) => T,
  networkError: unknown,
) {
  if (!userId || navigator.onLine) throw networkError;
  try {
    const snapshot = await readOfflineInterview(userId, sessionId);
    if (snapshot) return select(snapshot);
  } catch (cacheError) {
    const reason = cacheError instanceof Error ? cacheError.message : "cache indisponível";
    throw new Error(`Sem conexão e não foi possível ler o cache local: ${reason}`);
  }
  throw networkError;
}

function getFunctionStatus(error: unknown) {
  if (!error || typeof error !== "object" || !("context" in error)) return undefined;
  const context = error.context;
  return context instanceof Response ? context.status : undefined;
}

function isFunctionNetworkError(error: unknown) {
  return Boolean(error && typeof error === "object" && "name" in error && error.name === "FunctionsFetchError");
}

export function InterviewPage() {
  const { sessionId = "" } = useParams();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [draft, setDraft] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [offlineMessage, setOfflineMessage] = useState("");
  const [offlineReady, setOfflineReady] = useState(false);
  const [queuedMessages, setQueuedMessages] = useState<OfflineInterviewOperation[]>([]);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [voiceError, setVoiceError] = useState("");
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const flushingRef = useRef(false);
  useEffect(() => () => recognitionRef.current?.stop(), []);
  useEffect(() => {
    const updateConnection = () => setIsOnline(navigator.onLine);
    window.addEventListener("online", updateConnection);
    window.addEventListener("offline", updateConnection);
    return () => {
      window.removeEventListener("online", updateConnection);
      window.removeEventListener("offline", updateConnection);
    };
  }, []);
  const navigate = useNavigate();
  const sessionKey = ["interview-session", user?.id, sessionId];
  const contractKey = ["contract", user?.id, sessionId];
  const templateKey = ["template", user?.id, sessionId];
  const messagesKey = ["interview-messages", user?.id, sessionId];
  const sessionQuery = useQuery({
    queryKey: sessionKey,
    networkMode: "offlineFirst",
    retry: 0,
    queryFn: async () => {
      try {
        const { data, error } = await requireSupabase().from("interview_sessions")
          .select("id,contract_id,state,fields,missing_fields,progress,version").eq("id", sessionId).single();
        if (error) throw error;
        return data as InterviewSession;
      } catch (error) {
        return useInterviewCache(user?.id, sessionId, (snapshot) => snapshot.session, error);
      }
    },
    enabled: Boolean(sessionId && user?.id),
  });
  const contractQuery = useQuery({
    queryKey: contractKey,
    networkMode: "offlineFirst",
    retry: 0,
    queryFn: async () => {
      try {
        const { data, error } = await requireSupabase().from("contracts")
          .select("id,title,template_id").eq("id", sessionId).single();
        if (error) throw error;
        return data as { id: string; title: string; template_id: string };
      } catch (error) {
        return useInterviewCache(user?.id, sessionId, (snapshot) => snapshot.contract, error);
      }
    },
    enabled: Boolean(sessionId && user?.id),
  });
  const templateQuery = useQuery({
    queryKey: templateKey,
    networkMode: "offlineFirst",
    retry: 0,
    queryFn: async () => {
      try {
        const { data, error } = await requireSupabase().from("contract_templates")
          .select("id,slug,name,description,category,version,fields,clauses,updated_at")
          .eq("id", contractQuery.data!.template_id).single();
        if (error) throw error;
        return data as ContractTemplate;
      } catch (error) {
        return useInterviewCache(user?.id, sessionId, (snapshot) => snapshot.template, error);
      }
    },
    enabled: Boolean(contractQuery.data?.template_id && user?.id),
  });
  const messagesQuery = useQuery({
    queryKey: messagesKey,
    networkMode: "offlineFirst",
    retry: 0,
    queryFn: async () => {
      try {
        const { data, error } = await requireSupabase().from("interview_messages")
          .select("id,session_id,client_operation_id,role,content,created_at").eq("session_id", sessionId).order("created_at");
        if (error) throw error;
        return (data ?? []) as InterviewMessage[];
      } catch (error) {
        return useInterviewCache(user?.id, sessionId, (snapshot) => snapshot.messages, error);
      }
    },
    enabled: Boolean(sessionId && user?.id),
  });
  const session = sessionQuery.data;
  const contract = contractQuery.data;
  const template = templateQuery.data;
  const messages = messagesQuery.data;
  const send = useMutation({
    mutationFn: async (message: string) => {
      if (!session) throw new Error("A entrevista ainda está carregando.");
      if (queuedMessages.length > 0 && isOnline) {
        throw new Error("Aguarde a sincronização das respostas pendentes antes de enviar outra.");
      }
      const operationId = crypto.randomUUID();
      if (!isOnline) {
        if (!user?.id) throw new Error("Entre novamente para salvar respostas offline.");
        const operation = await enqueueOfflineInterviewMessage(user.id, sessionId, message, session.version, operationId);
        return { status: "queued" as const, operation };
      }
      const { data, error } = await requireSupabase().functions.invoke("contract-interview", {
        body: { session_id: sessionId, message, operation_id: operationId, expected_version: session.version },
      });
      if (error) {
        if (user?.id && (!navigator.onLine || isFunctionNetworkError(error))) {
          const operation = await enqueueOfflineInterviewMessage(user.id, sessionId, message, session.version, operationId);
          return { status: "queued" as const, operation };
        }
        throw new Error(`A entrevista não foi processada: ${error.message}`);
      }
      const parsed = interviewResponseSchema.safeParse(data);
      if (!parsed.success) throw new Error("O serviço de entrevista retornou uma resposta inválida. Tente novamente.");
      return { status: "sent" as const, result: parsed.data };
    },
    onSuccess: async (result) => {
      setDraft("");
      setErrorMessage("");
      if (result.status === "queued") {
        setQueuedMessages((current) => [...current, result.operation]);
        setOfflineReady(true);
        setOfflineMessage("Resposta salva neste dispositivo e será sincronizada quando a conexão voltar.");
        return;
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: messagesKey }),
        queryClient.invalidateQueries({ queryKey: sessionKey }),
      ]);
    },
    onError: (error) => setErrorMessage(error.message),
  });
  const generate = useMutation({
    mutationFn: async () => {
      const { data, error } = await requireSupabase().functions.invoke("generate-contract", {
        body: { session_id: sessionId, confirm_fields: true },
      });
      if (error) throw new Error(`O documento não pôde ser preparado: ${error.message}`);
      if (!data?.contract_id) throw new Error("A função não confirmou a criação do documento.");
      return data.contract_id as string;
    },
    onSuccess: (contractId) => navigate(`/app/contracts/${contractId}`),
    onError: (error) => setErrorMessage(error.message),
  });
  const setPaused = useMutation({
    mutationFn: async (pause: boolean) => {
      if (!session || !user?.id) throw new Error("A entrevista ainda está carregando.");
      const nextState = pause
        ? "PAUSED"
        : session.missing_fields.length === 0 ? "READY_TO_GENERATE" : "COLLECTING_CONDITIONS";
      const { data, error } = await requireSupabase().from("interview_sessions")
        .update({
          state: nextState,
          updated_at: new Date().toISOString(),
          version: session.version + 1,
        })
        .eq("id", sessionId)
        .eq("owner_id", user.id)
        .eq("version", session.version)
        .eq("state", pause ? session.state : "PAUSED")
        .select("id")
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("A entrevista mudou em outro dispositivo. Atualize a página antes de continuar.");
    },
    onSuccess: async (_result, pause) => {
      setErrorMessage("");
      if (pause) recognitionRef.current?.stop();
      await queryClient.invalidateQueries({ queryKey: sessionKey });
    },
    onError: (error) => setErrorMessage(error.message),
  });
  const ready = session?.state === "READY_TO_GENERATE";
  const completed = session?.state === "COMPLETED";
  const paused = session?.state === "PAUSED";
  const canSend = Boolean(draft.trim() && !send.isPending && queuedMessages.length === 0 && !completed);

  useEffect(() => {
    if (!user?.id || !session || !contract || !template || !messages) return;
    let active = true;
    void saveOfflineInterview(user.id, { session, contract, template, messages, outbox: [], cached_at: new Date().toISOString() })
      .then(() => {
        if (active) setOfflineReady(true);
      })
      .catch((error: unknown) => {
        if (active) setOfflineMessage(error instanceof Error ? error.message : "Não foi possível preparar o cache offline.");
      });
    return () => { active = false; };
  }, [contract, messages, session, template, user?.id]);

  useEffect(() => {
    if (!user?.id) return;
    let active = true;
    void readOfflineInterview(user.id, sessionId)
      .then((snapshot) => {
        if (active) setQueuedMessages(snapshot?.outbox ?? []);
      })
      .catch((error: unknown) => {
        if (active && !navigator.onLine) setOfflineMessage(error instanceof Error ? error.message : "Não foi possível carregar respostas offline.");
      });
    return () => { active = false; };
  }, [sessionId, user?.id]);

  const flushQueued = useCallback(async () => {
    if (!user?.id || !navigator.onLine || flushingRef.current) return;
    flushingRef.current = true;
    try {
      const snapshot = await readOfflineInterview(user.id, sessionId);
      if (!snapshot?.outbox.length) return;
      setQueuedMessages(snapshot.outbox);
      let synced = 0;
      for (const operation of snapshot.outbox) {
        if (operation.status === "conflict") break;
        if (!navigator.onLine) break;
        const { data, error } = await requireSupabase().functions.invoke("contract-interview", {
          body: {
            session_id: sessionId,
            operation_id: operation.id,
            expected_version: operation.expected_version,
            message: operation.message,
          },
        });
        if (error) {
          if (getFunctionStatus(error) === 409) {
            await markOfflineInterviewOperationConflict(user.id, sessionId, operation.id);
            setQueuedMessages((current) => current.map((item) =>
              item.id === operation.id ? { ...item, status: "conflict" } : item
            ));
            setOfflineMessage("A entrevista mudou em outro dispositivo. Edite e revise a resposta pendente antes de reenviá-la.");
          } else {
            setOfflineMessage(`A sincronização foi adiada: ${error.message}`);
          }
          break;
        }
        if (!interviewResponseSchema.safeParse(data).success) {
          setOfflineMessage("O serviço retornou uma resposta inválida. A resposta continua salva neste dispositivo.");
          break;
        }
        await removeOfflineInterviewOperation(user.id, sessionId, operation.id);
        setQueuedMessages((current) => current.filter((item) => item.id !== operation.id));
        synced += 1;
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ["interview-messages", user.id, sessionId] }),
          queryClient.invalidateQueries({ queryKey: ["interview-session", user.id, sessionId] }),
        ]);
      }
      if (synced > 0) setOfflineMessage(`${synced} ${synced === 1 ? "resposta sincronizada" : "respostas sincronizadas"}.`);
    } catch (error) {
      setOfflineMessage(error instanceof Error ? error.message : "Não foi possível sincronizar as respostas.");
    } finally {
      flushingRef.current = false;
    }
  }, [queryClient, sessionId, user?.id]);

  useEffect(() => {
    void flushQueued();
    window.addEventListener("online", flushQueued);
    return () => window.removeEventListener("online", flushQueued);
  }, [flushQueued]);

  async function editConflictedMessage(operation: OfflineInterviewOperation) {
    if (!user?.id) return;
    try {
      await removeOfflineInterviewOperation(user.id, sessionId, operation.id);
      setQueuedMessages((current) => current.filter((item) => item.id !== operation.id));
      setDraft(operation.message);
      setOfflineMessage("Resposta recuperada no campo. Revise as informações atualizadas antes de enviá-la novamente.");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["interview-session", user.id, sessionId] }),
        queryClient.invalidateQueries({ queryKey: ["interview-messages", user.id, sessionId] }),
      ]);
    } catch (error) {
      setOfflineMessage(error instanceof Error ? error.message : "Não foi possível recuperar a resposta.");
    }
  }

  function submitAnswer() {
    const text = draft.trim();
    if (text && canSend) send.mutate(text);
  }

  function toggleVoiceInput() {
    if (listening) {
      recognitionRef.current?.stop();
      return;
    }
    const speechWindow = window as Window & {
      SpeechRecognition?: SpeechRecognitionConstructor;
      webkitSpeechRecognition?: SpeechRecognitionConstructor;
    };
    const Recognition = speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;
    if (!Recognition) {
      setVoiceError("O reconhecimento de voz não está disponível neste navegador. Você pode responder por texto.");
      return;
    }
    setVoiceError("");
    const recognition = new Recognition();
    recognition.lang = "pt-BR";
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.onresult = (event) => {
      const transcript = event.results[0]?.[0]?.transcript?.trim();
      if (transcript) setDraft((current) => [current.trim(), transcript].filter(Boolean).join(" "));
    };
    recognition.onerror = (event) => {
      setVoiceError(event.error === "not-allowed"
        ? "Permita o acesso ao microfone para usar a voz."
        : "Não foi possível reconhecer a fala. Tente novamente ou responda por texto.");
    };
    recognition.onend = () => setListening(false);
    recognitionRef.current = recognition;
    setListening(true);
    try {
      recognition.start();
    } catch (error) {
      recognitionRef.current = null;
      setListening(false);
      setVoiceError(error instanceof Error ? error.message : "Não foi possível iniciar o microfone.");
    }
  }

  return (
    <>
      <Link to="/app/contracts" className="back-link"><ArrowLeft size={15} /> Meus contratos</Link>
      <QueryState loading={sessionQuery.isLoading || contractQuery.isLoading || templateQuery.isLoading || messagesQuery.isLoading} error={(sessionQuery.error ?? contractQuery.error ?? templateQuery.error ?? messagesQuery.error) as Error | null}>
        {session && contractQuery.data && templateQuery.data && messagesQuery.data && (
          <>
            <PageTitle eyebrow="ENTREVISTA DO CONTRATO" title={contractQuery.data.title} description={templateQuery.data.name} />
            <section className="interview-progress">
              <div><span>Progresso da entrevista</span><b>{Math.min(100, Math.max(0, session.progress))}%</b></div>
              <div className="progress-track"><span style={{ width: `${Math.min(100, Math.max(0, session.progress))}%` }} /></div>
              <small>{session.missing_fields.length ? `${session.missing_fields.length} informações pendentes` : "Informações necessárias reunidas — revise antes de continuar."}</small>
            </section>
            {Array.isArray(templateQuery.data.fields) && <section className="interview-checklist" aria-label="Dados do contrato">
              <h3>Dados do contrato</h3>
              <ul>
                {templateQuery.data.fields.filter((field) => typeof field === "object" && field !== null && "key" in field).map((field) => {
                  const item = field as { key: string; label?: string; required?: boolean };
                  const filled = Object.prototype.hasOwnProperty.call(session.fields, item.key) && Boolean((session.fields as Record<string, unknown>)[item.key]);
                  return <li key={item.key} className={filled ? "check-done" : "check-pending"}>
                    <span aria-hidden="true">{filled ? "✓" : "○"}</span>
                    <span>{item.label ?? item.key.replaceAll("_", " ")}{item.required ? " (obrigatório)" : " (opcional)"}</span>
                  </li>;
                })}
              </ul>
            </section>}
            {!isOnline && <p className="offline-banner" role="status">{offlineReady ? "Sem conexão. Esta entrevista está disponível neste dispositivo; novas respostas serão sincronizadas quando você voltar a ficar online." : "Sem conexão e sem uma cópia local desta entrevista. Conecte-se à internet para carregá-la."}</p>}
            {offlineMessage && <div className="offline-message" role="status"><span>{offlineMessage}</span>{isOnline && queuedMessages.length > 0 && <button type="button" onClick={() => void flushQueued()}>Tentar sincronizar</button>}</div>}
            <section className="panel chat-panel" aria-label="Entrevista do contrato">
              <div className="chat-heading"><span className="assistant-avatar"><Sparkles size={16} /></span><div><b>Assistente Contratta</b><small>As respostas são analisadas para organizar os dados do acordo.</small></div><span className="chat-secure"><span className="secure-dot" /> Privado</span>{!completed && <button type="button" className="button button-secondary" disabled={!isOnline || queuedMessages.length > 0 || setPaused.isPending} onClick={() => setPaused.mutate(!paused)}>{paused ? <Play size={15} /> : <Pause size={15} />}{setPaused.isPending ? " Salvando…" : paused ? " Retomar" : " Pausar"}</button>}</div>
              {paused && <p className="offline-banner" role="status">Entrevista pausada. Suas informações foram salvas; retome para continuar.</p>}
              <div className="chat-history" aria-live="polite">
                {messagesQuery.data.map((message) => (
                  <div className={`chat-message message-${message.role}`} key={message.id}>
                    {message.role === "assistant" && <span className="message-avatar"><Sparkles size={13} /></span>}
                    <div className="message-bubble">
                      {message.role === "assistant" && message.content.startsWith("{") ? <AssistantReply content={message.content} fields={templateQuery.data.fields} /> : <p>{message.content}</p>}
                      <time>{new Date(message.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</time>
                    </div>
                  </div>
                ))}
                {queuedMessages.map((operation) => (
                  <div className="chat-message message-user" key={operation.id}>
                    <div className="message-bubble">
                      <p>{operation.message}</p>
                      <small className={operation.status === "conflict" ? "offline-conflict" : "offline-queued"}>
                        {operation.status === "conflict" ? "Conflito: precisa ser revisada" : "Salva neste dispositivo · aguardando sincronização"}
                      </small>
                      {operation.status === "conflict" && <button type="button" className="offline-edit-button" onClick={() => void editConflictedMessage(operation)}>Recuperar para revisar</button>}
                    </div>
                  </div>
                ))}
                {send.isPending && <div className="chat-message message-assistant"><span className="message-avatar"><Sparkles size={13} /></span><div className="message-bubble typing"><LoaderCircle size={14} className="spin" /> Analisando sua resposta…</div></div>}
              </div>
              {ready && <div className="review-summary"><div className="review-summary-title"><Check size={17} /><div><b>Revise as informações reunidas</b><span>Ao confirmar, você autoriza preparar o rascunho para revisão.</span></div></div>
                <dl>{Object.entries(session.fields).map(([key, value]) => <div key={key}><dt>{key.replaceAll("_", " ")}</dt><dd>{typeof value === "string" ? value : JSON.stringify(value)}</dd></div>)}</dl>
                {session.missing_fields.length > 0 && <p className="field-error">Ainda faltam: {session.missing_fields.join(", ")}</p>}
                <button className="button button-primary" disabled={!isOnline || queuedMessages.length > 0 || generate.isPending || session.missing_fields.length > 0} onClick={() => generate.mutate()}>{generate.isPending ? "Preparando documento…" : !isOnline ? "Conecte-se para preparar o rascunho" : "Confirmar informações e preparar rascunho"} <ArrowRight size={16} /></button>
              </div>}
              {errorMessage && <p className="form-message error-message chat-error" role="alert">{errorMessage}</p>}
              {voiceError && <p className="voice-notice" role="status">{voiceError}</p>}
              {completed && <div className="interview-complete-note"><Check size={16} /><span>Entrevista concluída.</span><Link to={`/app/contracts/${session.contract_id}`}>Abrir o documento</Link></div>}
              {!completed && !paused && isOnline && <DocumentOcr contractId={session.contract_id} onUseText={(text) => setDraft((current) => [current.trim(), text].filter(Boolean).join("\n"))} />}
              {!completed && !paused && !isOnline && <p className="offline-caption">O OCR precisa de conexão. Você ainda pode escrever respostas e sincronizá-las depois.</p>}
              {!completed && !paused && <form className="chat-composer" onSubmit={(event) => { event.preventDefault(); submitAnswer(); }}>
                <label className="visually-hidden" htmlFor="interview-answer">{ready ? "Correção das informações" : "Sua resposta"}</label>
                <textarea id="interview-answer" rows={2} maxLength={4000} value={draft} onChange={(event) => setDraft(event.target.value)} placeholder={ready ? "Quer corrigir algum detalhe? Escreva a correção antes de confirmar…" : "Escreva sua resposta. Você pode incluir vários detalhes…"} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); submitAnswer(); } }} />
                <div className="composer-foot"><small>{isOnline ? "Enter para enviar · Shift + Enter para nova linha" : "Resposta protegida neste dispositivo até a conexão voltar."}</small><div className="composer-actions"><button type="button" className={`voice-button${listening ? " voice-listening" : ""}`} onClick={toggleVoiceInput} aria-label={listening ? "Parar reconhecimento de voz" : "Responder por voz"} aria-pressed={listening}><Mic size={16} />{listening ? "Ouvindo…" : "Voz"}</button><button className="button button-primary send-button" aria-label="Enviar resposta" disabled={!canSend}><Send size={16} />{isOnline ? " Enviar" : " Salvar offline"}</button></div></div>
              </form>}
              <p className="chat-disclaimer">Revise todas as informações e o documento gerado. A assistência automatizada não substitui orientação jurídica profissional.</p>
            </section>
          </>
        )}
      </QueryState>
    </>
  );
}

function fieldLabels(fields: unknown): Record<string, string> {
  const labels: Record<string, string> = {};
  if (!Array.isArray(fields)) return labels;
  for (const field of fields) {
    if (typeof field !== "object" || field === null) continue;
    const key = (field as { key?: unknown }).key;
    const label = (field as { label?: unknown }).label;
    if (typeof key === "string" && typeof label === "string") labels[key] = label;
  }
  return labels;
}

function AssistantReply({ content, fields }: { content: string; fields: unknown }) {
  let decoded: unknown;
  try {
    decoded = JSON.parse(content);
  } catch {
    return <p>A resposta da entrevista não pôde ser lida. Tente novamente.</p>;
  }
  const parsed = interviewResponseSchema.safeParse(decoded);
  if (!parsed.success) return <p>As informações foram analisadas. Confira os dados reunidos antes de continuar.</p>;
  const labels = fieldLabels(fields);
  const pending = parsed.data.missing_fields.map((key) => labels[key] ?? key.replaceAll("_", " "));
  return (
    <div className="assistant-reply">
      <strong className="assistant-question-label">Próxima pergunta</strong>
      <p>{parsed.data.next_question ?? "As informações necessárias foram reunidas. Revise o resumo antes de preparar o rascunho."}</p>
      {pending.length > 0 && <small className="assistant-pending">Ainda precisamos de: {pending.join(", ")}.</small>}
      {parsed.data.validation_warnings.map((warning) => <p className="interview-warning" key={warning}>{warning}</p>)}
    </div>
  );
}
