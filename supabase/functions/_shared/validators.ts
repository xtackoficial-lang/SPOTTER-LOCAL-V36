// CÓPIA EXACTA de src/lib/validators.ts — o servidor valida de novo tudo o que o ecrã validou
// (quem chama a API directamente, sem passar pela app, não contorna as regras).
// Se alterares um, altera o outro: scripts/sync-validators.mjs faz a cópia.
// ============================================================
// SPOTTER LOCAL — Validação rigorosa de dados (v41, segurança)
// ------------------------------------------------------------
// Pedido do Abrão: telefone tem de ser um número real (sem dígitos
// a mais ou inventados) e o email tem de ser um email verdadeiro.
// Estas funções são puras (sem React) e a MESMA lógica existe no
// servidor em supabase/functions/_shared/validators.ts — o servidor
// é que manda; isto aqui só dá o erro cedo, no ecrã.
// ============================================================

export type Check = { ok: true; value: string } | { ok: false; error: string };

// ---------- Telefone ----------
// Móveis de Moçambique: 9 dígitos, começam por 82–87.
//   82/83/84 → Vodacom (84 também M-Pesa) · 85 → Vodacom (M-Pesa)
//   86/87 → Movitel (e-Mola) · 82/83 → Tmcel (mCel)
// Aceita: 84 123 4567 · 840000000 · +258 84 123 4567 · 00258841234567
// Internacionais (diáspora): só com "+" e indicativo, 8 a 15 dígitos.
const MZ_MOBILE = /^8[2-7]\d{7}$/;

function digitsOnly(s: string): string {
  return s.replace(/[\s().-]/g, "");
}

function looksFake(d: string): boolean {
  // todos iguais (888888888), sequências (123456789 / 987654321) e 1 dígito repetido 7+ vezes
  if (/^(\d)\1+$/.test(d)) return true;
  if ("0123456789012345".includes(d) || "9876543210987654".includes(d)) return true;
  if (/(\d)\1{6,}/.test(d)) return true;
  return false;
}

export function normalizePhone(raw: string): Check {
  const input = (raw ?? "").trim();
  if (!input) return { ok: false, error: "Indica o número de telemóvel." };
  if (/[^\d\s+().-]/.test(input)) {
    return { ok: false, error: "O número só pode ter dígitos (ex: 84 123 4567)." };
  }
  let d = digitsOnly(input);
  const hasPlus = d.startsWith("+");
  if (hasPlus) d = d.slice(1);
  else if (d.startsWith("00")) d = d.slice(2);
  if (d.includes("+")) return { ok: false, error: "Número inválido." };

  // Moçambique
  if (d.startsWith("258")) {
    const national = d.slice(3);
    if (national.length !== 9) {
      return {
        ok: false,
        error:
          national.length > 9
            ? "O número tem dígitos a mais. Em Moçambique são 9 dígitos (ex: 84 123 4567)."
            : "O número tem dígitos a menos. Em Moçambique são 9 dígitos (ex: 84 123 4567).",
      };
    }
    if (!MZ_MOBILE.test(national) || looksFake(national)) {
      return { ok: false, error: "Número inválido. Tem de começar por 82, 83, 84, 85, 86 ou 87." };
    }
    return { ok: true, value: `+258${national}` };
  }
  if (!hasPlus && !d.startsWith("00") && d.length <= 9) {
    if (d.length > 9) return { ok: false, error: "O número tem dígitos a mais." };
    if (d.length < 9) {
      return {
        ok: false,
        error: "O número tem dígitos a menos. Em Moçambique são 9 dígitos (ex: 84 123 4567).",
      };
    }
    if (!MZ_MOBILE.test(d) || looksFake(d)) {
      return { ok: false, error: "Número inválido. Tem de começar por 82, 83, 84, 85, 86 ou 87." };
    }
    return { ok: true, value: `+258${d}` };
  }
  if (!hasPlus && !input.trim().startsWith("00")) {
    // 10+ dígitos sem indicativo: quase de certeza número a mais
    return {
      ok: false,
      error: "O número tem dígitos a mais. Em Moçambique são 9 dígitos (ex: 84 123 4567).",
    };
  }
  // Internacional (+indicativo)
  if (d.length < 8 || d.length > 15 || d.startsWith("0") || looksFake(d)) {
    return { ok: false, error: "Número internacional inválido. Usa o formato +indicativo número." };
  }
  return { ok: true, value: `+${d}` };
}

/** Telefone de pagamento: M-Pesa só 84/85, e-Mola só 86/87. */
export function normalizeWalletPhone(raw: string, method: "mpesa" | "emola"): Check {
  const r = normalizePhone(raw);
  if (!r.ok) return r;
  const m = /^\+258(8\d)\d{7}$/.exec(r.value);
  if (!m) return { ok: false, error: "Para pagar por telemóvel usa um número de Moçambique." };
  const prefix = m[1];
  if (method === "mpesa" && !["84", "85"].includes(prefix)) {
    return { ok: false, error: "M-Pesa só funciona com números 84 ou 85." };
  }
  if (method === "emola" && !["86", "87"].includes(prefix)) {
    return { ok: false, error: "e-Mola só funciona com números 86 ou 87." };
  }
  return r;
}

/** "+258841234567" → "84 123 4567" para mostrar ao utilizador. */
export function formatPhone(e164: string): string {
  const m = /^\+258(\d{2})(\d{3})(\d{4})$/.exec(e164);
  return m ? `${m[1]} ${m[2]} ${m[3]}` : e164;
}

// ---------- Email ----------
const EMAIL_RE =
  /^[a-z0-9](?:[a-z0-9._%+-]{0,62}[a-z0-9])?@(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}$/i;

// Erros de escrita comuns → sugestão
const DOMAIN_TYPOS: Record<string, string> = {
  "gmial.com": "gmail.com",
  "gmai.com": "gmail.com",
  "gmail.co": "gmail.com",
  "gmail.con": "gmail.com",
  "gmail.cm": "gmail.com",
  "gmaill.com": "gmail.com",
  "gamil.com": "gmail.com",
  "gnail.com": "gmail.com",
  "gmal.com": "gmail.com",
  "gmail.om": "gmail.com",
  "hotmial.com": "hotmail.com",
  "hotmai.com": "hotmail.com",
  "hotmail.co": "hotmail.com",
  "hotmail.con": "hotmail.com",
  "hotnail.com": "hotmail.com",
  "outlok.com": "outlook.com",
  "outlook.co": "outlook.com",
  "outlook.con": "outlook.com",
  "yaho.com": "yahoo.com",
  "yahoo.co": "yahoo.com",
  "yahoo.con": "yahoo.com",
  "yhoo.com": "yahoo.com",
  "icloud.co": "icloud.com",
  "icloud.con": "icloud.com",
};

// Domínios de email descartável / de teste (lista curta dos mais usados)
const DISPOSABLE = new Set([
  "mailinator.com", "10minutemail.com", "guerrillamail.com", "tempmail.com", "temp-mail.org",
  "yopmail.com", "trashmail.com", "sharklasers.com", "getnada.com", "maildrop.cc",
  "throwawaymail.com", "dispostable.com", "fakeinbox.com", "mailnesia.com", "moakt.com",
  "tempmailo.com", "emailondeck.com", "mohmal.com", "burnermail.io", "spamgourmet.com",
  "example.com", "example.org", "example.net", "test.com", "teste.com", "email.com.br.invalid",
  "mail.com.invalid", "invalid.com", "asdf.com", "abc.com", "xxx.com", "a.com",
]);

export function validateEmail(raw: string): Check {
  const email = (raw ?? "").trim().toLowerCase();
  if (!email) return { ok: false, error: "Indica o teu email." };
  if (email.length > 254) return { ok: false, error: "Email demasiado longo." };
  if (/\s/.test(email)) return { ok: false, error: "O email não pode ter espaços." };
  if (email.includes("..") || !EMAIL_RE.test(email)) {
    return { ok: false, error: "Esse email não parece válido. Exemplo: nome@gmail.com" };
  }
  const [local, domain] = email.split("@");
  if (/^(.)\1{3,}$/.test(local) && local.length < 8) {
    return { ok: false, error: "Esse email não parece real. Usa o teu email verdadeiro." };
  }
  if (DOMAIN_TYPOS[domain]) {
    return {
      ok: false,
      error: `Será que queres dizer ${local}@${DOMAIN_TYPOS[domain]}? Confirma o email.`,
    };
  }
  if (DISPOSABLE.has(domain)) {
    return { ok: false, error: "Não aceitamos emails temporários. Usa o teu email verdadeiro." };
  }
  return { ok: true, value: email };
}

// Confirma que o DOMÍNIO do email existe e recebe email (registo MX/A), via
// DNS-sobre-HTTPS da Cloudflare. Se a rede falhar, NÃO bloqueia (fail-open) —
// internet instável não pode impedir ninguém de criar conta.
const mxCache = new Map<string, boolean>();
export async function emailDomainAcceptsMail(email: string): Promise<boolean> {
  const domain = email.split("@")[1]?.toLowerCase();
  if (!domain) return false;
  if (mxCache.has(domain)) return mxCache.get(domain)!;
  const ask = async (type: "MX" | "A") => {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 4000);
    try {
      const res = await fetch(
        `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(domain)}&type=${type}`,
        { headers: { accept: "application/dns-json" }, signal: ctrl.signal },
      );
      if (!res.ok) return null;
      const j = (await res.json()) as { Status?: number; Answer?: { type: number }[] };
      if (j.Status === 3) return false; // NXDOMAIN — o domínio não existe
      return (j.Answer ?? []).some((a) => a.type === (type === "MX" ? 15 : 1));
    } catch {
      return null; // erro de rede → desconhecido
    } finally {
      clearTimeout(t);
    }
  };
  const mx = await ask("MX");
  if (mx === null) return true; // sem resposta: deixa passar
  if (mx) {
    mxCache.set(domain, true);
    return true;
  }
  const a = await ask("A");
  const ok = a === null ? true : a;
  mxCache.set(domain, ok);
  return ok;
}

/** Validação completa de email para criar conta / reservar (formato + domínio real). */
export async function validateEmailStrict(raw: string): Promise<Check> {
  const r = validateEmail(raw);
  if (!r.ok) return r;
  if (!(await emailDomainAcceptsMail(r.value))) {
    return { ok: false, error: "Esse email não existe (o domínio não recebe mensagens). Confirma o que escreveste." };
  }
  return r;
}

// ---------- Nome ----------
export function validatePersonName(raw: string, label = "nome"): Check {
  const name = (raw ?? "").trim().replace(/\s+/g, " ");
  if (name.length < 2) return { ok: false, error: `Indica o teu ${label}.` };
  if (name.length > 80) return { ok: false, error: `O ${label} é demasiado longo.` };
  if (!/^[\p{L}][\p{L}\p{M}' .-]*$/u.test(name)) {
    return { ok: false, error: `O ${label} só pode ter letras (sem números ou símbolos).` };
  }
  if (/(.)\1{3,}/u.test(name)) {
    return { ok: false, error: `Escreve o teu ${label} verdadeiro.` };
  }
  return { ok: true, value: name };
}

// ---------- Contacto livre (telefone OU link) ----------
/** Para campos como "contacto para bilhetes": aceita telefone válido ou link http(s). */
export function validatePhoneOrLink(raw: string): Check {
  const v = (raw ?? "").trim();
  if (!v) return { ok: false, error: "Indica um contacto." };
  if (/^(https?:\/\/|www\.)/i.test(v)) {
    try {
      const u = new URL(/^www\./i.test(v) ? `https://${v}` : v);
      if (!u.hostname.includes(".")) throw new Error();
      return { ok: true, value: u.toString() };
    } catch {
      return { ok: false, error: "Esse link não é válido." };
    }
  }
  return normalizePhone(v);
}

// ---------- Senha ----------
export function validatePassword(pw: string): Check {
  if (!pw || pw.length < 6) return { ok: false, error: "A senha precisa de pelo menos 6 caracteres." };
  if (pw.length > 72) return { ok: false, error: "A senha é demasiado longa (máximo 72)." };
  if (/^(.)\1+$/.test(pw) || ["123456", "1234567", "12345678", "password", "senha123", "abcdef"].includes(pw.toLowerCase())) {
    return { ok: false, error: "Essa senha é demasiado fácil de adivinhar. Escolhe outra." };
  }
  return { ok: true, value: pw };
}
