import { useEffect } from "react";
import { checkMpesaPayment } from "./payments-db";

/**
 * Rede de segurança para pagamentos M-Pesa que ficaram "pending" (ligação caída,
 * resposta tardia): enquanto `active`, pergunta ao servidor de 6 em 6 s — ele consulta
 * a M-Pesa e, se já foi pago, activa o que foi comprado.
 */
export function useMpesaConfirmation(
  active: boolean,
  paymentId: string | undefined,
  onConfirmed: () => void,
  onFailed: () => void,
) {
  useEffect(() => {
    if (!active || !paymentId) return;
    const interval = setInterval(async () => {
      const r = await checkMpesaPayment(paymentId);
      if (r.status === "confirmed") onConfirmed();
      else if (r.status === "failed") onFailed();
    }, 6000);
    return () => clearInterval(interval);
    // onConfirmed/onFailed só chamam setState — estáveis o suficiente.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, paymentId]);
}
