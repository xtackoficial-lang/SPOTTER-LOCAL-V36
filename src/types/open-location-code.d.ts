// ============================================================
// Tipos para "open-location-code" (Plus Codes do Google).
// O pacote @types/open-location-code do DefinitelyTyped descreve uma
// API estática que não corresponde à versão publicada no npm (a API
// real é toda de instância — new OpenLocationCode() — testado em
// runtime). Por isso declaramos aqui os tipos correctos em vez de
// depender do pacote @types, que dava erros de compilação para
// chamadas que funcionam correctamente.
// ============================================================
declare module "open-location-code" {
  export interface CodeArea {
    latitudeLo: number;
    longitudeLo: number;
    latitudeHi: number;
    longitudeHi: number;
    latitudeCenter: number;
    longitudeCenter: number;
    codeLength: number;
  }

  export class OpenLocationCode {
    isValid(code: string): boolean;
    isShort(code: string): boolean;
    isFull(code: string): boolean;
    encode(latitude: number, longitude: number, codeLength?: number): string;
    decode(code: string): CodeArea;
    recoverNearest(shortCode: string, referenceLatitude: number, referenceLongitude: number): string;
    shorten(code: string, latitude: number, longitude: number): string;
  }
}
