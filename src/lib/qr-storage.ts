// QR Scanner Storage — histórico de scans
import { useEffect, useState } from "react";

export interface QRScan {
  id: string;
  url: string;
  label: string;
  scannedAt: string;
}

const KEY = "xlocal.qrscans.v1";

function read(): QRScan[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(KEY) || "[]");
  } catch {
    return [];
  }
}
function write(data: QRScan[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    /* ignorado: falha de quota/acesso ao localStorage */
  }
}

export function useQRHistory() {
  const [scans, setScans] = useState<QRScan[]>([]);
  useEffect(() => {
    setScans(read());
  }, []);

  const addScan = (url: string, label = "") => {
    const entry: QRScan = {
      id: crypto.randomUUID(),
      url,
      label: label || url,
      scannedAt: new Date().toISOString(),
    };
    const next = [entry, ...read()].slice(0, 50);
    write(next);
    setScans(next);
    return entry;
  };

  const clear = () => {
    write([]);
    setScans([]);
  };
  return { scans, addScan, clear };
}
