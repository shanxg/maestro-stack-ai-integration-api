import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

// ==========================================
// 🎨 CARREGAMENTO E CONFIGURAÇÃO DE FONTES OPERACIONAIS
// ==========================================
// O Next.js baixa e hospeda as fontes localmente em tempo de build para otimizar a performance (Core Web Vitals).
const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// ==========================================
// 🌌 METADADOS DE SISTEMA (SEO & GOVERNANÇA)
// ==========================================
// Centraliza os cabeçalhos HTML (<title>, <meta description>) de forma estática no servidor Next.js.
export const metadata: Metadata = {
  title: "Projeto Maestro",
  description: "Console de orquestração e monitoramento de Inteligência Artificial da API Maestro",
};

/**
 * 🧱 COMPONENTE DE RAÍZ ( RootLayout )
 * O arquivo layout.tsx funciona como a moldura global da sua aplicação. Todo o HTML base nasce aqui.
 * A tipagem LayoutProps<"/"> garante validação estrita de rotas estáticas em TypeScript.
 */
export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // 🔥 CORREÇÃO CIRÚRGICA DE ALTO PADRÃO: A diretiva suppressHydrationWarning avisa ao React 19 
    // para ignorar de forma segura os atributos dinâmicos e estilos injetados por plugins do navegador (como o Dark Reader).
    // Isso elimina o erro de Hydration Mismatch instantaneamente da tela do console! [source: 0.1.34]
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      {/* O children representa a página ativa que o usuário está visitando (login, chat, etc) */}
      {/* bg-gray-950 garante que o fundo preto de alto contraste se espalhe por todo o esqueleto interno */}
      <body className="min-h-full flex flex-col bg-gray-950 text-white">
        suppressHydrationWarning
        {children}
      </body>
    </html>
  );
}

