import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, CreditCard, KeyRound } from "lucide-react";
import { PageTitle } from "../../components/ui/Page";
import { requireSupabase } from "../../lib/supabase";
import { useAuth } from "../auth/AuthProvider";

const paymentUrl = import.meta.env.VITE_INFINITEPAY_PAYMENT_URL?.trim() ?? "";
const hasPaymentLink = /^https?:\/\//i.test(paymentUrl);

export function BillingPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [code, setCode] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const creditsQuery = useQuery({
    queryKey: ["credits", user?.id],
    enabled: Boolean(user?.id),
    queryFn: async () => {
      const { data, error } = await requireSupabase().from("user_credits").select("credits").eq("user_id", user!.id).maybeSingle();
      if (error) throw new Error(error.message);
      return data?.credits ?? 0;
    },
  });

  const checkout = useMutation({
    mutationFn: async () => {
      const { data, error } = await requireSupabase().functions.invoke("create-checkout");
      if (error) throw new Error(error.message);
      const url = data?.url;
      if (typeof url !== "string" || !/^https?:\/\//.test(url)) throw new Error("A InfinitePay não devolveu um link válido.");
      return url;
    },
    onSuccess: (url) => { window.location.assign(url); },
    onError: (err: Error) => { setMessage(""); setError(err.message); },
  });

  const redeem = useMutation({
    mutationFn: async (value: string) => {
      const { data, error } = await requireSupabase().rpc("redeem_contract_code", { p_code: value.trim() });
      if (error) throw new Error(error.message);
      return Number(data);
    },
    onSuccess: (balance) => {
      setCode("");
      setError("");
      setMessage(`Código ativado. Você tem ${balance} contrato(s) disponível(is).`);
      void queryClient.invalidateQueries({ queryKey: ["credits", user?.id] });
    },
    onError: (err: Error) => {
      setMessage("");
      setError(err.message);
    },
  });

  return (
    <>
      <PageTitle eyebrow="COBRANÇA" title="Contratar" description="Recarregue créditos para criar novos contratos. É simples e o crédito aparece automaticamente." />
      <section className="panel billing-how">
        <h2>Como funciona — 3 passos</h2>
        <ol>
          <li><span>1</span><div><b>Toque em “Pagar com InfinitePay”</b><p>Você será levado ao checkout seguro. O valor é <b>R$ 6,00 por crédito</b>, e <b>1 crédito = 1 contrato</b>.</p></div></li>
          <li><span>2</span><div><b>Pague com cartão ou Pix</b><p>Assim que o pagamento for confirmado, o sistema libera seu crédito automaticamente. Normalmente leva poucos segundos.</p></div></li>
          <li><span>3</span><div><b>Volte ao app e confira</b><p>O número em “Créditos disponíveis” terá aumentado. Se não aparecer em alguns minutos, chame o suporte no WhatsApp e envie o comprovante: <a href="https://wa.me/5571999383974" target="_blank" rel="noreferrer">Fabio.tec · (71) 99938-3974</a>.</p></div></li>
        </ol>
        <p className="billing-how-note"><b>Não precisa de código</b> no fluxo normal. O campo de ativação só é usado se o suporte te enviar um código manualmente.</p>
      </section>
      <div className="billing-layout">
        <section className="panel billing-plan">
          <span className="billing-icon"><CreditCard size={22} /></span>
          <h2>1 contrato · pagamento único</h2>
          <p><b>R$ 6,00 = 1 crédito = 1 contrato.</b> Pague agora e use o crédito quando quiser criar um documento. Não há assinatura mensal.</p>
          <ul>
            <li><CheckCircle2 size={15} /> Entrevista assistida para reunir os dados</li>
            <li><CheckCircle2 size={15} /> Minuta revisável antes de exportar</li>
            <li><CheckCircle2 size={15} /> PDF privado e link de aceite eletrônico</li>
          </ul>
          <button className="button button-primary" disabled={checkout.isPending} onClick={() => checkout.mutate()}>
            {checkout.isPending ? "Abrindo checkout…" : "Pagar com InfinitePay"}
          </button>
          {hasPaymentLink && <a className="text-link" href={paymentUrl} target="_blank" rel="noreferrer">Usar link manual</a>}
          <p className="billing-notice">Após a confirmação do pagamento, o crédito é liberado automaticamente. Se não aparecer, use o código enviado pelo operador.</p>
          <p className="billing-notice">Suporte técnico: <a href="https://wa.me/5571999383974" target="_blank" rel="noreferrer">Fabio.tec · (71) 99938-3974 no WhatsApp</a></p>
        </section>
        <section className="panel billing-redeem">
          <span className="billing-icon"><KeyRound size={22} /></span>
          <h2>Recebeu um código do suporte?</h2>
          <p>Use este campo <b>somente se o Fabio.tec te enviar um código</b> após você falar no WhatsApp. Isso acontece apenas se o crédito não aparecer automaticamente. O código é de uso único: digite-o abaixo e clique em Ativar crédito.</p>
          <form onSubmit={(event) => { event.preventDefault(); if (code.trim()) redeem.mutate(code); }}>
            <label className="field-label">Código de ativação
              <input className="text-input" value={code} onChange={(event) => setCode(event.target.value)} placeholder="EX.: CONTRATTO-ABCD-1234" />
            </label>
            <button className="button button-primary" disabled={!code.trim() || redeem.isPending}>{redeem.isPending ? "Ativando…" : "Ativar crédito"}</button>
          </form>
          {message && <p className="form-message success-message" role="status">{message}</p>}
          {error && <p className="form-message error-message" role="alert">{error}</p>}
          <div className="billing-balance">
            <span>Créditos disponíveis</span>
            <strong>{creditsQuery.data ?? 0}</strong>
          </div>
        </section>
      </div>
    </>
  );
}
