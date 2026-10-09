import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

// ==========================================
// 🎨 LOAD AND CONFIGURE FONTS
// ==========================================
// Next.js downloads and hosts fonts locally at build time to optimize performance (Core Web Vitals).
const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// ==========================================
// 🌌 SYSTEM METADATA (SEO & GOVERNANCE)
// ==========================================
// Define the HTML headers (<title>, <meta description>) statically on the Next.js server.
export const metadata: Metadata = {
  title: "Projeto Maestro",
  description: "Console de orquestração e monitoramento de Inteligência Artificial da API Maestro",
};

/**
 * 🧱 ROOT LAYOUT COMPONENT (RootLayout)
 * This file is the global frame for the application. All base HTML originates here.
 * LayoutProps<"/"> strictly validates static routes in TypeScript.
 */
export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // 🔥 Hydration fix: suppressHydrationWarning tells React 19
    // to safely ignore dynamic attributes and styles injected by browser extensions (such as Dark Reader).
    // This immediately removes the hydration mismatch from the console screen. [source: 0.1.34]
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      {/* children represents the active page (login, chat, etc.) */}
      {/* bg-gray-950 extends the high-contrast dark background across the inner layout */}
      <body className="min-h-full flex flex-col bg-gray-950 text-white">
        suppressHydrationWarning
        {children}
      </body>
    </html>
  );
}

