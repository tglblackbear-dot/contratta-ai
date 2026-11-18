import { Link } from "react-router-dom";
import { ArrowRight, CheckCircle2, FileCheck2, MessageSquareText, ShieldCheck, Sparkles } from "lucide-react";

const WHATSAPP = "https://wa.me/5571999383974?text=Ol%C3%A1%20Fabio.tec!%20Quero%20saber%20mais%20sobre%20o%20Contratta%20AI.";

export function LandingPage() {
  return (
    <main className="landing">
      <header className="landing-nav">
        <span className="landing-brand"><b>contratta</b><small>AI · ASSISTENTE JURÍDICO</small></span>
        <div className="landing-nav-actions">
          <a className="button button-secondary" href={WHATSAPP} target="_blank" rel="noreferrer">Falar no WhatsApp</a>
          <Link className="button button-primary" to="/register">Começar grátis</Link>
        </div>
      </header>

      <section className="landing-hero">
        <div className="landing-hero-copy">
          <span className="eyebrow">CONTRATOS INTELIGENTES</span>
          <h1>Contratos claros.<br />Sem complicação.</h1>
          <p>Conte o que você combinou em uma conversa. A IA organiza os dados, prepara o rascunho e você revisa tudo antes de assinar.</p>
          <div className="landing-cta">
            <Link className="button button-primary" to="/register">Criar minha conta <ArrowRight size={16} /></Link>
            <a className="button button-secondary" href={WHATSAPP} target="_blank" rel="noreferrer">Dúvidas? WhatsApp</a>
          </div>
          <ul className="landing-benefits">
            <li><CheckCircle2 size={16} /> 14 modelos prontos</li>
            <li><CheckCircle2 size={16} /> PDF privado com hash SHA-256</li>
            <li><CheckCircle2 size={16} /> Aceite eletrônico por link</li>
          </ul>
        </div>
        <img className="landing-capa" src={`${import.meta.env.BASE_URL}capa-divulgacao.png`} alt="Contratta AI — contratos inteligentes" />
      </section>

      <section className="landing-price">
        <span className="eyebrow">PREÇO SIMPLES</span>
        <h2>R$ 6,00 por contrato</h2>
        <p>1 crédito = 1 contrato. Sem assinatura mensal. Pague com cartão ou Pix pela InfinitePay e o crédito aparece automaticamente.</p>
        <Link className="button button-primary" to="/app/billing">Ver créditos</Link>
      </section>

      <section className="landing-features">
        <div className="landing-feature"><Sparkles size={22} /><h3>Entrevista assistida</h3><p>Perguntas claras, uma por vez, para reunir todos os dados do contrato.</p></div>
        <div className="landing-feature"><FileCheck2 size={22} /><h3>Rascunho revisável</h3><p>Cláusulas baseadas no Código Civil, LGPD e lei do aceite eletrônico.</p></div>
        <div className="landing-feature"><ShieldCheck size={22} /><h3>Privacidade</h3><p>Seus dados ficam no seu projeto Supabase, com RLS e bucket privado.</p></div>
        <div className="landing-feature"><MessageSquareText size={22} /><h3>Suporte humano</h3><p>Fabio.tec te ajuda no WhatsApp: (71) 99938-3974.</p></div>
      </section>

      <section className="landing-proof">
        <h2>Veja como funciona</h2>
        <div className="landing-screens">
          <img src={`${import.meta.env.BASE_URL}screens/dashboard.png`} alt="Dashboard do Contratta AI" />
          <img src={`${import.meta.env.BASE_URL}screens/modelos.png`} alt="Seleção de modelos de contrato" />
          <img src={`${import.meta.env.BASE_URL}screens/cobranca.png`} alt="Página de créditos" />
        </div>
      </section>

      <footer className="landing-footer">
        <span>Contratta AI · Assista ao que você ama? Não — contratos inteligentes, simples como uma conversa.</span>
        <a href={WHATSAPP} target="_blank" rel="noreferrer">Suporte · (71) 99938-3974</a>
      </footer>
    </main>
  );
}
