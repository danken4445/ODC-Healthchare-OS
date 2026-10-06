param([string]$DatabaseContainer = "")

$ErrorActionPreference = 'Stop'
$setupPath = Join-Path $PSScriptRoot 'expiry_tracking_concurrency_setup.sql'
if (-not $DatabaseContainer) {
  $DatabaseContainer = docker ps --filter 'name=^/supabase_db_' --format '{{.Names}}' | Select-Object -First 1
}
if (-not $DatabaseContainer) { throw 'No local Supabase database container found.' }

# This script is intentionally run after the SQL setup fixture is added with the
# migration. It launches two authenticated transactions simultaneously and
# verifies that FEFO row locking permits only available stock to be consumed.
if (-not (Test-Path $setupPath)) {
  throw "Missing concurrency setup fixture: $setupPath"
}

Get-Content -Raw $setupPath | docker exec -i $DatabaseContainer psql -U postgres -d postgres -v ON_ERROR_STOP=1
if ($LASTEXITCODE -ne 0) { throw 'Concurrency fixture setup failed.' }

$tagSql = @'
begin;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000106',true);
set local role authenticated;
select public.tag_inventory_usage('60000000-0000-0000-0000-000000000001','92000000-0000-0000-0000-000000000001',3,'90000000-0000-0000-0000-000000000001');
commit;
'@
$one = Start-Job -ScriptBlock { param($container, $sql) $out = (& docker exec $container psql -U postgres -d postgres -v ON_ERROR_STOP=1 -c $sql 2>&1 | Out-String); [pscustomobject]@{ ExitCode = $LASTEXITCODE; Output = $out } } -ArgumentList $DatabaseContainer, $tagSql
$two = Start-Job -ScriptBlock { param($container, $sql) $out = (& docker exec $container psql -U postgres -d postgres -v ON_ERROR_STOP=1 -c $sql 2>&1 | Out-String); [pscustomobject]@{ ExitCode = $LASTEXITCODE; Output = $out } } -ArgumentList $DatabaseContainer, $tagSql
Wait-Job $one, $two | Out-Null
$results = @()
$results += @(Receive-Job $one -ErrorAction SilentlyContinue 2>$null | Where-Object { $_.PSObject.Properties.Name -contains 'ExitCode' })
$results += @(Receive-Job $two -ErrorAction SilentlyContinue 2>$null | Where-Object { $_.PSObject.Properties.Name -contains 'ExitCode' })
Remove-Job $one, $two

if (@($results | Where-Object { $_.ExitCode -eq 0 }).Count -ne 1) {
  throw "Expected exactly one successful concurrent tag; results: $($results | ConvertTo-Json -Compress)"
}
if (@($results | Where-Object { $_.ExitCode -ne 0 -and $_.Output -notmatch 'Insufficient usable stock; expired batches cannot be tagged\.' }).Count -ne 0) {
  throw "Concurrent tag failed for an unexpected reason: $($results | ConvertTo-Json -Compress)"
}
$finalState = & docker exec $DatabaseContainer psql -U postgres -d postgres -At -v ON_ERROR_STOP=1 -c "select (select quantity from public.inventory_batches where lot_number = 'CONCURRENT')::text || ',' || (select quantity from public.department_stock where id = '92000000-0000-0000-0000-000000000001')::text"
if ($finalState -ne '0.000,0.000') { throw "Expected final batch and stock quantity to be 0; got $finalState" }
Write-Output "Concurrency passed: one tag succeeded, loser was insufficient usable stock, final quantities were $finalState."
