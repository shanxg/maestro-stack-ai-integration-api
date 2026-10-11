'use client'; // 🌐 CLIENT DIRECTIVE: Required for React state handling and navigation hooks.

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function RegisterPage() {
  // ==========================================
  // 🎭 STATE MANAGEMENT (REACT HOOKS)
  // ==========================================
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  const router = useRouter();

  /**
   * 📡 ASYNCHRONOUS INGESTION HANDLER (handleRegister)
   * Dispatches the user credentials block to the backend processing gateway.
   */
  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    try {
  if (!name.trim() || !email.trim() || !password.trim()) {
    throw new Error('Por favor, preencha todos os campos do formulário para prosseguir.');
  }

  if (password.length < 8) {
    throw new Error('A diretriz de segurança exige uma senha com no mínimo 8 caracteres.');
  }

  // =========================================================================
  // 🗺️ APPSEC REMEDIATION - ABSOLUTE BOUNDARY HANDSHAKE
  // =========================================================================
  // Hardcoding the explicit local development port DNS directly into the constructor
  // to fully prevent Next.js Turbopack from routing this client call internally.
  const targetUrl = new URL('http://localhost:3000/api/v1/users');

  const res = await fetch(targetUrl.href, {
    method: 'POST',
    mode: 'cors', // Force cross-origin evaluation down to the browser engine
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: name.trim(),
      email: email.trim(),
      password: password
    }),
  });

  const rawResponseText = await res.text();

  let data;
  try {
    data = JSON.parse(rawResponseText);
  } catch {
    throw new Error('O servidor de dados retornou uma resposta inválida. Verifique se a API está online.');
  }

  if (!res.ok) {
    throw new Error(data.error?.message || 'Falha ao registrar a solicitação de cadastro.');
  }

      // HTTP 202 ACCEPTED: Notify user about the background batch queue processing success
      setSuccess('Solicitação enviada com sucesso! Redirecionando para o portal de acesso...');
      
      // Auto-navigate to login boundary after a short timeout loop
      setTimeout(() => {
        router.push('/login');
      }, 2500);

    } catch (err: unknown) {
      console.error('❌ Asynchronous registration barrier exception:', err);
      setError(err instanceof Error ? err.message : 'Erro interno de rede.');
    } finally {
      setLoading(false);
    }
  };

   return (
    <main 
      className="min-h-screen flex items-center justify-center bg-gray-950 px-4 select-none"
      suppressHydrationWarning={true}
    >
      <div 
        className="max-w-md w-full bg-gray-900 border border-gray-800 p-8 rounded-2xl shadow-2xl"
        suppressHydrationWarning={true}
      >
        <h1 className="text-3xl font-bold text-center text-white mb-2 tracking-tight">Criar Conta</h1>
        <p className="text-sm text-center text-gray-400 mb-8">Inscreva-se no painel distribuído do ecossistema Maestro</p>

        {error && (
          <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-sm p-4 rounded-xl mb-6">
            {error}
          </div>
        )}

        {success && (
          <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm p-4 rounded-xl mb-6">
            {success}
          </div>
        )}

        <form onSubmit={handleRegister} className="space-y-5">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">
              Nome Completo
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Lucas Rivaldo"
              className="w-full bg-gray-950 border border-gray-800 text-white rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-500 transition-colors placeholder-gray-700"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">
              Endereço de E-mail
            </label>
            <input
              type="text"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="lucas@exemplo.com"
              className="w-full bg-gray-950 border border-gray-800 text-white rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-500 transition-colors placeholder-gray-700"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">
              Chave de Acesso (Senha)
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Mínimo 8 caracteres"
              className="w-full bg-gray-950 border border-gray-800 text-white rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-500 transition-colors placeholder-gray-700"
            />
          </div>

          {/* BUTTON REMEDIATION: Fixed broken active utility string and forced solid semantic separation */}
          <button
            type="submit"
            disabled={loading}
            className="w-full mt-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-600/40 text-white font-medium py-3.5 rounded-xl transition-all shadow-lg active:scale-98 cursor-pointer text-sm tracking-wide"
          >
            {loading ? 'Enfileirando Registro...' : 'Registrar Credenciais'}
          </button>

          {/* INTERACTIVE LINK REMEDIATION: Isolated the inline trigger using focusable, high-contrast blocks */}
          <div className="text-center pt-4 border-t border-gray-800/60 mt-4">
            <span className="text-xs text-gray-500">Já possui uma conta? </span>
            <button 
              type="button" 
              onClick={() => router.push('/login')} 
              className="text-xs text-indigo-400 hover:text-indigo-300 font-semibold transition-colors cursor-pointer focus:outline-none focus:underline inline-block px-1 py-0.5"
            >
              Fazer Login
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}
