# Raccolta ravvicinata delle quote, Expected rigenerato dopo di lei, cache della pagina
# giocatori scaldata. Attivita' pianificata «IQstatS - quote ravvicinate», alle 09:00 e alle 15:00.
#
# Perche' due orari. Il banco apre le linee di squadra fra le dodici e le sei ore dal fischio
# (misurato il 18 settembre 2026 su Monza-Sassuolo): alle 09:00 si prendono le gare fino alle
# 21:00, alle 15:00 quelle della sera e della notte sudamericana. Ogni passata scrive un file
# a se', ed Expected tiene per ogni gara la lettura piu' recente.
#
# Perche' Expected dopo. L'artefatto legge il palinsesto che trova su disco: rigenerato prima
# della raccolta, porterebbe le linee di ieri.
#
# Commit e push del solo `expected-famiglie.json` su `main` sono autorizzati ogni giorno
# dall'utente (17 settembre 2026). Se il ramo non e' `main` lo script non pubblica e lo scrive.
#
# Uso:
#     powershell -ExecutionPolicy Bypass -File scripts\quote\quote_ravvicinate.ps1 [-SenzaRaccolta]
# `-SenzaRaccolta` riprende un giro caduto dopo la raccolta, che costa mezz'ora.

param([switch]$SenzaRaccolta)

# Non `Stop`: l'attivita' manda ogni flusso nel log (`*>&1`), e PowerShell 5.1 trasforma allora
# ogni riga su stderr di un programma esterno in un errore - l'avviso di node, il log di
# scrapling, i servizi fermi di Supabase. Con `Stop` il giro cadeva al primo avviso (19/09/2026).
# Ci si ferma sui codici d'uscita, controllati passo per passo con `throw`.
$ErrorActionPreference = 'Continue'

$radice = Resolve-Path (Join-Path $PSScriptRoot '..\..')
$web = Join-Path $radice 'apps\web'
# Il Python con scrapling e' quello dell'utente, non il .venv del motore.
$python = "$env:LOCALAPPDATA\Python\pythoncore-3.14-64\python.exe"
$artefatto = 'apps/web/src/server/iqstats/artefatti/expected-famiglie.json'

if (-not (Test-Path $python)) { throw "python con scrapling assente: $python" }

# Expected legge il livello dati locale: Docker puo' essere spento se nessuno ha fatto login.
if ($env:IQSTATS_PG_CONTAINER) { & (Join-Path $radice 'scripts\ops\avvia-ambiente.ps1') }

Set-Location $radice

if (-not $SenzaRaccolta) {
    Write-Output '== raccolta ravvicinata'
    & $python scripts\quote\fastbet-quote.py --entro-ore 12
    if ($LASTEXITCODE -ne 0) { throw "raccolta fallita (uscita $LASTEXITCODE)" }
}

Write-Output '== Expected'
# La connessione al livello dati locale non sta in `.env.local`: la da' la CLI di Supabase,
# come in `apps/web/scripts/with-local-data1.mjs`. Vive solo nell'ambiente di questo processo
# e non si stampa.
$env:Path = "$env:LOCALAPPDATA\Programs\DockerDesktop\resources\bin;$env:Path"
$stato = & (Join-Path $radice 'node_modules\.bin\supabase.cmd') status -o env 2>$null
$riga = $stato | Where-Object { $_ -like 'DB_URL=*' } | Select-Object -First 1
if (-not $riga) { throw 'livello dati locale non raggiungibile' }
$env:IQSTATS_PROJECTION_DATABASE_URL = $riga.Substring('DB_URL='.Length).Trim().Trim('"', "'")
if (([uri]$env:IQSTATS_PROJECTION_DATABASE_URL).Host -notin @('127.0.0.1', 'localhost')) {
    throw 'la CLI ha dato una connessione non locale'
}
Push-Location $web
& node --env-file=.env.local --conditions=react-server --import ./test/risolutore-ts.mjs `
    --experimental-strip-types scripts/expected-famiglie.ts
$uscita = $LASTEXITCODE
Pop-Location
if ($uscita -ne 0) { throw "Expected fallito (uscita $uscita)" }

Write-Output '== pubblicazione'
$ramo = (& git rev-parse --abbrev-ref HEAD).Trim()
& git diff --quiet -- $artefatto
if ($LASTEXITCODE -eq 0) {
    Write-Output 'Expected invariato: niente da pubblicare'
} elseif ($ramo -ne 'main') {
    Write-Output "ramo $ramo, non main: Expected rigenerato ma non pubblicato"
} else {
    # Solo l'artefatto: qualunque altra modifica in corso nel repository resta fuori.
    & git commit -m ("data: quote ravvicinate delle " + (Get-Date -Format 'dd/MM HH:mm') + ", Expected rigenerato") -- $artefatto
    if ($LASTEXITCODE -ne 0) { throw "commit fallito (uscita $LASTEXITCODE)" }
    & git push origin main
    if ($LASTEXITCODE -ne 0) { throw "push fallito (uscita $LASTEXITCODE)" }
}

# La pagina dei giocatori del giorno legge 400-500 rose: a cache vuota la prima visita
# aspettava minuti (misurato il 18 settembre 2026). La si apre qui perche' non tocchi a
# un utente. Un errore qui non ferma niente: e' solo un riscaldamento.
Write-Output '== riscaldamento /giocatori/oggi'
try {
    $inizio = Get-Date
    $r = Invoke-WebRequest -UseBasicParsing -UserAgent 'Mozilla/5.0 IQstatS-riscaldamento' `
        -TimeoutSec 300 -Uri 'https://iqstats-indol.vercel.app/giocatori/oggi'
    Write-Output ("{0} in {1:N0} s" -f $r.StatusCode, ((Get-Date) - $inizio).TotalSeconds)
} catch {
    Write-Output "riscaldamento non riuscito: $($_.Exception.Message)"
}
