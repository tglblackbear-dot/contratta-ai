param(
  [string]$SecretsFile = (Join-Path $env:TEMP 'opencode\contratta-secrets.env')
)

$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$projectRef = 'thmxhgzjwqujvpczakpf'
$projectBase = "https://api.supabase.com/v1/projects/$projectRef"
$repo = Split-Path -Parent $PSScriptRoot

if (-not (Test-Path -LiteralPath $SecretsFile)) {
  throw "Arquivo de segredos nao encontrado: $SecretsFile"
}

$cfg = @{}
foreach ($line in [IO.File]::ReadAllLines($SecretsFile)) {
  $trimmed = $line.Trim()
  if (-not $trimmed -or $trimmed.StartsWith('#')) { continue }
  if ($trimmed -match '^([A-Z0-9_]+)=(.*)$') { $cfg[$Matches[1]] = $Matches[2] }
}

foreach ($required in 'SUPABASE_ACCESS_TOKEN','AI_API_URL','AI_API_KEY','AI_MODEL') {
  if (-not $cfg.ContainsKey($required) -or [string]::IsNullOrWhiteSpace($cfg[$required])) {
    throw "Preencha $required em $SecretsFile"
  }
}

$env:SUPABASE_ACCESS_TOKEN = $cfg['SUPABASE_ACCESS_TOKEN']
$headers = @{ Authorization = 'Bearer ' + $cfg['SUPABASE_ACCESS_TOKEN'] }

function Invoke-Sql([string]$sql) {
  $body = @{ query = $sql } | ConvertTo-Json -Compress
  $bytes = [Text.Encoding]::UTF8.GetBytes($body)
  return Invoke-RestMethod -Uri "$projectBase/database/query" -Headers $headers -Method Post -ContentType 'application/json; charset=utf-8' -Body $bytes -TimeoutSec 180
}

function Set-GhVariable([string]$name, [string]$value) {
  $vars = gh api repos/tglblackbear-dot/contratta-ai/actions/variables | ConvertFrom-Json
  $existing = @($vars.variables) | Where-Object { $_.name -eq $name }
  if ($existing.Count -gt 0) {
    gh api -X PATCH "repos/tglblackbear-dot/contratta-ai/actions/variables/$name" -f value=$value | Out-Null
    Write-Host "Atualizada variable: $name"
  } else {
    gh api -X POST 'repos/tglblackbear-dot/contratta-ai/actions/variables' -f name=$name -f value=$value | Out-Null
    Write-Host "Criada variable: $name"
  }
}

Write-Host '== 1/7 Validando projeto Supabase =='
$project = Invoke-RestMethod -Uri $projectBase -Headers $headers -Method Get -TimeoutSec 60
if ($project.name -ne 'contratta-ai' -or $project.region -ne 'sa-east-1') {
  throw "O token nao confirmou o projeto contratta-ai em sa-east-1. Nada foi alterado."
}
$rows = Invoke-Sql "select count(*)::int as n from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE'"
$tableCount = if ($rows -is [array] -and $rows.Count -gt 0) { [int]$rows[0].n } else { 0 }
if ($tableCount -eq 0) {
  throw "Banco vazio. Aplique as migrations 001-004 antes deste bootstrap."
}
Write-Host "Projeto confirmado: $($project.name) ($($project.region)); tabelas publicas: $tableCount"

function Test-Marker([string]$sql) {
  $result = Invoke-Sql $sql
  if ($result -is [array] -and $result.Count -gt 0) { return ([int]$result[0].n -gt 0) }
  return $false
}

$markers = @(
  @{ File = '005_initial_contracts.sql'; Sql = "select count(*)::int as n from public.contract_categories" },
  @{ File = '006_atomic_interview_start.sql'; Sql = "select count(*)::int as n from pg_proc where pronamespace = 'public'::regnamespace and proname = 'start_interview_session'" },
  @{ File = '007_web_push_notifications.sql'; Sql = "select count(*)::int as n from pg_tables where schemaname = 'public' and tablename = 'push_subscriptions'" },
  @{ File = '008_consent_records.sql'; Sql = "select count(*)::int as n from pg_tables where schemaname = 'public' and tablename = 'consent_records'" },
  @{ File = '009_unique_installment_receipt.sql'; Sql = "select count(*)::int as n from pg_indexes where schemaname = 'public' and indexname = 'payment_receipts_installment_unique_idx'" },
  @{ File = '010_contract_credits.sql'; Sql = "select count(*)::int as n from pg_tables where schemaname = 'public' and tablename = 'user_credits'" },
  @{ File = '011_payment_orders.sql'; Sql = "select count(*)::int as n from pg_tables where schemaname = 'public' and tablename = 'payment_orders'" }
)

Write-Host '== 2/7 Aplicando migrations pendentes (005-009) =='
foreach ($migration in $markers) {
  if (Test-Marker $migration.Sql) {
    Write-Host "Ja aplicada: $($migration.File)"
    continue
  }
  $sqlPath = Join-Path $repo "supabase\migrations\$($migration.File)"
  $sqlText = [IO.File]::ReadAllText($sqlPath, [Text.Encoding]::UTF8)
  Invoke-Sql $sqlText | Out-Null
  Write-Host "Aplicada: $($migration.File)"
}
Invoke-Sql "grant usage on schema public to service_role; grant all on all tables in schema public to service_role; grant all on all sequences in schema public to service_role; notify pgrst, 'reload schema';" | Out-Null
Write-Host 'Permissoes do service_role e cache do PostgREST atualizados'

$functions = @(
  'contract-interview',
  'document-ocr',
  'generate-contract',
  'generate-receipt',
  'create-signature-link',
  'register-acceptance',
  'delete-account',
  'notification-dispatch',
  'create-checkout',
  'infinitepay-webhook'
)

Push-Location $repo
try {
  & npx.cmd --yes supabase link --project-ref $projectRef

  Write-Host '== 3/7 Configurando secrets das Edge Functions =='
  & npx.cmd --yes supabase secrets set `
    "AI_API_URL=$($cfg['AI_API_URL'])" `
    "AI_API_KEY=$($cfg['AI_API_KEY'])" `
    "AI_MODEL=$($cfg['AI_MODEL'])" `
    "PUBLIC_APP_URL=$($cfg['PUBLIC_APP_URL'])" `
    "VAPID_PUBLIC_KEY=$($cfg['VAPID_PUBLIC_KEY'])" `
    "VAPID_PRIVATE_KEY=$($cfg['VAPID_PRIVATE_KEY'])" `
    "VAPID_SUBJECT=$($cfg['VAPID_SUBJECT'])" `
    "NOTIFICATION_DISPATCH_SECRET=$($cfg['NOTIFICATION_DISPATCH_SECRET'])" `
    "PAYMENT_WEBHOOK_SECRET=$($cfg['PAYMENT_WEBHOOK_SECRET'])" `
    "INFINITEPAY_API_KEY=$($cfg['INFINITEPAY_API_KEY'])" `
    "INFINITEPAY_HANDLE=$($cfg['INFINITEPAY_HANDLE'])" `
    "RESEND_API_KEY=$($cfg['RESEND_API_KEY'])" `
    "OWNER_EMAIL=$($cfg['OWNER_EMAIL'])" `
    --yes

  Write-Host '== 4/7 Publicando Edge Functions =='
  foreach ($fn in $functions) {
    Write-Host "Publicando $fn"
    & npx.cmd --yes supabase functions deploy $fn --yes
  }
} finally {
  Pop-Location
}

Write-Host '== 5/7 Configurando Auth e Web Push =='
$authConfig = @{
  site_url = $cfg['PUBLIC_APP_URL']
  uri_allow_list = $cfg['PUBLIC_APP_URL'].TrimEnd('/') + '/*'
} | ConvertTo-Json -Compress
Invoke-RestMethod -Uri "$projectBase/config/auth" -Headers $headers -Method Patch -ContentType 'application/json' -Body $authConfig -TimeoutSec 60 | Out-Null
Write-Host 'Auth URLs configuradas'

$dispatchUrl = 'https://' + $projectRef + '.supabase.co/functions/v1/notification-dispatch'
$pushSqlTemplate = @'
create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;
do $do$
begin
  if not exists (select 1 from vault.decrypted_secrets where name = 'contratta_dispatch_url') then
    perform vault.create_secret('{0}', 'contratta_dispatch_url', 'URL do dispatch de notificacoes');
  end if;
  if not exists (select 1 from vault.decrypted_secrets where name = 'contratta_dispatch_secret') then
    perform vault.create_secret('{1}', 'contratta_dispatch_secret', 'Segredo do dispatch de notificacoes');
  end if;
  begin
    perform cron.unschedule('contratta-notification-dispatch');
  exception when others then null;
  end;
  perform cron.schedule(
    'contratta-notification-dispatch',
    '* * * * *',
    $cron$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'contratta_dispatch_url'),
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-notification-dispatch-secret',
        (select decrypted_secret from vault.decrypted_secrets where name = 'contratta_dispatch_secret')
      ),
      body := '{{}}'::jsonb
    );
    $cron$
  );
end
$do$;
'@
$pushSql = $pushSqlTemplate -f $dispatchUrl, $cfg['NOTIFICATION_DISPATCH_SECRET']
try {
  Invoke-Sql $pushSql | Out-Null
  Write-Host 'Web Push (pg_cron/pg_net/Vault) configurado'
} catch {
  Write-Host "AVISO: nao foi possivel agendar o Web Push automaticamente: $($_.Exception.Message)"
  Write-Host 'Configure manualmente o SQL da secao 6 do README.md.'
}

Write-Host '== 6/7 Publicando variaveis do frontend no GitHub Actions =='
$keyRows = Invoke-RestMethod -Uri "$projectBase/api-keys?reveal=true" -Headers $headers -Method Get -TimeoutSec 60
$anonKey = @($keyRows) | Where-Object { $_.type -eq 'publishable' } | Select-Object -First 1 -ExpandProperty api_key
if (-not $anonKey) { $anonKey = @($keyRows) | Where-Object { $_.name -match 'anon' } | Select-Object -First 1 -ExpandProperty api_key }
if (-not $anonKey) { throw 'Nao foi possivel obter a chave publishable/anon do projeto.' }
Set-GhVariable 'VITE_SUPABASE_URL' "https://$projectRef.supabase.co"
Set-GhVariable 'VITE_SUPABASE_ANON_KEY' $anonKey
Set-GhVariable 'VITE_WEB_PUSH_PUBLIC_KEY' $cfg['VAPID_PUBLIC_KEY']
Write-Host 'Variaveis do Actions configuradas'

Write-Host '== 7/7 Verificando funcoes publicadas =='
foreach ($fn in $functions) {
  $code = & curl.exe -s -o NUL -w '%{http_code}' -X OPTIONS "https://$projectRef.supabase.co/functions/v1/$fn"
  Write-Host "$fn => HTTP $code"
}

Write-Host 'Bootstrap concluido.'
