import { useEffect, useRef } from "react";

// ============================================================
// BUG DO ABRÃO (2026-08-21): "abri uma secção, não gostei, saí, ficou
// bugado — voltou à página inicial".
//
// CAUSA: o APK do Spotter Local é a PWA embrulhada numa WebView (ver
// scripts/store-build.mjs) — não usa Capacitor nem trata o botão físico/
// gesto de "Voltar" do Android de forma nenhuma. Por omissão, esse botão
// dispara history.back() do próprio browser. Nenhum modal/folha inferior
// da app (produto, editar comerciante no admin, etc.) empurra uma
// entrada no histórico ao abrir — por isso, ao carregar em "Voltar" com
// um modal aberto, em vez de FECHAR O MODAL, o Android navega a ROTA por
// trás para trás (ou sai da app, se não houver histórico) — o modal
// fica "preso" visualmente ou a app parece saltar para a página
// inicial sem aviso.
//
// Este hook resolve isto de forma reutilizável: ao abrir, empurra uma
// entrada de histórico "fantasma"; o botão Voltar consome essa entrada
// primeiro (dispara popstate) e só fecha o modal — não navega a app.
//
// Uso:
//   useModalBackButton(showAddProduct, () => setShowAddProduct(false));
// ============================================================
export function useModalBackButton(isOpen: boolean, onClose: () => void) {
  const pushedRef = useRef(false);

  useEffect(() => {
    if (!isOpen) return;
    window.history.pushState({ spotterModal: true }, "");
    pushedRef.current = true;

    const handlePopState = () => {
      pushedRef.current = false;
      onClose();
    };
    window.addEventListener("popstate", handlePopState);

    return () => {
      window.removeEventListener("popstate", handlePopState);
      pushedRef.current = false;
      // Nota: não chamamos history.back() aqui de propósito — se o modal
      // foi fechado por um botão (não pelo Voltar do Android), a entrada
      // fantasma fica na pilha e é simplesmente consumida, sem efeito
      // visível, na próxima vez que o Voltar for premido. Tentar
      // "desfazer" a entrada aqui seria arriscado: se este cleanup
      // correr porque o componente desmontou por uma navegação
      // programática (ex: guardar e navegar para outra página), chamar
      // history.back() cancelaria essa navegação por engano.
    };
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps
}
