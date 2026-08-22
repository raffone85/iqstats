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
# **Il caricamento arriva a piu' di un database.** Deciso il 22 agosto 2026: la passata
# aggiornava soltanto il container locale, e la produzione restava ferma. Lo stesso SQL,
# gia' idempotente, si applica a ogni destinazione dichiarata - prima il locale, poi
# quello in linea - con la propria riga di giornale. Ogni destinazione genera il proprio
# file: l'identificativo della riga e' cucito dentro il SQL, lotto per lotto.
#
# Ambiente letto, nessuno obbligatorio tranne dove detto. Le due connessioni si leggono
# dall'ambiente e, se non e' dichiarato, da `.env.local` nella radice: il segreto sta in
# un posto solo e si aggiorna in un posto solo quando viene rigenerato.
#     IQSTATS_DATABASE_URL         connessione del livello dati locale; senza nessuna
#                                  connessione la catena si ferma dopo i lotti e stampa
#                                  il comando che resta da dare
#     IQSTATS_REMOTE_DATABASE_URL  connessione del database in linea, con un ruolo che
#                                  sappia scrivere: senza, la produzione non si aggiorna
#     IQSTATS_PSQL                 nome o percorso del cliente psql (predefinito: psql)
#     IQSTATS_PG_CONTAINER         nome del container dove vive il psql da usare. Serve
#                                  finche' sull'ospite non c'e' un cliente vero

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
# la passata si fermerebbe ai lotti. Utente, database, ospite e porta si ricavano dalla
# connessione, non si indovinano. Il ponte serve finche' sull'ospite non c'e' un cliente
# vero: con uno, basta non dichiarare la variabile.
$psql = $env:IQSTATS_PSQL
if ([string]::IsNullOrWhiteSpace($psql)) { $psql = 'psql' }
$container = $env:IQSTATS_PG_CONTAINER

# Una destinazione del caricamento. `locale` dice che il database vive dentro il
# container stesso: li' l'ospite e la porta della connessione sono quelli dell'ospite e
# non risponderebbero, quindi si passa dal socket interno con il solo utente e database.
function Destinazione($nome, $connessione) {
    if ([string]::IsNullOrWhiteSpace($connessione)) { return $null }
    $indirizzo = [uri]$connessione
    $credenziali = $indirizzo.UserInfo.Split(':')
    $utente = [uri]::UnescapeDataString($credenziali[0])
    $database = [uri]::UnescapeDataString($indirizzo.AbsolutePath.TrimStart('/'))
    if ([string]::IsNullOrWhiteSpace($utente) -or [string]::IsNullOrWhiteSpace($database)) {
        throw "la connessione $nome non dichiara utente e database: servono per il psql del container"
    }
    return @{
        nome = $nome
        connessione = $connessione
        utente = $utente
        database = $database
        parola = if ($credenziali.Count -gt 1) { [uri]::UnescapeDataString($credenziali[1]) } else { '' }
        ospite = $indirizzo.Host
        porta = "$($indirizzo.Port)"
        locale = ($indirizzo.Host -in @('127.0.0.1', 'localhost', '::1'))
        giornale = $null
    }
}

# Il segreto vive in un posto solo. `.env.local` e' ignorato da git ed e' la copia che si
# aggiorna quando la parola d'ordine viene rigenerata: l'ambiente vince se dichiarato,
# altrimenti si legge da li', invece di tenere una terza copia nel registro dell'utente.
function Connessione($nome) {
    $valore = [Environment]::GetEnvironmentVariable($nome)
    if (-not [string]::IsNullOrWhiteSpace($valore)) { return $valore }
    $file = Join-Path $radice '.env.local'
    if (-not (Test-Path $file)) { return $null }
    $riga = Select-String -Path $file -Pattern ('^\s*' + $nome + '\s*=') | Select-Object -First 1
    if (-not $riga) { return $null }
    return ($riga.Line -replace ('^\s*' + $nome + '\s*='), '').Trim().Trim('"').Trim("'")
}

$destinazioni = @(@(
    (Destinazione 'locale' (Connessione 'IQSTATS_DATABASE_URL')),
    (Destinazione 'in linea' (Connessione 'IQSTATS_REMOTE_DATABASE_URL'))
) | Where-Object { $_ })

$conDatabase = $false
if ($destinazioni.Count -gt 0) {
    if ($container) {
        $conDatabase = [bool](Get-Command docker -ErrorAction SilentlyContinue)
    } else {
        $conDatabase = [bool](Get-Command $psql -ErrorAction SilentlyContinue)
    }
}

# La connessione non passa mai come argomento: `docker exec -e NOME` senza valore
# inoltra la variabile per nome, quindi la parola d'ordine non compare nella riga di
# comando ne' nei log della passata.
function Psql($dest, $argomenti) {
    if (-not $container) { return & $psql $dest.connessione @argomenti }
    $env:PGUSER = $dest.utente
    $env:PGDATABASE = $dest.database
    $env:PGPASSWORD = $dest.parola
    $ambiente = @('-e', 'PGUSER', '-e', 'PGDATABASE', '-e', 'PGPASSWORD')
    if (-not $dest.locale) {
        $env:PGHOST = $dest.ospite
        $env:PGPORT = $dest.porta
        $ambiente += @('-e', 'PGHOST', '-e', 'PGPORT')
    }
    return & docker exec @ambiente $container psql @argomenti
}

function Sql($dest, $istruzione) {
    $esito = Psql $dest @('-At', '-v', 'ON_ERROR_STOP=1', '-c', $istruzione)
    if ($LASTEXITCODE -ne 0) { throw "istruzione SQL fallita su $($dest.nome) (uscita $LASTEXITCODE)" }
    return $esito
}

# La riga del giornale si apre **prima** della raccolta: una passata che fallisce a meta'
# deve lasciare traccia, e chiudere da fuori direbbe «completata» comunque, quindi la
# chiusura riuscita la scrive il SQL del caricamento. Qui si chiude solo il fallimento.
if ($conDatabase) {
    foreach ($dest in $destinazioni) {
        # `psql` stampa anche l'etichetta del comando - `INSERT 0 1` - e PowerShell la
        # raccoglie insieme all'identificativo: si prende la prima riga e si pretende che
        # sia un numero, altrimenti finirebbe dentro il SQL successivo.
        $risposta = Sql $dest @"
insert into private.football_sync_runs (data_slice, run_mode, status)
values ('DATA-6', 'incremental', 'running') returning id
"@
        $dest.giornale = @($risposta | Where-Object { $_ -match '^\d+$' }) | Select-Object -First 1
        if (-not $dest.giornale) { throw "il giornale $($dest.nome) non ha restituito un identificativo: $risposta" }
        Write-Output "giornale $($dest.nome): riga $($dest.giornale) aperta"
    }
} else {
    Write-Output 'senza database: nessuna riga nel giornale, nessun caricamento'
}

# Il fallimento lo scrive chi pianifica, la riuscita la scrive il SQL del caricamento.
# `where status = 'running'` fa il resto: una destinazione gia' chiusa `completed` non
# viene toccata, quindi un locale riuscito e un remoto fallito restano due verita'
# distinte.
trap {
    $motivo = ($_.Exception.Message -replace "'", "''")
    if ($motivo.Length -gt 200) { $motivo = $motivo.Substring(0, 200) }
    foreach ($dest in $destinazioni) {
        if (-not $dest.giornale) { continue }
        Psql $dest @('-At', '-c', @"
update private.football_sync_runs
set status = 'failed', completed_at = now(), error_code = '$motivo'
where id = $($dest.giornale) and status = 'running'
"@)
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
    foreach ($dest in $destinazioni) {
        if (-not $dest.giornale) { continue }
        Sql $dest @"
update private.football_sync_runs
set status = 'completed', completed_at = now(),
    requests_limit = 200, requests_started = $($elenco.richieste_usate),
    requests_completed = $($elenco.richieste_usate)
where id = $($dest.giornale)
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
if (-not $conDatabase) {
    $sql = Join-Path $riferimenti 'carico.sql'
    Passo 'SQL di caricamento' (Join-Path $dataset 'load_reference_and_batches.py') @($riferimenti, '--sql', $sql)
    Write-Output "senza database: il caricamento non parte."
    Write-Output "resta da dare:  psql `"<connessione>`" -v ON_ERROR_STOP=1 -f `"$sql`""
    exit 0
}

# Una destinazione per volta, nell'ordine in cui sono dichiarate: prima il locale, poi
# quello in linea. Il SQL si rigenera per ognuna perche' porta dentro l'identificativo
# della propria riga di giornale, lotto per lotto, e la chiusura `completed` in coda.
foreach ($dest in $destinazioni) {
    $etichetta = ($dest.nome -replace '[^a-z0-9]', '-')
    $sql = Join-Path $riferimenti "carico-$etichetta.sql"
    $carico = @($riferimenti, '--sql', $sql)
    if ($dest.giornale) {
        $carico += @('--giornale', "$($dest.giornale)", '--richieste', "$richieste", '--tetto', "$($tetto + 200)")
    }
    Passo "SQL di caricamento ($($dest.nome))" (Join-Path $dataset 'load_reference_and_batches.py') $carico

    Write-Output "== caricamento ($($dest.nome))"
    if ($container) {
        # Il `psql` del container non vede il disco dell'ospite: il file entra con
        # `docker cp` invece di passare da una condotta, che su righe da cinque megabyte
        # non regge.
        & docker cp $sql "${container}:/tmp/$etichetta.sql"
        if ($LASTEXITCODE -ne 0) { throw "copia del SQL nel container fallita (uscita $LASTEXITCODE)" }
        Psql $dest @('-v', 'ON_ERROR_STOP=1', '-f', "/tmp/$etichetta.sql")
        $uscita = $LASTEXITCODE
        & docker exec $container rm -f "/tmp/$etichetta.sql"
        if ($uscita -ne 0) { throw "caricamento su $($dest.nome) fallito (uscita $uscita)" }
    } else {
        Psql $dest @('-v', 'ON_ERROR_STOP=1', '-f', $sql)
        if ($LASTEXITCODE -ne 0) { throw "caricamento su $($dest.nome) fallito (uscita $LASTEXITCODE)" }
    }
    Remove-Item $sql -Force
}
Write-Output "passata completata: $gare gare, $richieste richieste, $($destinazioni.Count) destinazioni"
