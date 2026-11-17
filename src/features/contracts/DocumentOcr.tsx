import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileImage, LoaderCircle, Trash2, Upload } from "lucide-react";
import { requireSupabase } from "../../lib/supabase";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

interface OcrResult {
  extracted_text: string;
  suggested_fields: Array<{ label: string; value: string }>;
}

interface Attachment {
  id: string;
  original_name: string;
  mime_type: string;
  byte_size: number;
  ocr_status: "not_requested" | "pending" | "processing" | "completed" | "failed";
  ocr_result: OcrResult | null;
  created_at: string;
}

interface DocumentOcrProps {
  contractId: string;
  onUseText: (text: string) => void;
}

const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const maxBytes = 10 * 1024 * 1024;
const maxPdfPages = 10;

async function prepareOcrImages(file: File) {
  if (file.type !== "application/pdf") return [file];
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
  const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  try {
    if (pdf.numPages > maxPdfPages) throw new Error(`O PDF tem ${pdf.numPages} páginas. O limite por envio é ${maxPdfPages}.`);
    const images: File[] = [];
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const initialViewport = page.getViewport({ scale: 1 });
      const scale = Math.min(1.75, 1600 / Math.max(initialViewport.width, initialViewport.height));
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const context = canvas.getContext("2d", { alpha: false });
      if (!context) throw new Error("Não foi possível preparar uma página do PDF para leitura.");
      await page.render({ canvasContext: context, viewport }).promise;
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((result) => result ? resolve(result) : reject(new Error("Não foi possível converter uma página do PDF.")), "image/jpeg", 0.82);
      });
      canvas.width = 0;
      canvas.height = 0;
      if (blob.size > maxBytes) throw new Error(`A página ${pageNumber} excede o limite de 10 MB após a conversão.`);
      images.push(new File([blob], `${file.name.slice(0, 220)} - página ${pageNumber}.jpg`, { type: "image/jpeg" }));
      page.cleanup();
    }
    return images;
  } finally {
    await pdf.destroy();
  }
}

export function DocumentOcr({ contractId, onUseText }: DocumentOcrProps) {
  const client = requireSupabase();
  const queryClient = useQueryClient();
  const [selectedValues, setSelectedValues] = useState<Record<string, boolean>>({});
  const [message, setMessage] = useState("");
  const attachmentsQuery = useQuery({
    queryKey: ["contract-attachments", contractId],
    queryFn: async () => {
      const { data, error } = await client.from("contract_attachments")
        .select("id,original_name,mime_type,byte_size,ocr_status,ocr_result,created_at")
        .eq("contract_id", contractId).order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Attachment[];
    },
  });

  const process = useMutation({
    mutationFn: async ({ file, attachmentId }: { file?: File; attachmentId?: string }) => {
      const { data: authData, error: authError } = await client.auth.getUser();
      if (authError || !authData.user) throw authError ?? new Error("Sessão não encontrada.");
      let id = attachmentId;
      if (file) {
        if (!allowedTypes.has(file.type) && file.type !== "application/pdf") throw new Error("Escolha uma imagem JPEG, PNG, WebP ou um PDF.");
        if (file.size < 1 || file.size > maxBytes) throw new Error("O arquivo deve ter até 10 MB.");
        const images = await prepareOcrImages(file);
        for (const image of images) {
          if (!allowedTypes.has(image.type)) throw new Error("A página convertida não tem um formato de imagem permitido.");
          const extension = image.type === "image/jpeg" ? "jpg" : image.type === "image/png" ? "png" : "webp";
          const path = `${authData.user.id}/${contractId}/${crypto.randomUUID()}.${extension}`;
          const { error: uploadError } = await client.storage.from("ocr-private").upload(path, image, {
            contentType: image.type,
            upsert: false,
          });
          if (uploadError) throw uploadError;
          const { data: inserted, error: insertError } = await client.from("contract_attachments").insert({
            contract_id: contractId,
            owner_id: authData.user.id,
            storage_path: path,
            original_name: image.name.slice(0, 255),
            mime_type: image.type,
            byte_size: image.size,
            ocr_status: "pending",
          }).select("id").single();
          if (insertError) {
            const { error: cleanupError } = await client.storage.from("ocr-private").remove([path]);
            if (cleanupError) throw new Error(`O upload falhou e a limpeza do arquivo também falhou: ${cleanupError.message}`);
            throw insertError;
          }
          id = inserted.id;
          const { data, error } = await client.functions.invoke("document-ocr", {
            body: { contract_id: contractId, attachment_id: id },
          });
          if (error) throw new Error(`O OCR da página "${image.name}" não foi concluído: ${error.message}`);
          if (!data?.result) throw new Error("O serviço de OCR não retornou os dados esperados.");
        }
      }
      if (!id) throw new Error("Selecione uma imagem para processar.");
      if (attachmentId) {
        const { data, error } = await client.functions.invoke("document-ocr", {
          body: { contract_id: contractId, attachment_id: attachmentId },
        });
        if (error) throw new Error(`O OCR não foi concluído: ${error.message}`);
        if (!data?.result) throw new Error("O serviço de OCR não retornou os dados esperados.");
      }
      return true;
    },
    onSuccess: async () => {
      setMessage("Imagem processada. Confira cada campo antes de usá-lo.");
      await queryClient.invalidateQueries({ queryKey: ["contract-attachments", contractId] });
    },
    onError: (error) => setMessage(error.message),
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: ["contract-attachments", contractId] });
    },
  });

  const remove = useMutation({
    mutationFn: async (attachment: Attachment) => {
      const { data, error } = await client.from("contract_attachments")
        .select("storage_path").eq("id", attachment.id).eq("contract_id", contractId).single();
      if (error) throw error;
      const { error: storageError } = await client.storage.from("ocr-private").remove([data.storage_path]);
      if (storageError) throw storageError;
      const { error: rowError } = await client.from("contract_attachments")
        .delete().eq("id", attachment.id).eq("contract_id", contractId);
      if (rowError) throw rowError;
    },
    onSuccess: async () => {
      setMessage("Imagem e resultado removidos.");
      await queryClient.invalidateQueries({ queryKey: ["contract-attachments", contractId] });
    },
    onError: (error) => setMessage(error.message),
  });

  function useSelected(attachmentId: string, result: OcrResult) {
    const chosen = result.suggested_fields.filter((field) => selectedValues[`${attachmentId}:${field.label}`]);
    const text = chosen.map((field) => `${field.label}: ${field.value}`).join("\n");
    const fullText = selectedValues[`${attachmentId}:__full_text`] && result.extracted_text
      ? [text, result.extracted_text].filter(Boolean).join("\n")
      : text;
    if (!fullText) {
      setMessage("Selecione ao menos um campo ou o texto completo para usar na entrevista.");
      return;
    }
    onUseText(fullText);
    setMessage("Dados selecionados adicionados ao campo da entrevista; revise antes de enviar.");
  }

  return (
    <section className="panel ocr-panel" aria-label="Leitura de documentos">
      <div className="section-heading">
        <div><h2>Ler dados de uma imagem ou PDF</h2><p>Envie uma imagem de até 10 MB ou um PDF de até 10 páginas. As páginas são enviadas ao provedor de IA configurado; revise as sugestões antes de usá-las.</p></div>
      </div>
      <label className="button button-secondary ocr-upload">
        <Upload size={15} /> Fotografar ou selecionar
        <input
          className="ocr-file-input"
          type="file"
          accept="image/jpeg,image/png,image/webp,application/pdf"
          capture="environment"
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            event.currentTarget.value = "";
            if (file) {
              setMessage("");
              process.mutate({ file });
            }
          }}
          disabled={process.isPending}
        />
      </label>
      {process.isPending && <p className="ocr-status" role="status"><LoaderCircle size={14} className="spin" /> Lendo a imagem…</p>}
      {message && <p className="ocr-message" role="status">{message}</p>}
      {attachmentsQuery.error && <p className="form-message error-message" role="alert">{attachmentsQuery.error.message}</p>}
      {attachmentsQuery.data?.map((attachment) => (
        <article className="ocr-attachment" key={attachment.id}>
          <div className="ocr-attachment-heading">
            <FileImage size={17} />
            <div><b>{attachment.original_name}</b><small>{(attachment.byte_size / 1024).toFixed(0)} KB · {new Date(attachment.created_at).toLocaleDateString("pt-BR")}</small></div>
            <button type="button" className="ocr-delete" aria-label={`Excluir ${attachment.original_name}`} disabled={remove.isPending} onClick={() => remove.mutate(attachment)}><Trash2 size={15} /></button>
          </div>
          {attachment.ocr_status === "completed" && attachment.ocr_result ? (
            <div className="ocr-result">
              {attachment.ocr_result.extracted_text && <label className="ocr-choice"><input type="checkbox" checked={Boolean(selectedValues[`${attachment.id}:__full_text`])} onChange={(event) => setSelectedValues((current) => ({ ...current, [`${attachment.id}:__full_text`]: event.target.checked }))} /><span><b>Texto completo</b><small>{attachment.ocr_result.extracted_text}</small></span></label>}
              {attachment.ocr_result.suggested_fields.map((field) => (
                <label className="ocr-choice" key={`${attachment.id}-${field.label}`}>
                  <input type="checkbox" checked={Boolean(selectedValues[`${attachment.id}:${field.label}`])} onChange={(event) => setSelectedValues((current) => ({ ...current, [`${attachment.id}:${field.label}`]: event.target.checked }))} />
                  <span><b>{field.label}</b><small>{field.value}</small></span>
                </label>
              ))}
              <button type="button" className="button button-secondary" onClick={() => useSelected(attachment.id, attachment.ocr_result!)}>Usar selecionados na entrevista</button>
            </div>
          ) : (
            <div className="ocr-pending">
              <span>{attachment.ocr_status === "processing" ? "Processando…" : attachment.ocr_status === "failed" ? "Falha no processamento." : "Aguardando leitura."}</span>
              <button type="button" className="button button-secondary" disabled={process.isPending} onClick={() => process.mutate({ attachmentId: attachment.id })}>{attachment.ocr_status === "failed" ? "Tentar novamente" : "Processar OCR"}</button>
            </div>
          )}
        </article>
      ))}
    </section>
  );
}
