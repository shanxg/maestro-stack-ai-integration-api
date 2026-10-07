'use client';

import { useState, useEffect, useRef, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

// =========================================================================
// 📡 ESCUTADOR EXTERNO (SUBSCRIBE TO STORAGE)
// =========================================================================
// Envia um aviso para o React se o localStorage sofrer alterações em outras abas
const subscribeToToken = (callback: () => void) => {
  window.addEventListener('storage', callback);
  return () => window.removeEventListener('storage', callback);
};

// Captura a foto (snapshot) atual do token direto do ecossistema do navegador
const getTokenSnapshot = (): string | null => localStorage.getItem('token');

// Configuração para o Servidor (SSR): Como o servidor não tem localStorage, inicia como undefined
const getServerTokenSnapshot = (): undefined => undefined;

export default function ChatPage() {
  const router = useRouter();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // =========================================================================
  // 💎 CONEXÃO COM O COFRE EXTERNO (useSyncExternalStore)
  // =========================================================================
  // Lê o token de forma reativa e limpa, eliminando a necessidade de setStates síncronos!
  const token = useSyncExternalStore(
    subscribeToToken,
    getTokenSnapshot,
    getServerTokenSnapshot
  );

  // Estados derivados calculados na hora da renderização (Prática recomendada pelo React!)
  const isAuthenticated = token !== null && token !== undefined;
  const isCheckingAuth = token === undefined;

  // Inicializa o histórico de mensagens direto como estado inicial, sem passar pelo useEffect
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content: 'Olá! Sou o assistente inteligente Maestro. Como posso te ajudar com as análises do ecossistema hoje?',
    },
  ]);

  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  /**
   * 🛡️ GUARDA DE EXPULSÃO (Efeito de Navegação)
   * Executa apenas quando o token mudar de estado. Se o token sumir, despacha o usuário para o login.
   */
  useEffect(() => {
    if (!isAuthenticated && !isCheckingAuth) {
      router.replace('/login'); // Usa replace para apagar a página do chat do histórico de voltar do navegador
    }
  }, [router, isAuthenticated, isCheckingAuth]);

  // Mantém a rolagem sempre ancorada na última mensagem
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  /**
   * 📡 ENVIO DO PROMPT AUTENTICADO
   */
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || loading) return;

    const userPrompt = input.trim();
    setInput('');
    setError('');
    setLoading(true);

    setMessages((prev) => [...prev, { role: 'user', content: userPrompt }]);

    try {
      // 🔐 Injeta a URL absoluta forçando o IP local direto para quebrar as amarras do Turbopack
      const targetUrl = new URL('http://127.0.0.1:3000/ai/chat');

      const res = await fetch(targetUrl.href, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}` 
        },
        body: JSON.stringify({ prompt: userPrompt }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error?.message || 'Falha ao obter resposta do motor de IA.');
      }

      setMessages((prev) => [...prev, { role: 'assistant', content: data.response }]);

    } catch (err: unknown) { // Sua solução sênior mantida intacta!
      console.error('❌ Falha na esteira de transmissão do chat:', err);
      setError(
        err instanceof Error 
          ? err.message 
          : 'Ocorreu um erro ao tentar se conectar com a API do Maestro.'
      );
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    // Como removemos do localStorage, o useSyncExternalStore captura a mudança e o useEffect nos joga para o /login
    window.dispatchEvent(new Event('storage')); // Força o disparo do evento na mesma aba
  };

  // 🧱 Renderização de contingência durante o boot inicial no Next.js
  if (isCheckingAuth) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center text-gray-500 text-sm tracking-wide">
        Autenticando sessão do console...
      </div>
    );
  }

  // Se o token for nulo (não autenticado), bloqueia o HTML enquanto o redirecionamento acontece
  if (!isAuthenticated) return null;

  return (
    <main className="flex flex-col h-screen bg-gray-950 text-white font-sans selection:bg-indigo-500/30">
      {/* HEADER */}
      <header className="flex items-center justify-between px-6 py-4 bg-gray-900 border-b border-gray-800 shadow-md">
        <div className="flex items-center space-x-3">
          <div className="w-2.5 h-2.5 bg-emerald-500 rounded-full animate-pulse shadow-lg shadow-emerald-500/50"></div>
          <h1 className="text-sm font-bold tracking-wider uppercase text-gray-200">Maestro AI Console</h1>
        </div>
        <button 
          onClick={handleLogout}
          className="text-xs bg-gray-800 hover:bg-red-950/40 hover:text-red-400 border border-gray-700 hover:border-red-900 px-4 py-2 rounded-xl transition-all font-medium"
        >
          Sair do Sistema
        </button>
      </header>

      {/* PAINEL DE MENSAGENS */}
      <section className="flex-1 overflow-y-auto px-4 py-6 space-y-6 max-w-4xl w-full mx-auto scrollbar-thin">
        {messages.map((msg, index) => (
          <div 
            key={index} 
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div className={`max-w-[80%] rounded-2xl px-5 py-3.5 text-sm leading-relaxed shadow-xl border ${
              msg.role === 'user' 
                ? 'bg-indigo-600 border-indigo-500 text-white rounded-br-none shadow-indigo-600/10' 
                : 'bg-gray-900 border-gray-800 text-gray-100 rounded-bl-none'
            }`}>
              <p className="whitespace-pre-wrap">{msg.content}</p>
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="bg-gray-900 border border-gray-800 rounded-2xl rounded-bl-none px-5 py-4 flex items-center space-x-1.5 shadow-md">
              <div className="w-2 h-2 bg-indigo-500 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
              <div className="w-2 h-2 bg-indigo-500 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
              <div className="w-2 h-2 bg-indigo-500 rounded-full animate-bounce"></div>
            </div>
          </div>
        )}

        {error && (
          <div className="text-center text-xs bg-red-500/10 border border-red-500/20 text-red-400 p-3 rounded-xl max-w-md mx-auto">
            {error}
          </div>
        )}
        <div ref={messagesEndRef} />
      </section>

      {/* INPUT FORM */}
      <footer className="p-4 bg-gray-900 border-t border-gray-800 shadow-2xl">
        <form onSubmit={handleSendMessage} className="max-w-4xl w-full mx-auto flex space-x-3">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={loading}
            placeholder="Faça uma pergunta sobre negócios para o assistente Maestro..."
            className="flex-1 bg-gray-950 border border-gray-800 text-white placeholder-gray-600 rounded-xl px-4 py-3.5 text-sm focus:outline-none focus:border-indigo-500 transition-colors disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-800 disabled:text-gray-500 text-white font-medium px-6 rounded-xl transition-all shadow-lg shadow-indigo-600/10 disabled:shadow-none"
          >
            Enviar
          </button>
        </form>
      </footer>
    </main>
  );
}
