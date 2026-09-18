# Accende l'ambiente locale che serve alle attivita' pianificate, e aspetta che risponda.
#
# Perche'. Il 17 settembre 2026 la passata delle 03:00 e' fallita senza lasciare traccia:
# Docker Desktop parte al login dell'utente, l'attivita' parte anche col PC addormentato, e
# la catena cadeva prima di aprire il giornale. Le attivita' che toccano il livello dati
# locale chiamano questo script per primo: se Docker e il container sono gia' in piedi non
# fa nulla e costa un secondo.
#
# Ambiente letto:
#     IQSTATS_PG_CONTAINER   nome del container del database locale (obbligatorio)
#     IQSTATS_DB_PORTA       porta da attendere sull'ospite (predefinito: 54322)
#
# Uso:
#     & "$PSScriptRoot\..\ops\avvia-ambiente.ps1"

$ErrorActionPreference = 'Stop'

$container = $env:IQSTATS_PG_CONTAINER
if ([string]::IsNullOrWhiteSpace($container)) { throw 'IQSTATS_PG_CONTAINER non dichiarata' }
$porta = if ($env:IQSTATS_DB_PORTA) { [int]$env:IQSTATS_DB_PORTA } else { 54322 }

function Attendi($titolo, $secondi, $prova) {
    $scadenza = (Get-Date).AddSeconds($secondi)
    while ((Get-Date) -lt $scadenza) {
        if (& $prova) { return }
        Start-Sleep -Seconds 3
    }
    throw "$titolo non pronto entro $secondi s"
}

function MotoreVivo { docker info 2>$null | Out-Null; return $LASTEXITCODE -eq 0 }

# Il motore. `docker info` fallisce con Desktop spento: allora lo si avvia e si aspetta.
if (-not (MotoreVivo)) {
    $desktop = "$env:LOCALAPPDATA\Programs\DockerDesktop\Docker Desktop.exe"
    if (-not (Test-Path $desktop)) { throw "Docker Desktop non trovato: $desktop" }
    Write-Output '== avvio Docker Desktop'
    Start-Process $desktop
    Attendi 'motore Docker' 180 { MotoreVivo }
}

# Il container. `unless-stopped` lo rialza da solo dopo un riavvio del motore, ma non dopo
# uno stop a mano: lo si avvia comunque, e avviarlo due volte non e' un errore.
if ((docker inspect -f '{{.State.Running}}' $container 2>$null) -ne 'true') {
    Write-Output "== avvio container $container"
    docker start $container | Out-Null
}

# Pronto davvero. Il container «running» non basta: la porta accetta gia' mentre Postgres
# risponde ancora «the database system is starting up» (misurato il 17 settembre 2026).
Attendi "database in $container" 120 {
    docker exec $container pg_isready -q -U postgres 2>$null | Out-Null
    $LASTEXITCODE -eq 0
}
Write-Output "== ambiente pronto: $container sulla porta $porta"
