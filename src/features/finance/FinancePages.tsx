import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Plus, ReceiptText, WalletCards } from "lucide-react";
import { Link } from "react-router-dom";
import { EmptyState, PageTitle, QueryState } from "../../components/ui/Page";
import { formatCurrency } from "../../lib/validators";
import { requireSupabase } from "../../lib/supabase";
import { useAuth } from "../auth/AuthProvider";

interface ContractOption {
  id: string;
  title: string;
}

interface Installment {
  id: string;
  contract_id: string;
  number: number;
  amount: number;
  due_date: string;
  status: "pending" | "paid" | "partial" | "overdue" | "cancelled";
  paid_amount: number;
  paid_at: string | null;
  contract_title: string;
}

interface Receipt {
  id: string;
  contract_id: string;
  installment_id: string;
  receipt_number: string;
  payer_name: string;
  receiver_name: string;
  amount: number;
  paid_on: string;
  description: string;
  file_path: string;
  sha256: string;
  contract_title: string;
}

const installmentStatus: Record<Installment["status"], string> = {
  pending: "Pendente",
  paid: "Pago",
  partial: "Parcial",
  overdue: "Atrasado",
  cancelled: "Cancelado",
};

function relatedContractTitle(related: { title: string } | { title: string }[] | null) {
  return (Array.isArray(related) ? related[0]?.title : related?.title) ?? "Contrato";
}

export function FinancePage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [formOpen, setFormOpen] = useState(false);
  const [contractId, setContractId] = useState("");
  const [number, setNumber] = useState("");
  const [amount, setAmount] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const contractsQuery = useQuery({
    queryKey: ["contracts", "finance-options"],
    queryFn: async () => {
      const { data, error } = await requireSupabase().from("contracts")
        .select("id,title").not("status", "eq", "cancelled").order("title");
      if (error) throw error;
      return (data ?? []) as ContractOption[];
    },
  });
  const installmentsQuery = useQuery({
    queryKey: ["installments"],
    queryFn: async () => {
      const { data, error } = await requireSupabase().from("installments")
        .select("id,contract_id,number,amount,due_date,status,paid_amount,paid_at,contracts(title)")
        .order("due_date", { ascending: true });
      if (error) throw error;
      return ((data ?? []) as Array<Omit<Installment, "contract_title" | "amount" | "paid_amount"> & {
        amount: number | string;
        paid_amount: number | string;
        contracts: { title: string } | { title: string }[] | null;
      }>).map(({ contracts, ...item }) => ({
        ...item,
        amount: Number(item.amount),
        paid_amount: Number(item.paid_amount),
        contract_title: relatedContractTitle(contracts),
      }));
    },
  });
  const createInstallment = useMutation({
    mutationFn: async () => {
      const parsedNumber = Number(number);
      const parsedAmount = Number(amount.replace(",", "."));
      if (!contractId || !Number.isInteger(parsedNumber) || parsedNumber < 1 || !Number.isFinite(parsedAmount) || parsedAmount <= 0 || !dueDate) {
        throw new Error("Informe contrato, número, valor positivo e vencimento.");
      }
      const { error } = await requireSupabase().from("installments").insert({
        contract_id: contractId,
        owner_id: user!.id,
        number: parsedNumber,
        amount: parsedAmount,
        due_date: dueDate,
        status: "pending",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setErrorMessage("");
      setFormOpen(false);
      setNumber("");
      setAmount("");
      setDueDate("");
      void queryClient.invalidateQueries({ queryKey: ["installments"] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
    },
    onError: (error) => setErrorMessage(error.message),
  });
  const updateStatus = useMutation({
    mutationFn: async ({ id, status, paidAmount }: { id: string; status: Installment["status"]; paidAmount?: number }) => {
      const { error } = await requireSupabase().from("installments").update({
        status,
        ...(paidAmount === undefined ? {} : { paid_amount: paidAmount, paid_at: new Date().toISOString() }),
      }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["installments"] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
    },
    onError: (error) => setErrorMessage(error.message),
  });
  const contracts = contractsQuery.data ?? [];
  const installments = installmentsQuery.data ?? [];
  const pendingTotal = useMemo(() => installments.filter((item) => ["pending", "overdue", "partial"].includes(item.status)).reduce((sum, item) => sum + Math.max(0, item.amount - item.paid_amount), 0), [installments]);

  return (
    <>
      <PageTitle eyebrow="ACOMPANHAMENTO" title="Financeiro" description="Acompanhe parcelas informadas para seus contratos." action={<button className="button button-primary" onClick={() => setFormOpen((open) => !open)}><Plus size={16} /> Adicionar parcela</button>} />
      <div className="finance-summary"><span className="finance-summary-icon"><WalletCards size={19} /></span><div><small>Saldo de parcelas não pagas</small><strong>{formatCurrency(pendingTotal)}</strong><span>Calculado a partir das parcelas cadastradas.</span></div></div>
      {errorMessage && <p className="form-message error-message page-message" role="alert">{errorMessage}</p>}
      {formOpen && <section className="panel party-form-panel"><div className="section-heading"><div><h2>Nova parcela</h2><p>Adicionar parcela não altera o status de pagamento do contrato.</p></div></div>
        {contracts.length ? <form className="installment-form" onSubmit={(event) => { event.preventDefault(); createInstallment.mutate(); }}>
          <label className="field-label">Contrato<select className="select-input" value={contractId} onChange={(event) => setContractId(event.target.value)} required><option value="">Selecione</option>{contracts.map((contract) => <option value={contract.id} key={contract.id}>{contract.title}</option>)}</select></label>
          <label className="field-label">Número da parcela<input className="text-input" type="number" min="1" step="1" value={number} onChange={(event) => setNumber(event.target.value)} required /></label>
          <label className="field-label">Valor (R$)<input className="text-input" inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} required /></label>
          <label className="field-label">Vencimento<input className="text-input" type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} required /></label>
          <div className="party-form-actions"><button type="button" className="button button-secondary" onClick={() => setFormOpen(false)}>Cancelar</button><button className="button button-primary" disabled={createInstallment.isPending}>{createInstallment.isPending ? "Salvando…" : "Salvar parcela"}</button></div>
        </form> : <EmptyState title="Nenhum contrato disponível" message="Crie um contrato antes de adicionar parcelas." action={<Link className="button button-secondary" to="/app/new-contract">Criar contrato</Link>} />}
      </section>}
      <section className="panel data-panel">
        <div className="section-heading"><div><h2>Parcelas</h2><p>Os pagamentos só mudam depois da sua confirmação.</p></div></div>
        <QueryState loading={installmentsQuery.isLoading || contractsQuery.isLoading} error={(installmentsQuery.error ?? contractsQuery.error) as Error | null}>
          {installments.length ? <div className="installment-list">{installments.map((item) => (
            <article className="installment-row" key={item.id}>
              <span className="installment-number">{item.number}</span><div className="installment-main"><b>{item.contract_title}</b><small>Parcela {item.number} · Vencimento {new Date(`${item.due_date}T00:00:00`).toLocaleDateString("pt-BR")}</small></div>
              <strong className="installment-amount">{formatCurrency(item.amount)}</strong><span className={`status-pill status-${item.status}`}>{installmentStatus[item.status]}</span>
              {item.status === "pending" && <button className="button button-secondary mark-paid" onClick={() => { if (window.confirm(`Confirmar que a parcela ${item.number} de ${formatCurrency(item.amount)} foi paga?`)) updateStatus.mutate({ id: item.id, status: "paid", paidAmount: item.amount }); }}>Confirmar pagamento</button>}
              {item.status === "paid" && <Link className="receipt-link" to="/app/receipts"><ReceiptText size={14} /> Recibos</Link>}
            </article>
          ))}</div> : <EmptyState title="Nenhuma parcela cadastrada" message="Cadastre as parcelas combinadas para acompanhar seus vencimentos." action={<button className="button button-secondary" onClick={() => setFormOpen(true)}><Plus size={15} /> Adicionar parcela</button>} />}
        </QueryState>
      </section>
    </>
  );
}

export function ReceiptsPage() {
  const queryClient = useQueryClient();
  const [payer, setPayer] = useState("");
  const [receiver, setReceiver] = useState("");
  const [description, setDescription] = useState("");
  const [selectedInstallment, setSelectedInstallment] = useState<Installment | null>(null);
  const [feedback, setFeedback] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [receiptUrls, setReceiptUrls] = useState<Record<string, string>>({});
  const installmentsQuery = useQuery({
    queryKey: ["installments"],
    queryFn: async () => {
      const { data, error } = await requireSupabase().from("installments")
        .select("id,contract_id,number,amount,due_date,status,paid_amount,paid_at,contracts(title)")
        .eq("status", "paid").order("paid_at", { ascending: false });
      if (error) throw error;
      return ((data ?? []) as Array<Omit<Installment, "contract_title" | "amount" | "paid_amount"> & {
        amount: number | string;
        paid_amount: number | string;
        contracts: { title: string } | { title: string }[] | null;
      }>).map(({ contracts, ...item }) => ({
        ...item,
        amount: Number(item.amount),
        paid_amount: Number(item.paid_amount),
        contract_title: relatedContractTitle(contracts),
      }));
    },
  });
  const receiptsQuery = useQuery({
    queryKey: ["receipts"],
    queryFn: async () => {
      const { data, error } = await requireSupabase().from("payment_receipts")
        .select("id,contract_id,installment_id,receipt_number,payer_name,receiver_name,amount,paid_on,description,file_path,sha256,contracts(title)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return ((data ?? []) as Array<Omit<Receipt, "contract_title" | "amount"> & {
        amount: number | string;
        contracts: { title: string } | { title: string }[] | null;
      }>).map(({ contracts, ...item }) => ({
        ...item,
        amount: Number(item.amount),
        contract_title: relatedContractTitle(contracts),
      }));
    },
  });
  const issueReceipt = useMutation({
    mutationFn: async () => {
      const installment = selectedInstallment;
      if (!installment || !payer.trim() || !receiver.trim() || !description.trim()) {
        throw new Error("Informe pagador, recebedor e descrição do pagamento.");
      }
      const { data, error } = await requireSupabase().functions.invoke("generate-receipt", {
        body: {
          installment_id: installment.id,
          payer_name: payer.trim(),
          receiver_name: receiver.trim(),
          description: description.trim(),
        },
      });
      if (error) throw new Error(`O recibo não pôde ser gerado: ${error.message}`);
      if (!data?.receipt_number || !data?.signed_url) throw new Error("O serviço não confirmou a criação do recibo.");
      return { id: installment.id, url: data.signed_url as string, receiptNumber: data.receipt_number as string };
    },
    onSuccess: ({ id, url, receiptNumber }) => {
      setErrorMessage("");
      setFeedback(`Recibo ${receiptNumber} criado sem alterar o status da parcela.`);
      setReceiptUrls((current) => ({ ...current, [id]: url }));
      setSelectedInstallment(null);
      setPayer("");
      setReceiver("");
      setDescription("");
      void queryClient.invalidateQueries({ queryKey: ["receipts"] });
    },
    onError: (error) => { setFeedback(""); setErrorMessage(error.message); },
  });
  const existingInstallmentIds = new Set((receiptsQuery.data ?? []).map((receipt) => receipt.installment_id));

  return (
    <>
      <PageTitle eyebrow="COMPROVANTES" title="Recibos" description="Gere recibos privados para parcelas marcadas como pagas." />
      {feedback && <p className="form-message success-message page-message" role="status">{feedback}</p>}
      {errorMessage && <p className="form-message error-message page-message" role="alert">{errorMessage}</p>}
      {selectedInstallment && <section className="panel receipt-form-panel"><div className="section-heading"><div><h2>Emitir recibo</h2><p>{selectedInstallment.contract_title} · Parcela {selectedInstallment.number} · {formatCurrency(selectedInstallment.paid_amount || selectedInstallment.amount)}</p></div></div>
        <form className="party-form" onSubmit={(event) => { event.preventDefault(); issueReceipt.mutate(); }}>
          <label className="field-label">Pagador<input className="text-input" value={payer} onChange={(event) => setPayer(event.target.value)} required /></label>
          <label className="field-label">Recebedor<input className="text-input" value={receiver} onChange={(event) => setReceiver(event.target.value)} required /></label>
          <label className="field-label party-address">Descrição do pagamento<input className="text-input" value={description} onChange={(event) => setDescription(event.target.value)} required /></label>
          <div className="party-form-actions"><button type="button" className="button button-secondary" onClick={() => setSelectedInstallment(null)}>Cancelar</button><button className="button button-primary" disabled={issueReceipt.isPending}>{issueReceipt.isPending ? "Gerando recibo…" : "Confirmar e gerar recibo"}</button></div>
        </form>
      </section>}
      <section className="panel data-panel">
        <div className="section-heading"><div><h2>Pagamentos confirmados</h2><p>Gerar um recibo não altera o status financeiro.</p></div></div>
        <QueryState loading={installmentsQuery.isLoading || receiptsQuery.isLoading} error={(installmentsQuery.error ?? receiptsQuery.error) as Error | null}>
          {installmentsQuery.data?.length ? <div className="installment-list">{installmentsQuery.data.map((item) => (
            <article className="installment-row" key={item.id}>
              <span className="installment-number"><ReceiptText size={15} /></span><div className="installment-main"><b>{item.contract_title}</b><small>Parcela {item.number} · Pago em {new Date(item.paid_at ?? Date.now()).toLocaleDateString("pt-BR")}</small></div>
              <strong className="installment-amount">{formatCurrency(item.paid_amount || item.amount)}</strong>
              {existingInstallmentIds.has(item.id) ? <span className="status-pill status-completed">Recibo emitido</span> : <button className="button button-secondary mark-paid" onClick={() => { setSelectedInstallment(item); setFeedback(""); }}>Gerar recibo</button>}
              {receiptUrls[item.id] && <a className="receipt-link" href={receiptUrls[item.id]} target="_blank" rel="noreferrer"><Download size={14} /> Abrir PDF</a>}
            </article>
          ))}</div> : <EmptyState title="Nenhum pagamento confirmado" message="Confirme o pagamento de uma parcela no Financeiro para habilitar a emissão de um recibo." action={<Link className="button button-secondary" to="/app/finance">Abrir Financeiro</Link>} />}
        </QueryState>
      </section>
      <section className="panel data-panel receipt-history-panel">
        <div className="section-heading"><div><h2>Histórico de recibos</h2><p>Os PDFs são armazenados em bucket privado.</p></div></div>
        <QueryState loading={receiptsQuery.isLoading} error={receiptsQuery.error as Error | null}>
          {receiptsQuery.data?.length ? <div className="receipt-history">{receiptsQuery.data.map((receipt) => (
            <article className="receipt-history-row" key={receipt.id}><div><b>{receipt.receipt_number}</b><small>{receipt.contract_title} · {receipt.payer_name} → {receipt.receiver_name}</small></div><strong>{formatCurrency(receipt.amount)}</strong>{receiptUrls[receipt.id] ? <a className="button button-secondary" href={receiptUrls[receipt.id]} target="_blank" rel="noreferrer">Abrir PDF</a> : <button className="button button-secondary" onClick={async () => { const { data, error } = await requireSupabase().storage.from("contract-documents").createSignedUrl(receipt.file_path, 60); if (error) setErrorMessage(error.message); else setReceiptUrls((current) => ({ ...current, [receipt.id]: data.signedUrl })); }}>Preparar PDF privado</button>}</article>
          ))}</div> : <p className="inline-state">Nenhum recibo foi gerado ainda.</p>}
        </QueryState>
      </section>
    </>
  );
}
