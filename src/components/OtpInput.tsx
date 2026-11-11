import { useRef } from "react";

export const OTP_LENGTH = 6;

// Caixas para o código de 6 dígitos do e-mail. Aceita colar o código inteiro,
// preenchimento automático do teclado (autocomplete one-time-code),
// backspace que volta atrás e setas. Chama onComplete quando as 6 estão cheias.
export function OtpInput({
  value,
  onChange,
  onComplete,
  disabled,
  invalid,
}: {
  value: string;
  onChange: (v: string) => void;
  onComplete?: (v: string) => void;
  disabled?: boolean;
  invalid?: boolean;
}) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const digits = Array.from({ length: OTP_LENGTH }, (_, i) => value[i] ?? "");

  const set = (next: string) => {
    const clean = next.replace(/\D/g, "").slice(0, OTP_LENGTH);
    onChange(clean);
    if (clean.length === OTP_LENGTH) onComplete?.(clean);
    return clean;
  };

  return (
    <div className="flex justify-center gap-2" role="group" aria-label="Código de verificação">
      {digits.map((d, i) => (
        <input
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          value={d}
          disabled={disabled}
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete={i === 0 ? "one-time-code" : "off"}
          maxLength={i === 0 ? OTP_LENGTH : 1}
          aria-label={`Dígito ${i + 1}`}
          autoFocus={i === 0}
          onChange={(e) => {
            const raw = e.target.value.replace(/\D/g, "");
            if (!raw) {
              set(value.slice(0, i) + value.slice(i + 1));
              return;
            }
            // Colar ou preenchimento automático: vários dígitos de uma vez.
            const merged = set(value.slice(0, i) + raw + value.slice(i + 1));
            const target = Math.min(i + raw.length, OTP_LENGTH - 1);
            if (merged.length < OTP_LENGTH) refs.current[target]?.focus();
          }}
          onKeyDown={(e) => {
            if (e.key === "Backspace" && !d && i > 0) {
              set(value.slice(0, i - 1) + value.slice(i));
              refs.current[i - 1]?.focus();
            } else if (e.key === "ArrowLeft" && i > 0) refs.current[i - 1]?.focus();
            else if (e.key === "ArrowRight" && i < OTP_LENGTH - 1) refs.current[i + 1]?.focus();
          }}
          onFocus={(e) => e.target.select()}
          className={`h-12 w-10 rounded-xl border bg-background text-center text-lg font-bold text-foreground outline-none transition focus:border-primary disabled:opacity-50 ${
            invalid ? "border-destructive" : "border-input"
          }`}
        />
      ))}
    </div>
  );
}
