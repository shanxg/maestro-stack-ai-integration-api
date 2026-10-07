'use client'; // 🌐 DIRETIVA DE CLIENTE: Obriga o Next.js App Router a tratar este arquivo no ecossistema do navegador.
              // É obrigatório para conseguirmos usar estados (useState), efeitos (useEffect) e ler eventos de cliques.

import { useState } from 'react';
import { useRouter } from 'next/navigation'; // Roteador oficial moderno da arquitetura App Router do Next.js.

export default function LoginPage() {
  // ==========================================
  // 🎭 GERENCIAMENTO DE ESTADO (REACT HOOKS)
  // ==========================================
  // O useState vincula os inputs da tela à memória do React. Quando o usuário digita, o estado atualiza em tempo real.
  const [username, setUsername] = useState(''); // Guarda o texto digitado na caixa de "Usuário"
  const [password, setPassword] = useState(''); // Guarda o texto digitado na caixa de "Senha"
  const [error, setError] = useState('');       // Armazena mensagens de falha para exibir alertas visuais na tela
  const [loading, setLoading] = useState(false); // Atua como um interruptor lógico (booleano) para travar o botão durante a requisição

  const router = useRouter(); // Instancia a ferramenta de navegação para mudar de tela após o sucesso

  /**
   * 📡 GATILHO DE AUTENTICAÇÃO ( handleLogin )
   * Função assíncrona disparada imediatamente quando o usuário clica no botão de submit do formulário.
   */
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault(); // 🛑 INTERRUPÇÃO PADRÃO: Impede o navegador de recarregar a página inteira (comportamento nativo do HTML).
    setError('');       // Reseta qualquer mensagem de erro de tentativas anteriores
    setLoading(true);   // Ativa o estado de carregamento para desabilitar cliques repetidos no botão

    try {
      // 🛡️ VALIDAÇÃO DEFENSIVA ANTES DO DISPARO:
      // O método .trim() remove espaços vazios acidentais nas pontas do texto.
      // Se algum campo estiver em branco, estoura um erro local sem gastar processamento de rede.
      if (!username.trim() || !password.trim()) {
        throw new Error('Por favor, preencha todos os campos do formulário para prosseguir.');
      }

      // 🌐 PONTE DE COMUNICAÇÃO HTTP FORÇADA EXTERNA:
      // Invocamos o construtor nativo new URL() para obrigar o Next.js a quebrar as rotas relativas
      // e despachar os bytes estritamente para fora, batendo na porta do Express de verdade!
      const targetUrl = new URL('http://127.0.0.1:3000/auth/login');

      const res = await fetch(targetUrl.href, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          username: username.trim(), 
          password: password.trim() 
        }),
      });

      // Transforma o fluxo de bytes retornado pela API em um objeto JSON manipulável
      const data = await res.json();

      // ❌ CONDIÇÃO DE REJEIÇÃO DA API:
      // Se a resposta HTTP vier com status de erro (400 Bad Request, 401 Unauthorized etc),
      // a propriedade 'res.ok' será false. Capturamos o texto do erro configurado no back-end.
      if (!res.ok) {
        throw new Error(data.error?.message || 'Falha na validação do acesso. Verifique suas credenciais.');
      }

      // =========================================================================
      // 🔐 MARCO CONSOLIDADO: ARMAZENAMENTO SEGURO DO TOKEN JWT
      // =========================================================================
      // Com as credenciais validadas (Status 200 OK), capturamos a assinatura digital do token
      // e salvamos na gaveta permanente do navegador (localStorage). Isso manterá a sessão ativa
      // e servirá como o passaporte de segurança para bater nas rotas protegidas da IA posterior.
      localStorage.setItem('token', data.token);

      // 🔀 DIRECIONAMENTO SEGURO:
      // Empurra o usuário autenticado para a rota do painel do Chat Inteligente.
      router.push('/chat');

    } catch (err: unknown) {
      // Bloco Catch: Intercepta qualquer falha de validação local ou queda física do servidor  
      console.error('❌ Falha capturada na esteira de controle de login:', err);

      setError(
        err instanceof Error
          ? err.message
          : 'Erro crítico de comunicação com o servidor de autenticação.'
      );
    } finally {
      // O bloco finally roda obrigatoriamente independente de sucesso ou falha, desligando o loading do botão
      setLoading(false);
    }
  };

  return (
    // 🎨 ESTRUTURA VISUAL ESTILIZADA COM CLASSES UTILITÁRIAS DO TAILWIND CSS
    // min-h-screen: Garante o fundo preto ocupando 100% da altura da janela do monitor
    // bg-gray-950: Define a cor de fundo padrão ultra-escura (padrão de interfaces modernas)
    <main className="min-h-screen flex items-center justify-center bg-gray-950 px-4">
      
      {/* CARD CENTRALIZADO DO FORMULÁRIO */}
      <div className="max-w-md w-full bg-gray-900 border border-gray-800 p-8 rounded-2xl shadow-2xl">
        <h1 className="text-3xl font-bold text-center text-white mb-2 tracking-tight">Projeto Maestro</h1>
        <p className="text-sm text-center text-gray-400 mb-8">Portal de orquestração e gerenciamento de Inteligência Artificial</p>

        {/* ALERTA DE ERRO CONDICIONAL (Só renderiza na tela se o estado 'error' possuir texto) */}
        {error && (
          <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-sm p-4 rounded-xl mb-6 transition-all">
            {error}
          </div>
        )}

        {/* FORMULÁRIO DE ENTRADA */}
        <form onSubmit={handleLogin} className="space-y-6">
          
          {/* CAIXA DE ENTRADA: USUÁRIO */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">
              Identificador (Username)
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)} // Atualiza o estado react a cada letra digitada
              placeholder="Ex: admin"
              className="w-full bg-gray-950 border border-gray-800 text-white rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-500 transition-colors placeholder-gray-600"
            />
          </div>

          {/* CAIXA DE ENTRADA: SENHA */}
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

          {/* BOTÃO MESTRE DE SUBMIT */}
          {/* disabled={loading}: Se a requisição estiver rodando, congela o botão impedindo duplo clique */}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-600/40 text-white font-medium py-3 rounded-xl transition-all shadow-lg shadow-indigo-600/10 active:scale-[0.98]"
          >
            {loading ? 'Processando Acesso...' : 'Entrar no Console'}
          </button>
          
        </form>
      </div>
    </main>
  );
}
