'use client'; // 🌐 CLIENT DIRECTIVE: Required for effects and navigation hooks.

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * 🏠 APPLICATION ENTRY POINT (HomePage - Route /)
 * Since this project requires access control, the root route acts as a traffic guard,
 * sending users directly to the authentication flow.
 */
export default function HomePage() {
  const router = useRouter(); // Create the modern Next.js App Router helper

  /**
  * 🔀 AUTOMATIC REDIRECT
  * Runs as soon as someone opens the site in a browser.
   */
  useEffect(() => {
    // Use router.replace() instead of .push() for a better user experience:
    // It replaces the current history entry, so clicking Back on the login page
    // does not trap the user in an infinite redirect loop.
    router.replace('/login');
  }, [router]);

  return (
    // Briefly display this transition while Next.js processes navigation.
    <main className="min-h-screen bg-gray-950 flex items-center justify-center text-gray-500 text-sm tracking-widest font-mono uppercase animate-pulse">
      Carregando ecossistema Maestro...
    </main>
  );
}
