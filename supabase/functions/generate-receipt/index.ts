import { PDFDocument, StandardFonts } from "npm:pdf-lib@1.17.1";
import { z } from "npm:zod@4.6.7";
import { getAuthorizedUser, isResponse } from "../_shared/auth.ts";
import { AUTHORSHIP_PHRASE, AUTHORSHIP_SHA256 } from "../_shared/attribution.ts";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";

const requestSchema = z.object({
  installment_id: z.string().uuid(),
  payer_name: z.string().trim().min(1).max(200),
  receiver_name: z.string().trim().min(1).max(200),
  description: z.string().trim().min(1).max(1000),
});

function wrapText(text: string, font: { widthOfTextAtSize: (text: string, size: number) => number }, size: number, maxWidth: number) {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (line && font.widthOfTextAtSize(candidate, size) > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return jsonResponse({ error: "Method not allowed." }, 405);

  const input = requestSchema.safeParse(await request.json().catch(() => null));
  if (!input.success) return jsonResponse({ error: "Invalid receipt request." }, 400);
  const auth = await getAuthorizedUser(request);
  if (isResponse(auth)) return auth;
  const { client, user } = auth;

  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(AUTHORSHIP_PHRASE));
  const actualHash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  if (actualHash !== AUTHORSHIP_SHA256) return jsonResponse({ error: "Document integrity check failed." }, 500);

  const { data: installment, error: installmentError } = await client.from("installments")
    .select("id,contract_id,owner_id,number,amount,status,paid_amount,paid_at,contracts(title)")
    .eq("id", input.data.installment_id)
    .eq("owner_id", user.id)
    .eq("status", "paid")
    .single();
  if (installmentError || !installment) return jsonResponse({ error: "Paid installment not found." }, 404);
  const contract = Array.isArray(installment.contracts) ? installment.contracts[0] : installment.contracts;
  if (!contract?.title || !installment.paid_at) return jsonResponse({ error: "Installment payment details are incomplete." }, 409);

  const amount = Number(installment.paid_amount || installment.amount);
  if (!Number.isFinite(amount) || amount <= 0) return jsonResponse({ error: "Installment amount is invalid." }, 422);
  const receiptNumber = `REC-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
  const paidOn = new Date(installment.paid_at).toLocaleDateString("pt-BR", { timeZone: "UTC" });

  const pdf = await PDFDocument.create();
  pdf.setTitle(`Recibo ${receiptNumber}`);
  pdf.setSubject(AUTHORSHIP_PHRASE);
  pdf.setAuthor("Contratta AI");
  pdf.setCreator("Contratta AI");
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const pageSize = { width: 595.28, height: 841.89 };
  const margin = 56;
  const fontSize = 12;
  const lineHeight = 19;
  let page = pdf.addPage([pageSize.width, pageSize.height]);
  let y = pageSize.height - margin;
  page.drawText("RECIBO DE PAGAMENTO", { x: margin, y, size: 18, font: bold });
  y -= 42;
  const lines = [
    `Identificador: ${receiptNumber}`,
    `Contrato: ${contract.title}`,
    `Pagador: ${input.data.payer_name}`,
    `Recebedor: ${input.data.receiver_name}`,
    `Valor: R$ ${amount.toFixed(2).replace(".", ",")}`,
    `Data do pagamento: ${paidOn}`,
    `Descrição: ${input.data.description}`,
    `Parcela: ${installment.number}`,
    "",
    "Este recibo foi gerado com base nas informações confirmadas pelo usuário.",
  ].flatMap((line) => wrapText(line, font, fontSize, pageSize.width - margin * 2));
  for (const line of lines) {
    if (y < margin) {
      page = pdf.addPage([pageSize.width, pageSize.height]);
      y = pageSize.height - margin;
    }
    page.drawText(line, { x: margin, y, size: fontSize, font });
    y -= lineHeight;
  }

  const bytes = Uint8Array.from(await pdf.save());
  const file = new Blob([bytes.buffer], { type: "application/pdf" });
  const fileDigest = await crypto.subtle.digest("SHA-256", bytes.buffer);
  const sha256 = Array.from(new Uint8Array(fileDigest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  const filePath = `${user.id}/${installment.contract_id}/${receiptNumber}.pdf`;
  const { error: uploadError } = await client.storage.from("contract-documents").upload(filePath, file, {
    contentType: "application/pdf",
    upsert: false,
  });
  if (uploadError) return jsonResponse({ error: "Could not store the receipt PDF." }, 500);

  const { data: receipt, error: insertError } = await client.from("payment_receipts").insert({
    owner_id: user.id,
    contract_id: installment.contract_id,
    installment_id: installment.id,
    receipt_number: receiptNumber,
    payer_name: input.data.payer_name,
    receiver_name: input.data.receiver_name,
    amount,
    paid_on: new Date(installment.paid_at).toISOString().slice(0, 10),
    description: input.data.description,
    file_path: filePath,
    sha256,
  }).select("id").single();
  if (insertError || !receipt) {
    const { error: cleanupError } = await client.storage.from("contract-documents").remove([filePath]);
    if (cleanupError) return jsonResponse({ error: "Receipt could not be saved and its private file needs cleanup." }, 500);
    if (insertError?.code === "23505") return jsonResponse({ error: "A receipt already exists for this installment." }, 409);
    return jsonResponse({ error: "Could not save the receipt record." }, 500);
  }

  const { data: signed, error: signedError } = await client.storage.from("contract-documents").createSignedUrl(filePath, 60);
  if (signedError) return jsonResponse({ error: "Receipt was saved, but its temporary link could not be prepared." }, 500);
  return jsonResponse({
    receipt_id: receipt.id,
    receipt_number: receiptNumber,
    signed_url: signed.signedUrl,
    sha256,
  });
});
