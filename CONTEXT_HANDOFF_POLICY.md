# Policy permanente di handoff del contesto — IQstatS

## Regola di arresto

Quando il contesto della chat raggiunge circa il 65%, interrompere l'avvio di nuovo
lavoro e preparare immediatamente un handoff completo. Se il runtime espone una
percentuale esplicita, usare quella. Se la percentuale non è disponibile, applicare la
regola in modo conservativo al primo segnale di pressione del contesto o prima di una
compattazione.

## Skill e fallback

1. Invocare la skill `HANDOFF` se è disponibile nella sessione.
2. Se la skill non è installata o non è richiamabile, dichiararlo senza fingere di
   averla usata e applicare il fallback documentale qui sotto.
3. Non installare skill o plugin automaticamente senza una richiesta o autorizzazione
   esplicita dell'utente.

## File da creare

Creare sempre un nuovo file nella directory temporanea del sistema operativo, non nel
workspace e senza sovrascrivere handoff precedenti:

```text
%TEMP%\IQstatS-handoff-YYYY-MM-DD-HHmm.md
```

Usare data e ora Europe/Rome. Il file deve essere UTF-8 e non deve contenere token,
header di autenticazione, valori di `.env.local`, dati personali o altri segreti.

## Contenuto minimo obbligatorio

Il nuovo handoff deve essere compatto, rimandare per percorso o URL agli artefatti che
contengono già specifiche, piani, decisioni o diff, e riportare:

1. data, ora, workspace e radice effettiva del progetto;
2. obiettivo corrente e ultima richiesta esplicita dell'utente;
3. gerarchia delle fonti e documenti operativi da rileggere;
4. decisioni confermate e decisioni ancora aperte;
5. stato Git non distruttivo e file creati/modificati;
6. attività completate, verifiche eseguite e relativi risultati;
7. processi locali in esecuzione, porte e log pertinenti;
8. task esatto da riprendere, prossimo comando sicuro e checkpoint umano;
9. blocchi, rischi, assunzioni e azioni vietate;
10. conferma esplicita che nessun segreto è stato copiato nel file.
11. una sezione `Suggested skills` con le skill da invocare nella nuova sessione.

## Comportamento dopo il salvataggio

Dopo aver verificato che il file esista e sia leggibile:

- comunicare all'utente il percorso del nuovo handoff;
- fermarsi senza iniziare altri task, script, modifiche o chiamate esterne;
- chiedere di aprire una nuova chat e di far leggere prima `AGENTS.md`, questa policy
  e il nuovo handoff;
- nella nuova chat, riprendere dal checkpoint indicato senza rifare lavoro già
  completato.

