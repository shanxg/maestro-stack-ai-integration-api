'use client'; // 🌐 DIRETIVA DE CLIENTE: Obrigatória para usar hooks de efeitos e navegação de tela.

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * 🏠 PONTO DE ENTRADA DO DOMÍNIO ( HomePage - Rota / )
 * Como o nosso projeto exige controle de acesso, a rota raiz funciona apenas como um "guarda de trânsito",
 * encaminhando o tráfego do usuário diretamente para o fluxo de autenticação.
 */
export default function HomePage() {
  const router = useRouter(); // Instancia o roteador moderno do Next.js App Router

  /**
   * 🔀 REDIRECIONAMENTO ESTRATÉGICO AUTOMÁTICO
   * Executa no milissegundo em que a pessoa digita "http://localhost:3001" no navegador.
   */
  useEffect(() => {
    // Usamos o método router.replace() em vez de .push() por boa prática de UX:
    // Ele substitui a página atual no histórico do navegador. Assim, se o usuário tentar
    // clicar no botão "Voltar" do navegador na tela de login, ele não fica preso em um loop infinito.
    router.replace('/login');
  }, [router]);

  return (
    // Interface de transição exibida por frações de segundos enquanto a navegação do Next.js é processada
    <main className="min-h-screen bg-gray-950 flex items-center justify-center text-gray-500 text-sm tracking-widest font-mono uppercase animate-pulse">
      Carregando ecossistema Maestro...
    </main>
  );
}
