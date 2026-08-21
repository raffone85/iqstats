# Passata notturna della sincronizzazione del motore di proiezione.
#
# Deciso il 21 agosto 2026: una volta a notte. Fra due passate la storia del motore puo'
# restare indietro al massimo di un giorno, e le gare che finiscono dopo l'orario della
# passata aspettano la notte successiva: l'orario va messo dopo l'ultimo fischio finale
# della sera, non a mezzanotte.
#
# **Il tetto di richieste resta obbligatorio, ma non tronca piu'.** La scoperta dice
# quante gare nuove ci sono, e la raccolta riceve il tetto che le serve: quattro
# richieste per gara piu' un margine. L'argomento continua a essere esplicito - una
# raccolta senza tetto e' una decisione che lo script non prende - ma nessuna passata si
# ferma a meta' per un numero scelto a mano.
#
# La catena e' quella gia' validata, nell'ordine: scoperta, raccolta, normalizzazione in
# Python, esportazione dei lotti, riferimenti dall'archivio, caricamento nel database. La
# normalizzazione non e' stata riscritta e non lo sara'.
#
# Uso:
#     powershell -ExecutionPolicy Bypass -File scripts\projection\harvest\sync_nightly.ps1
#
# Ambiente letto, nessuno obbligatorio tranne dove detto:
#     IQSTATS_DATABASE_URL  connessione del livello dati; senza, la catena si ferma dopo
#                           i lotti e stampa il comando che resta da dare
#     IQSTATS_PSQL          nome o percorso del cliente psql (predefinito: psql)
#     IQSTATS_PG_CONTAINER  nome del container dove vive il psql da usare; utente e
#                           database si ricavano da IQSTATS_DATABASE_URL. Serve finche'
#                           il database del motore vive in un container locale

$ErrorActionPreference = 'Stop'

$radice = Resolve-Path (Join-Path $PSScriptRoot '..\..\..')
$python = Join-Path $radice '.venv\Scripts\python.exe'
$sync = Join-Path $PSScriptRoot 'sync_new_matches.py'
$nuove = Join-Path $PSScriptRoot 'data\gare-nuove.json'
$raccolta = Join-Path $PSScriptRoot 'data\raccolta-ultima.json'
$dataset = Join-Path $radice 'scripts\projection\dataset'

if (-not (Test-Path $python)) { throw "python del progetto assente: $python" }

function Passo($titolo, $file, $argomenti) {
    Write-Output "== $titolo"
    & $python $file @argomenti
    if ($LASTEXITCODE -ne 0) { throw "$titolo fallito (uscita $LASTEXITCODE)" }
}

# Il cliente del database, se c'e'. Senza, la catena arriva fino ai lotti e dice cosa
# resta da dare: non finge di aver caricato.
#
# Due strade. Se `IQSTATS_PG_CONTAINER` e' dichiarata si usa il `psql` che vive dentro
# quel container, perche' su questa macchina non ce n'e' un altro e senza il caricamento
# la passata si fermerebbe ai lotti. Utente e database si ricavano dalla connessione, non
# si indovinano. Il ponte serve finche' il database del motore vive in un container
# locale: su un ospite con un cliente vero basta non dichiarare la variabile.
$psql = $env:IQSTATS_PSQL
if ([string]::IsNullOrWhiteSpace($psql)) { $psql = 'psql' }
$connessione = $env:IQSTATS_DATABASE_URL
$container = $env:IQSTATS_PG_CONTAINER
$utente = $null
$database = $null
$conDatabase = $false

if (-not [string]::IsNullOrWhiteSpace($connessione)) {
    if (-not [string]::IsNullOrWhiteSpace($container)) {
        $indirizzo = [uri]$connessione
        $utente = $indirizzo.UserInfo.Split(':')[0]
        $database = $indirizzo.AbsolutePath.TrimStart('/')
        if ([string]::IsNullOrWhiteSpace($utente) -or [string]::IsNullOrWhiteSpace($database)) {
            throw "IQSTATS_DATABASE_URL non dichiara utente e database: servono per il psql del container"
        }
        $conDatabase = [bool](Get-Command docker -ErrorAction SilentlyContinue)
    } else {
        $conDatabase = [bool](Get-Command $psql -ErrorAction SilentlyContinue)
    }
}

function Sql($istruzione) {
    if ($container) {
        $esito = & docker exec $container psql -U $utente -d $database -At -v ON_ERROR_STOP=1 -c $istruzione
    } else {
        $esito = & $psql $connessione -At -v ON_ERROR_STOP=1 -c $istruzione
    }
    if ($LASTEXITCODE -ne 0) { throw "istruzione SQL fallita (uscita $LASTEXITCODE)" }
    return $esito
}

# La riga del giornale si apre **prima** della raccolta: una passata che fallisce a meta'
# deve lasciare traccia, e chiudere da fuori direbbe «completata» comunque, quindi la
# chiusura riuscita la scrive il SQL del caricamento. Qui si chiude solo il fallimento.
$giornale = $null
if ($conDatabase) {
    # `psql` stampa anche l'etichetta del comando - `INSERT 0 1` - e PowerShell la
    # raccoglie insieme all'identificativo: si prende la prima riga e si pretende che sia
    # un numero, altrimenti finirebbe dentro il SQL successivo.
    $risposta = Sql @"
insert into private.football_sync_runs (data_slice, run_mode, status)
values ('DATA-6', 'incremental', 'running') returning id
"@
    $giornale = @($risposta | Where-Object { $_ -match '^\d+$' }) | Select-Object -First 1
    if (-not $giornale) { throw "il giornale non ha restituito un identificativo: $risposta" }
    Write-Output "giornale: riga $giornale aperta"
} else {
    Write-Output 'senza database: nessuna riga nel giornale, nessun caricamento'
}

trap {
    if ($giornale) {
        $motivo = ($_.Exception.Message -replace "'", "''")
        if ($motivo.Length -gt 200) { $motivo = $motivo.Substring(0, 200) }
        $chiusura = @"
update private.football_sync_runs
set status = 'failed', completed_at = now(), error_code = '$motivo'
where id = $giornale and status = 'running'
"@
        if ($container) {
            & docker exec $container psql -U $utente -d $database -At -c $chiusura
        } else {
            & $psql $connessione -At -c $chiusura
        }
    }
    break
}

# 1. Scoperta. Una richiesta per pagina di competizione: trenta ne bastano, duecento sono
#    il margine perche' una lega con molte pagine non tronchi la sua.
Passo 'scoperta' $sync @('--scopri', '--max-richieste', '200')

if (-not (Test-Path $nuove)) { throw "la scoperta non ha scritto $nuove" }
$elenco = Get-Content $nuove -Raw -Encoding UTF8 | ConvertFrom-Json
$gare = @($elenco.gare).Count
# Una scoperta troncata direbbe «zero gare nuove» dove ce ne sono: si ferma invece di
# raccogliere meno di quello che c'e' e chiamarla una passata riuscita.
if ($elenco.tetto_raggiunto) {
    throw "la scoperta ha esaurito il tetto dopo $($elenco.richieste_usate) richieste: e' incompleta"
}
Write-Output "gare nuove scoperte: $gare (in $($elenco.competizioni_esaminate) competizioni, $($elenco.richieste_usate) richieste)"

if ($gare -eq 0) {
    Write-Output 'niente da raccogliere: la passata finisce qui'
    if ($giornale) {
        Sql @"
update private.football_sync_runs
set status = 'completed', completed_at = now(),
    requests_limit = 200, requests_started = $($elenco.richieste_usate),
    requests_completed = $($elenco.richieste_usate)
where id = $giornale
"@ | Out-Null
    }
    exit 0
}

# 2. Raccolta. Quattro richieste per gara - pannello e mappa dei tiri arrivano insieme da
#    /stats/, poi episodi, statistiche per giocatore e dettaglio - piu' cinquanta di
#    margine per i ritentativi.
$tetto = $gare * 4 + 50
Passo "raccolta di $gare gare (tetto $tetto)" $sync @('--raccogli', '--max-richieste', "$tetto")

# 3. Normalizzazione: gli script Python gia' validati, non una seconda scrittura.
Passo 'osservazioni' (Join-Path $dataset 'build_observations.py') @()
Passo 'tiri' (Join-Path $dataset 'build_shots.py') @()
Passo 'cartellini' (Join-Path $dataset 'reconstruct_cards.py') @()
Passo 'giocatori' (Join-Path $dataset 'build_players.py') @()
Passo 'lotti' (Join-Path $dataset 'export_observations_batch.py') @()

# 4. Riferimenti dall'archivio e caricamento. Ogni innesto e' `on conflict do nothing`:
#    dove DATA-1 ha gia' scritto una riga, vince la sua.
$riferimenti = Join-Path $env:TEMP ('iqstats-riferimenti-' + (Get-Date -Format 'yyyyMMdd-HHmm'))
New-Item -ItemType Directory -Force $riferimenti | Out-Null
Passo 'riferimenti' (Join-Path $dataset 'export_reference_local.py') @($riferimenti)

# Le richieste della passata: quelle della scoperta piu' quelle della raccolta, lette dai
# due rendiconti e non stimate.
$richieste = $elenco.richieste_usate
if (Test-Path $raccolta) {
    $reso = Get-Content $raccolta -Raw -Encoding UTF8 | ConvertFrom-Json
    $richieste = $richieste + $reso.richieste_usate
    if ($reso.tetto_raggiunto) { throw "la raccolta ha esaurito il tetto ${tetto}: e' incompleta" }
}

# Il SQL lo scrive Python direttamente: `Out-File` non e' una condotta di byte
# affidabile, e un lotto e' una riga sola da qualche megabyte. La chiusura riuscita della
# riga del giornale sta dentro questo SQL, in coda: se `psql` si ferma prima, non ci
# arriva e la riga resta `running`, che e' la verita'.
$sql = Join-Path $riferimenti 'carico.sql'
$carico = @($riferimenti, '--sql', $sql)
if ($giornale) {
    $carico += @('--giornale', "$giornale", '--richieste', "$richieste", '--tetto', "$($tetto + 200)")
}
Passo 'SQL di caricamento' (Join-Path $dataset 'load_reference_and_batches.py') $carico

if (-not $conDatabase) {
    Write-Output "senza database: il caricamento non parte."
    Write-Output "resta da dare:  psql `"<connessione>`" -v ON_ERROR_STOP=1 -f `"$sql`""
    exit 0
}

Write-Output '== caricamento'
if ($container) {
    # Il `psql` del container non vede il disco dell'ospite: il file entra con `docker cp`
    # invece di passare da una condotta, che su righe da cinque megabyte non regge.
    & docker cp $sql "${container}:/tmp/carico.sql"
    if ($LASTEXITCODE -ne 0) { throw "copia del SQL nel container fallita (uscita $LASTEXITCODE)" }
    & docker exec $container psql -U $utente -d $database -v ON_ERROR_STOP=1 -f /tmp/carico.sql
    $uscita = $LASTEXITCODE
    & docker exec $container rm -f /tmp/carico.sql
    if ($uscita -ne 0) { throw "caricamento fallito (uscita $uscita)" }
} else {
    & $psql $connessione -v ON_ERROR_STOP=1 -f $sql
    if ($LASTEXITCODE -ne 0) { throw "caricamento fallito (uscita $LASTEXITCODE)" }
}
Remove-Item $sql -Force
Write-Output "passata completata: $gare gare, $richieste richieste"
