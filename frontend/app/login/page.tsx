'use client'; // 🌐 CLIENT DIRECTIVE: Makes the Next.js App Router treat this file as browser code.
              // Required to use state (useState), effects (useEffect), and click events.

import { useState } from 'react';
import { useRouter } from 'next/navigation'; // Official router for the modern Next.js App Router.

export default function LoginPage() {
  // ==========================================
  // 🎭 STATE MANAGEMENT (REACT HOOKS)
  // ==========================================
  // useState binds the screen inputs to React state, which updates as the user types.
  const [username, setUsername] = useState(''); // Stores the text entered in the username field
  const [password, setPassword] = useState(''); // Stores the text entered in the password field
  const [error, setError] = useState('');       // Stores errors to display as alerts
  const [loading, setLoading] = useState(false); // Disables the button while the request is in progress

  const router = useRouter(); // Create the navigation helper used after login succeeds

  /**
  * 📡 AUTHENTICATION HANDLER (handleLogin)
  * Runs when the user clicks the form's submit button.
   */
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault(); // 🛑 Prevent the browser's default full-page reload.
    setError('');       // Clear any error from a previous attempt
    setLoading(true);   // Disable repeated clicks while loading

    try {
      // 🛡️ VALIDATE INPUT BEFORE SENDING:
      // .trim() removes accidental whitespace around the text.
      // If either field is blank, raise a local error without making a network request.
      if (!username.trim() || !password.trim()) {
        throw new Error('Por favor, preencha todos os campos do formulário para prosseguir.');
      }

      // =========================================================================
      // 🔐 APPSEC REMEDIATION - DNS LOOPBACK ALIGNMENT
      // =========================================================================
      // Target 'localhost' explicitly to align with the backend CORS allowed origin matrix.
      // This prevents the browser engine from dropping pre-flight requests due to Same-Origin Policy mismatches.
      const targetUrl = new URL('http://localhost:3000/auth/login');

      const res = await fetch(targetUrl.href, {
        method: 'POST',
        mode: 'cors', // Explicitly enable CORS mode for cross-origin requests
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          username: username.trim(), 
          password: password.trim() 
        }),
      });


      // Convert the API response body into a JSON object
      const data = await res.json();

      // ❌ HANDLE API ERRORS:
      // For an HTTP error status (400 Bad Request, 401 Unauthorized, etc.),
      // res.ok is false. Read the error message returned by the backend.
      if (!res.ok) {
        throw new Error(data.error?.message || 'Falha na validação do acesso. Verifique suas credenciais.');
      }

      // =========================================================================
      // 🔐 STORE THE JWT
      // =========================================================================
      // After credentials are validated (HTTP 200), store the signed token in localStorage.
      // It keeps the session active and authorizes later requests to protected AI routes.
      localStorage.setItem('token', data.token);

      // 🔀 Redirect the authenticated user to the chat dashboard.
      router.push('/chat');

    } catch (err: unknown) {
      // Catch local validation errors and server connection failures.
      console.error('❌ Falha capturada na esteira de controle de login:', err);

      setError(
        err instanceof Error
          ? err.message
          : 'Erro crítico de comunicação com o servidor de autenticação.'
      );
    } finally {
      // Always clear the loading state, whether the request succeeds or fails.
      setLoading(false);
    }
  };

  return (
    // 🎨 VISUAL LAYOUT STYLED WITH TAILWIND CSS UTILITY CLASSES
    // min-h-screen: Make the background fill the full viewport height
    // bg-gray-950: Set the default very dark background
    <main className="min-h-screen flex items-center justify-center bg-gray-950 px-4">
      
      {/* CENTERED FORM CARD */}
      <div className="max-w-md w-full bg-gray-900 border border-gray-800 p-8 rounded-2xl shadow-2xl" suppressHydrationWarning>
        <h1 className="text-3xl font-bold text-center text-white mb-2 tracking-tight">Projeto Maestro</h1>
        <p className="text-sm text-center text-gray-400 mb-8">Portal de orquestração e gerenciamento de Inteligência Artificial</p>

        {/* CONDITIONAL ERROR ALERT (render only when error contains text) */}
        {error && (
          <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-sm p-4 rounded-xl mb-6 transition-all">
            {error}
          </div>
        )}

        {/* LOGIN FORM */}
        <form onSubmit={handleLogin} className="space-y-6">
          
          {/* USERNAME INPUT */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">
              Identificador (Username)
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)} // Update React state as each character is typed
              placeholder="Ex: admin"
              className="w-full bg-gray-950 border border-gray-800 text-white rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-500 transition-colors placeholder-gray-600"
            />
          </div>

          {/* PASSWORD INPUT */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">
              Chave de Acesso (Password)
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full bg-gray-950 border border-gray-800 text-white rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-500 transition-colors placeholder-gray-600"
            />
          </div>

          {/* SUBMIT BUTTON */}
          {/* disabled={loading}: Prevent double submissions while the request is in progress */}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-600/40 text-white font-medium py-3 rounded-xl transition-all shadow-lg shadow-indigo-600/10 active:scale-[0.98]"
          >
            {loading ? 'Processando Acesso...' : 'Entrar no Console'}
          </button>
          
        </form>
        <div className="text-center pt-4 border-t border-gray-800/60 mt-4">
          <span className="text-xs text-gray-500">Não possui uma chave de acesso? </span>
          <button 
            type="button" 
            onClick={() => router.push('/register')} 
            className="text-xs text-indigo-400 hover:text-indigo-300 font-semibold transition-colors cursor-pointer focus:outline-none focus:underline inline-block px-1 py-0.5"
          >
            Criar Nova Conta
          </button>
        </div>
      </div>
    </main>
  );
}
