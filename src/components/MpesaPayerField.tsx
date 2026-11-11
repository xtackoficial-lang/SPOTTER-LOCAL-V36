// Campo "número M-Pesa que vai pagar" — usado nos ecrãs que cobram pela M-Pesa.
// A validação (84/85) é feita por quem chama, com normalizeWalletPhone(valor, "mpesa").
export function MpesaPayerField({
  value,
  onChange,
  optional = false,
  placeholder = "84 123 4567",
}: {
  value: string;
  onChange: (v: string) => void;
  /** true = se ficar vazio, usa-se o telefone de contacto já preenchido. */
  optional?: boolean;
  placeholder?: string;
}) {
  return (
    <div>
      <p className="mb-1.5 text-xs font-semibold text-muted-foreground">
        Número M-Pesa que vai pagar{optional ? " (se for diferente do telefone acima)" : ""}
      </p>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/[^\d\s+()-]/g, ""))}
        inputMode="tel"
        maxLength={20}
        placeholder={placeholder}
        className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm"
      />
      <p className="mt-1 text-[11px] text-muted-foreground">
        Vais receber um pedido no telemóvel — digita o teu PIN M-Pesa para confirmar (só números 84
        ou 85).
      </p>
    </div>
  );
}
