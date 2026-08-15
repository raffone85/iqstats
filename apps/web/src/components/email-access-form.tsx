"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";

import {
  isEmailCodePublicErrorCode,
  type EmailCodePublicErrorCode,
} from "@/lib/auth/email-code";

type AccessPhase = "email" | "code";
type SubmitState = "idle" | "sending" | "verifying" | "error";
const EMAIL_CODE_PATTERN = /^\d{6}$/u;
const NON_DIGITS_PATTERN = /\D/gu;

const errorMessages: Readonly<Record<EmailCodePublicErrorCode, string>> = {
  invalid_request: "La richiesta non è valida. Ricarica la pagina e riprova.",
  invalid_email: "Inserisci un indirizzo email reale e completo. Gli indirizzi di esempio o test non sono accettati.",
  invalid_code: "Il codice non è corretto oppure è scaduto. Controllalo o richiedine uno nuovo.",
  email_delivery_restricted: "L’invio ai nuovi indirizzi non è ancora configurato. Per ora il codice può essere recapitato soltanto a un indirizzo autorizzato al progetto.",
  rate_limited: "Hai fatto troppi tentativi in poco tempo. Attendi qualche minuto e riprova.",
  auth_unavailable: "Il servizio di accesso non è disponibile in questo momento. Riprova tra poco.",
};

async function responseErrorCode(response: Response): Promise<EmailCodePublicErrorCode> {
  const payload: unknown = await response.json().catch(() => null);
  if (
    typeof payload === "object" &&
    payload !== null &&
    "error" in payload &&
    typeof payload.error === "object" &&
    payload.error !== null &&
    "code" in payload.error &&
    isEmailCodePublicErrorCode(payload.error.code)
  ) {
    return payload.error.code;
  }
  return "auth_unavailable";
}

export function EmailAccessForm({ nextPath }: Readonly<{ nextPath: string }>) {
  const emailInputRef = useRef<HTMLInputElement>(null);
  const codeInputRef = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<AccessPhase>("email");
  const [state, setState] = useState<SubmitState>("idle");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [message, setMessage] = useState("");
  const [fieldError, setFieldError] = useState("");

  useEffect(() => {
    if (phase === "code") codeInputRef.current?.focus();
  }, [phase]);

  function validateEmail(input: HTMLInputElement): boolean {
    const valid = Boolean(input.value.trim()) && input.validity.valid;
    setFieldError(
      valid
        ? ""
        : "Inserisci un indirizzo email completo, per esempio nome@dominio.it.",
    );
    return valid;
  }

  function validateCode(input: HTMLInputElement): boolean {
    const valid = EMAIL_CODE_PATTERN.test(input.value);
    setFieldError(valid ? "" : "Inserisci tutte le 6 cifre ricevute via email.");
    return valid;
  }

  async function sendCode(address: string) {
    setState("sending");
    setMessage("");
    setFieldError("");

    try {
      const response = await fetch("/api/auth/email-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: address }),
        cache: "no-store",
      });
      if (!response.ok) {
        const errorCode = await responseErrorCode(response);
        setState("error");
        if (errorCode === "invalid_email") {
          setPhase("email");
          setFieldError(errorMessages.invalid_email);
          emailInputRef.current?.focus();
        } else {
          setMessage(errorMessages[errorCode]);
        }
        return;
      }

      setPhase("code");
      setState("idle");
      setCode("");
      setMessage(`Codice inviato a ${address}. Puoi leggere l’email anche dal telefono.`);
    } catch {
      setState("error");
      setMessage("Non siamo riusciti a inviare il codice. Controlla la connessione e riprova.");
    }
  }

  async function handleEmailSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const input = emailInputRef.current;
    if (!input || !validateEmail(input)) {
      setState("error");
      setMessage("");
      input?.focus();
      return;
    }

    const address = input.value.trim().toLowerCase();
    setEmail(address);
    await sendCode(address);
  }

  async function handleCodeSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const input = codeInputRef.current;
    if (!input || !validateCode(input)) {
      setState("error");
      setMessage("");
      input?.focus();
      return;
    }

    setState("verifying");
    setMessage("");
    setFieldError("");

    try {
      const response = await fetch("/api/auth/email-code/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code, next: nextPath }),
        cache: "no-store",
      });
      if (!response.ok) {
        const errorCode = await responseErrorCode(response);
        setState("error");
        if (errorCode === "invalid_code") {
          setFieldError(errorMessages.invalid_code);
          input.focus();
          input.select();
        } else {
          setMessage(errorMessages[errorCode]);
        }
        return;
      }

      setState("idle");
      setMessage("Accesso verificato. Apertura delle partite…");
      window.location.assign(nextPath);
    } catch {
      setState("error");
      setMessage("Non siamo riusciti a verificare il codice. Controlla la connessione e riprova.");
    }
  }

  function resetEmail() {
    setPhase("email");
    setState("idle");
    setCode("");
    setMessage("");
    setFieldError("");
  }

  if (phase === "code") {
    const busy = state === "sending" || state === "verifying";
    return (
      <form
        className="email-access-form"
        onSubmit={handleCodeSubmit}
        noValidate
        aria-busy={busy}
      >
        <p className="email-access-summary">
          Codice inviato a <strong>{email}</strong>
        </p>
        <label htmlFor="access-code">Codice a 6 cifre</label>
        <input
          ref={codeInputRef}
          className="email-code-input"
          id="access-code"
          name="code"
          type="text"
          autoComplete="one-time-code"
          inputMode="numeric"
          enterKeyHint="done"
          pattern="[0-9]{6}"
          maxLength={6}
          value={code}
          required
          aria-invalid={Boolean(fieldError)}
          aria-describedby={`access-code-help${fieldError ? " access-code-error" : ""}`}
          disabled={busy}
          onChange={(event) => {
            setCode(event.currentTarget.value.replace(NON_DIGITS_PATTERN, "").slice(0, 6));
            if (fieldError) setFieldError("");
          }}
        />
        <p id="access-code-help" className="email-help">
          Resta su questa pagina: non devi più aprire link da Safari.
        </p>
        {fieldError ? (
          <p id="access-code-error" className="email-field-error" role="alert">
            {fieldError}
          </p>
        ) : null}
        <button type="submit" disabled={busy}>
          {state === "verifying" ? "Verifica in corso…" : "Verifica e apri le partite"}
        </button>
        <div className="email-access-secondary-actions">
          <button type="button" className="access-secondary-button" disabled={busy} onClick={() => void sendCode(email)}>
            {state === "sending" ? "Nuovo invio…" : "Invia un nuovo codice"}
          </button>
          <button type="button" className="access-secondary-button" disabled={busy} onClick={resetEmail}>
            Cambia email
          </button>
        </div>
        <p className={`access-feedback${state === "error" && message ? " access-feedback-error" : ""}`} aria-live="polite">
          {message || "Il codice è temporaneo e può essere usato una sola volta."}
        </p>
      </form>
    );
  }

  const busy = state === "sending";
  return (
    <form
      className="email-access-form"
      onSubmit={handleEmailSubmit}
      noValidate
      aria-busy={busy}
    >
      <label htmlFor="access-email">Email</label>
      <input
        ref={emailInputRef}
        id="access-email"
        name="email"
        type="email"
        autoComplete="email"
        inputMode="email"
        enterKeyHint="send"
        placeholder="nome@tuodominio.it"
        value={email}
        required
        aria-invalid={Boolean(fieldError)}
        aria-describedby={`access-email-help${fieldError ? " access-email-error" : ""}`}
        disabled={busy}
        onBlur={(event) => {
          if (event.currentTarget.value.trim()) validateEmail(event.currentTarget);
        }}
        onChange={(event) => {
          setEmail(event.currentTarget.value);
          if (fieldError) setFieldError("");
        }}
      />
      <p id="access-email-help" className="email-help">
        Riceverai un codice personale, leggibile anche dal telefono.
      </p>
      {fieldError ? (
        <p id="access-email-error" className="email-field-error" role="alert">
          {fieldError}
        </p>
      ) : null}
      <button type="submit" disabled={busy}>
        {busy ? "Invio in corso…" : "Ricevi il codice di accesso"}
      </button>
      <p className={`access-feedback${state === "error" && message ? " access-feedback-error" : ""}`} aria-live="polite">
        {message || "Non serve una password. Il codice collega la sessione in modo sicuro."}
      </p>
    </form>
  );
}
