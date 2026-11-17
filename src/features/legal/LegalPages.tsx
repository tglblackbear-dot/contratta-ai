import { Link } from "react-router-dom";
import { PageTitle } from "../../components/ui/Page";

export function TermsPage() {
  return (
    <main className="legal-document">
      <Link to="/register" className="back-link">Voltar ao cadastro</Link>
      <PageTitle eyebrow="CONTRATTA AI" title="Termos de uso" description="Versão 2026-11" />
      <section className="panel legal-panel">
        <h2>Escopo do serviço</h2>
        <p>A plataforma ajuda a organizar informações fornecidas pelas pessoas usuárias e preparar rascunhos de documentos. O conteúdo automatizado é um ponto de partida, não constitui aconselhamento jurídico e não garante validade, adequação ou resultado legal.</p>
        <h2>Responsabilidade pela revisão</h2>
        <p>Antes de formalizar ou compartilhar um documento, confira os dados, valores, prazos, cláusulas e a identidade das partes. A pessoa usuária deve obter orientação profissional quando a situação exigir análise jurídica individualizada.</p>
        <h2>Inteligência artificial e documentos</h2>
        <p>Mensagens e arquivos enviados para entrevista ou OCR podem ser processados pelo provedor de IA configurado pelo operador do serviço. Não envie dados que não tenha autorização para compartilhar. Resultados de OCR são sugestões e precisam de conferência humana.</p>
        <h2>Aceite eletrônico</h2>
        <p>O aceite por link registra evidências descritas na tela e fica vinculado a uma versão do documento. Ele não é apresentado como assinatura eletrônica qualificada nem substitui requisitos legais ou formais que se apliquem ao caso.</p>
        <h2>Conta e encerramento</h2>
        <p>Mantenha suas credenciais sob controle. As configurações permitem exportar registros e solicitar a exclusão permanente da conta e dos arquivos privados associados.</p>
      </section>
    </main>
  );
}

export function PrivacyPage() {
  return (
    <main className="legal-document">
      <Link to="/register" className="back-link">Voltar ao cadastro</Link>
      <PageTitle eyebrow="CONTRATTA AI" title="Política de privacidade" description="Versão 2026-11" />
      <section className="panel legal-panel">
        <h2>Dados tratados</h2>
        <p>O serviço pode armazenar dados de perfil e contato, partes, contratos, mensagens de entrevista, documentos anexados, resultados de OCR, versões, convites e aceites, parcelas, recibos e notificações, conforme os recursos utilizados.</p>
        <h2>Finalidades e serviços envolvidos</h2>
        <p>Os dados são usados para autenticar a conta, salvar e apresentar os registros solicitados, gerar documentos e executar os recursos habilitados. Arquivos e registros privados são armazenados no projeto Supabase configurado. Quando entrevista ou OCR estão ativos, o conteúdo necessário é enviado ao provedor de IA escolhido pelo operador; consulte também os termos desse provedor.</p>
        <h2>Armazenamento local e segurança</h2>
        <p>O modo offline guarda cópias limitadas de entrevistas previamente abertas no dispositivo, criptografadas no IndexedDB. Dados privados não são adicionados ao cache compartilhado do service worker. Nenhuma medida técnica elimina todos os riscos de segurança.</p>
        <h2>Retenção, exportação e exclusão</h2>
        <p>Use Configurações para exportar registros em JSON ou solicitar a exclusão da conta e dos arquivos privados. O JSON não inclui os PDFs e anexos, que devem ser baixados individualmente. O cache offline é removido ao sair da conta neste dispositivo. A aplicação não executa atualmente uma política automática de expiração dos dados no servidor.</p>
        <h2>Informações do controlador</h2>
        <p>Antes da disponibilização pública, o operador responsável deve identificar o controlador, informar um canal de contato para solicitações de privacidade, definir bases legais e formalizar prazos de retenção adequados. Esses dados não são presumidos pela aplicação.</p>
      </section>
    </main>
  );
}
