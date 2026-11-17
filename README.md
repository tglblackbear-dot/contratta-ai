# Contratta AI

Contratos inteligentes. Simples como uma conversa.

Aplicação React + TypeScript + Vite para organizar contratos brasileiros com uma entrevista assistida por IA, revisão humana e armazenamento privado no Supabase. O conteúdo é um ponto de partida e não substitui aconselhamento jurídico.

## Requisitos

- Node.js 20 ou superior e npm.
- O projeto Supabase exclusivo do Contratta AI já provisionado: `thmxhgzjwqujvpczakpf`, região São Paulo.
- Supabase CLI para aplicar migrations e publicar Edge Functions.
- Uma API de IA compatível com o formato OpenAI Chat Completions para habilitar a entrevista.

## Desenvolvimento local

1. Instale as dependências: `npm install`.
2. Copie `.env.example` para `.env.local`.
3. Configure `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` com a URL e a chave publicável (anon) desse projeto Supabase. Não use `service_role` no navegador.
4. Para Web Push local, configure também `VITE_WEB_PUSH_PUBLIC_KEY` com a chave pública VAPID do projeto.
5. Inicie o frontend: `npm run dev`.

Sem as duas variáveis do Supabase, a aplicação mostra uma orientação de configuração e não tenta simular login, dados ou persistência.

## Configurar o Supabase separado

O projeto separado já existe: [abrir o dashboard](https://supabase.com/dashboard/project/thmxhgzjwqujvpczakpf). Não crie outro projeto nem use o Supabase preexistente.

1. Copie a Project URL e a chave `anon`/publicável desse projeto para `.env.local`.
2. A última verificação confirmou **zero migrations aplicadas e zero Edge Functions publicadas** no projeto. Aplique os arquivos de `supabase/migrations/` em ordem numérica, **uma única vez**. Para novos ambientes, prefira a CLI:

   ```sh
   supabase login
   supabase link --project-ref thmxhgzjwqujvpczakpf
   supabase db push
   ```

   Não combine `db push` com execução manual dos mesmos arquivos. Se usar o SQL Editor, confirme cada migration aplicada antes de retomar a CLI e reconcilie o histórico com `supabase migration repair`; não rode migrations duplicadas.
3. As migrations `001`–`009` criam schema/RLS, buckets, modelos iniciais, OCR, notificações, sincronização offline, início transacional de entrevista, Web Push, registro de consentimento e unicidade de recibos por parcela. Para trabalhar com Supabase local, use `supabase start` e `supabase db reset`.
4. Em **Authentication → URL Configuration**, defina o Site URL e inclua os redirects usados no desenvolvimento e na publicação. Ative a confirmação de e-mail conforme a política do projeto.
5. Gere um par VAPID para Web Push (`npx --yes web-push generate-vapid-keys`). Configure a chave pública `VITE_WEB_PUSH_PUBLIC_KEY` no `.env.local` e nas variáveis do GitHub Actions. Configure os valores de backend somente como secrets do Supabase:

   ```sh
   supabase secrets set AI_API_URL="<endpoint OpenAI-compatible>" AI_API_KEY="<chave do provedor>" AI_MODEL="<modelo multimodal>" PUBLIC_APP_URL="<URL-base HTTPS do app, incluindo /contratta-ai/ se usado>" VAPID_PUBLIC_KEY="<chave pública VAPID>" VAPID_PRIVATE_KEY="<chave privada VAPID>" VAPID_SUBJECT="<mailto ou URL de contato do operador>" NOTIFICATION_DISPATCH_SECRET="<segredo aleatório de despacho>"
   supabase functions deploy contract-interview
   supabase functions deploy document-ocr
   supabase functions deploy generate-contract
   supabase functions deploy generate-receipt
   supabase functions deploy create-signature-link
   supabase functions deploy register-acceptance
   supabase functions deploy delete-account
   supabase functions deploy notification-dispatch
   ```

   `SUPABASE_SERVICE_ROLE_KEY` é usado somente no runtime das Edge Functions, nunca o configure no frontend. As funções validam sessão, autorização e formato de entrada/saída. Sem IA configurada, a entrevista e o OCR retornam erros explícitos.
6. Para processar Web Push mesmo com o app fechado, habilite as extensões `pg_cron`, `pg_net` e `vault` no dashboard. Crie secrets Vault `contratta_dispatch_url` com `https://thmxhgzjwqujvpczakpf.supabase.co/functions/v1/notification-dispatch` e `contratta_dispatch_secret` com o mesmo valor de `NOTIFICATION_DISPATCH_SECRET`. Agende uma chamada por minuto no SQL Editor:

   ```sql
   select cron.schedule(
     'contratta-notification-dispatch',
     '* * * * *',
     $$
     select net.http_post(
       url := (select decrypted_secret from vault.decrypted_secrets where name = 'contratta_dispatch_url'),
       headers := jsonb_build_object(
         'Content-Type', 'application/json',
         'x-notification-dispatch-secret',
         (select decrypted_secret from vault.decrypted_secrets where name = 'contratta_dispatch_secret')
       ),
       body := '{}'::jsonb
     );
     $$
   );
   ```

   Faça essa configuração uma vez; verifique execuções em **Integrations → Cron** e **Logs → Edge Functions**. Sem o agendador, as notificações internas continuam, mas Web Push não é enviado automaticamente. E-mail não está implementado.

## Publicar no GitHub Pages

O workflow `.github/workflows/deploy-pages.yml` compila e publica o aplicativo no caminho `/contratta-ai/`. Ative GitHub Pages para **GitHub Actions** nas configurações do repositório. Para conectar o backend publicado, defina `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` e `VITE_WEB_PUSH_PUBLIC_KEY` em **Settings → Secrets and variables → Actions → Variables** e execute novamente o workflow.

Adicione também `https://<usuario>.github.io/contratta-ai/` e seu callback de autenticação à lista de URLs permitidas no Supabase. A chave anon é destinada ao cliente e não substitui as políticas RLS; nunca publique `service_role` ou chaves de IA.

## Funcionalidades implementadas

- Cadastro, login e recuperação de senha via Supabase Auth.
- Dashboard, contratos, modelos versionados no banco, agenda de partes e perfil, todos limitados à sessão do usuário.
- Entrevista persistida por Edge Function com extração estruturada validada por Zod e integração configurável com API de IA.
- OCR de imagens e PDFs de até 10 páginas. Páginas de PDF são renderizadas localmente e processadas pelo endpoint multimodal configurado; os arquivos ficam em bucket privado e cada sugestão deve ser escolhida e revisada antes de entrar na entrevista.
- Central de notificações no aplicativo com atualização em tempo real para aceites eletrônicos e lembretes privados no dia anterior ao vencimento de parcelas.
- Notificações Web Push configuráveis por dispositivo, enviadas por Edge Function agendada; requer VAPID, secrets do Supabase e `pg_cron`/`pg_net`/Vault.
- Entrevistas abertas anteriormente podem ser consultadas offline; respostas ficam criptografadas com AES-GCM no IndexedDB e sincronizam com chave idempotente e controle de versão quando a rede retorna. Conflitos pedem revisão humana; o cache local é removido ao sair da conta.
- Configurações para exportar registros pessoais em JSON e solicitar a exclusão permanente da conta e arquivos privados.
- Preparação de rascunho a partir de campos confirmados e cláusulas do modelo; exportação de PDF para bucket privado com SHA-256 por versão.
- Recibos gerados por Edge Function apenas para parcelas já confirmadas como pagas, armazenados em bucket privado com SHA-256, sem alterar o status financeiro.
- Links de aceite de uso único, associados ao hash da versão do documento; a página pública acessa somente o documento autorizado pelo token e não o marca como assinatura qualificada.
- Migrations reproduzíveis com RLS, políticas de Storage e modelos iniciais sem referências legais inventadas.
- Manifest PWA e service worker limitados a arquivos estáticos; respostas de autenticação, API, Storage e documentos privados não são armazenados em cache.
- Identificador de autoria compartilhado e verificado por SHA-256 (`npm run integrity`).

O identificador de autoria é **"Deus acima de tudo, familia em primeiro lugar"** (SHA-256 `f6806b2315ccad2a18e03d1271bbb43576a9cc18429d1fd0751c439e90e7c7f1`). Esse marcador detecta inconsistências no projeto; não impede cópia, engenharia reversa ou adulteração.

Resultados do OCR permanecem privados no registro do anexo até sua exclusão pela pessoa usuária. A leitura é uma sugestão, não uma verificação de identidade nem uma confirmação automática dos dados.
As notificações internas estão disponíveis após aplicar as migrations. Web Push está implementado, mas só é enviado quando VAPID, inscrição do dispositivo, secrets e agendamento do backend estiverem configurados. E-mail não está implementado.
O modo offline cobre entrevistas previamente abertas e respostas em fila; a sincronização reenvia as respostas pela função autenticada de entrevista e não usa uma Edge Function independente chamada `process-sync`. Geração por IA, OCR, arquivos e demais páginas precisam de conexão. O cache local só é descriptografado no navegador enquanto a conta está autenticada.

## Comandos

```sh
npm run dev
npm test
npm run build
npm run preview
```

## Privacidade e retenção

O banco e os buckets privados usam RLS e políticas vinculadas ao usuário autenticado. A aplicação não executa expiração automática de dados no servidor; a retenção deve ser definida e operada pelo responsável do serviço. Antes da oferta pública, preencha os dados do controlador e canal de privacidade indicados na política. Documentos pessoais só devem ser carregados com base legal e consentimento adequados; a aplicação não os utiliza para treinamento de modelos.
