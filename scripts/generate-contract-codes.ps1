param(
  [int]$Count = 1,
  [int]$CreditsPerCode = 1,
  [string]$SecretsFile = (Join-Path $env:TEMP 'opencode\contratta-secrets.env')
)

$ErrorActionPreference = 'Stop'
$projectRef = 'thmxhgzjwqujvpczakpf'
$projectUrl = "https://$projectRef.supabase.co"

if (-not (Test-Path -LiteralPath $SecretsFile)) { throw "Arquivo de segredos nao encontrado: $SecretsFile" }
$cfg = @{}
foreach ($line in [IO.File]::ReadAllLines($SecretsFile)) {
  if ($line -match '^([A-Z0-9_]+)=(.*)$') { $cfg[$Matches[1]] = $Matches[2] }
}
$token = $cfg['SUPABASE_ACCESS_TOKEN']
if (-not $token) { throw 'SUPABASE_ACCESS_TOKEN vazio.' }

$headers = @{ Authorization = 'Bearer ' + $token }
$keys = Invoke-RestMethod -Uri "https://api.supabase.com/v1/projects/$projectRef/api-keys?reveal=true" -Headers $headers -Method Get -TimeoutSec 60
$serviceKey = @($keys) | Where-Object { $_.type -eq 'legacy' -and $_.name -eq 'service_role' } | Select-Object -First 1 -ExpandProperty api_key
if (-not $serviceKey) { throw 'Nao foi possivel obter a chave service_role.' }

$adminHeaders = @{ apikey = $serviceKey; Authorization = "Bearer $serviceKey"; 'Content-Type' = 'application/json' }
$alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
$created = @()

for ($i = 0; $i -lt $Count; $i++) {
  $part1 = -join (1..4 | ForEach-Object { $alphabet[(Get-Random -Maximum $alphabet.Length)] })
  $part2 = -join (1..4 | ForEach-Object { $alphabet[(Get-Random -Maximum $alphabet.Length)] })
  $code = "CONTRATTO-$part1-$part2"
  $hash = [BitConverter]::ToString([Security.Cryptography.SHA256]::Create().ComputeHash([Text.Encoding]::UTF8.GetBytes($code))).Replace('-', '').ToLower()
  $payload = @{ code_hash = $hash; credits = $CreditsPerCode } | ConvertTo-Json -Compress
  $bodyPath = Join-Path $env:TEMP 'opencode\activation-code.json'
  [IO.File]::WriteAllText($bodyPath, $payload, [Text.UTF8Encoding]::new($false))
  $null = & curl.exe -s -X POST -H "apikey: $serviceKey" -H "Authorization: Bearer $serviceKey" -H 'Content-Type: application/json' --data-binary "@$bodyPath" "$projectUrl/rest/v1/activation_codes"
  $created += $code
}

Write-Host 'Codigos gerados (envie um ao cliente apos confirmar o pagamento):'
$created | ForEach-Object { Write-Host $_ }
