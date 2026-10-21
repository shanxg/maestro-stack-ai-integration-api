'use client'; // 🌐 CLIENT DIRECTIVE: Required for React state handling and navigation hooks.

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiRequest } from '../utils/apiClient'; // The one way pages call the API (issue #54)

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
        throw new Error('Please fill in every field of the form to continue.');
      }

      if (password.length < 8) {
        throw new Error('The security policy requires a password with at least 8 characters.');
      }

      // =========================================================================
      // 📡 SHARED API CLIENT (issue #54)
      // =========================================================================
      // apiRequest() builds the absolute API URL from NEXT_PUBLIC_API_URL (this page used to hardcode
      // http://localhost:3000), so the call never goes to the Next.js server itself. A response that
      // is not JSON, or an error status, arrives in the catch below as an ApiError with a message.
      // requiresSession: false, because creating an account needs no session.
      await apiRequest('/api/v1/users', {
        method: 'POST',
        body: {
          name: name.trim(),
          email: email.trim(),
          password: password
        },
        fallbackMessage: 'Failed to submit the registration request.',
        requiresSession: false
      });

      // HTTP 202 ACCEPTED: Notify user about the background batch queue processing success
      setSuccess('Request sent! Redirecting to the sign-in portal...');

      // Auto-navigate to login boundary after a short timeout loop
      setTimeout(() => {
        router.push('/login');
      }, 2500);
    } catch (err: unknown) {
      console.error('❌ Asynchronous registration barrier exception:', err);
      setError(err instanceof Error ? err.message : 'Internal network error.');
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
        <h1 className="text-3xl font-bold text-center text-white mb-2 tracking-tight">Create Account</h1>
        <p className="text-sm text-center text-gray-400 mb-8">Sign up for the distributed Maestro ecosystem console</p>

        {error && (
          <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-sm p-4 rounded-xl mb-6">{error}</div>
        )}

        {success && (
          <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm p-4 rounded-xl mb-6">
            {success}
          </div>
        )}

        <form onSubmit={handleRegister} className="space-y-5">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">Full Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Lucas Rivaldo"
              className="w-full bg-gray-950 border border-gray-800 text-white rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-500 transition-colors placeholder-gray-700"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">
              E-mail Address
            </label>
            <input
              type="text"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="lucas@example.com"
              className="w-full bg-gray-950 border border-gray-800 text-white rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-500 transition-colors placeholder-gray-700"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">
              Access Key (Password)
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 8 characters"
              className="w-full bg-gray-950 border border-gray-800 text-white rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-500 transition-colors placeholder-gray-700"
            />
          </div>

          {/* BUTTON REMEDIATION: Fixed broken active utility string and forced solid semantic separation */}
          <button
            type="submit"
            disabled={loading}
            className="w-full mt-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-600/40 text-white font-medium py-3.5 rounded-xl transition-all shadow-lg active:scale-98 cursor-pointer text-sm tracking-wide"
          >
            {loading ? 'Queuing Registration...' : 'Register Credentials'}
          </button>

          {/* INTERACTIVE LINK REMEDIATION: Isolated the inline trigger using focusable, high-contrast blocks */}
          <div className="text-center pt-4 border-t border-gray-800/60 mt-4">
            <span className="text-xs text-gray-500">Already have an account? </span>
            <button
              type="button"
              onClick={() => router.push('/login')}
              className="text-xs text-indigo-400 hover:text-indigo-300 font-semibold transition-colors cursor-pointer focus:outline-none focus:underline inline-block px-1 py-0.5"
            >
              Sign In
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}
