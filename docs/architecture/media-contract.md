# Contratto media IQstatS — prima slice

## Scopo e perimetro

La prima slice rende i loghi delle due squadre nel dossier partita. Non introduce
persistenza, CDN applicativa, archivio binario, immagini di giocatori, foto impianti
o media nella lista gare. Ogni elemento usa un ID già presente nel contratto `MatchDetail`.

La fonte espone immagini per `team`, `league`, `player`, `manager` e `venue`, ma la UI
non riceve mai il suo URL né costruisce percorsi a partire da identificativi esterni.

## Contratto di trasporto

`GET /api/iqstats/v1/media/{kind}/{entityId}`

- `kind`: enum chiuso `team | league | player | manager | venue`;
- `entityId`: intero positivo;
- query string vietata;
- accesso: entitlement `matches.detail.read` verificato dal server;
- `200`: solo `image/png` o `image/webp`, servito dal proxy same-origin;
- `404`: asset assente alla fonte; la UI nasconde l’elemento decorativo, senza
  placeholder;
- errori fonte: status generico, senza host, token, header o payload della fonte;
- header: `private, no-store`, `nosniff` e same-origin resource policy.

Il proxy fissa internamente il formato relativo `/img/{kind}/{entityId}/?bg=transparent`.
Accetta al massimo 5 MiB dichiarati dalla fonte e non inoltra redirect o input URL.

## Provenienza e limiti

L’immagine eredita la provenienza e il timestamp della gara a cui è affiancata; non
è un dato analitico né un segnale. Il logo è decorativo poiché il nome della squadra è
sempre presente in testo. Non si deduce l’assenza del team dall’assenza della sua
immagine.

Il `no-store` è intenzionale: cache, asset storage, retention e CDN richiedono un
gate distinto prima di trasformare questa slice in persistenza del provider.

## Criteri di accettazione

- Il browser richiede soltanto il proxy IQstatS same-origin.
- Nessun token o URL della fonte appare nel bundle client, HTML, log o contratto UI.
- Tipi, ID, MIME type, redirect e dimensione dichiarata sono validati lato server.
- Asset assente o non valido non genera un placeholder né un contenuto inventato.
- La visualizzazione conserva dimensioni fisse, alt decorativo e nessun layout shift.
