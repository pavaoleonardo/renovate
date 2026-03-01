import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { signOut } from './login/actions';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });

export const metadata: Metadata = {
  title: 'Renovate MVP - Presupuestos de Construcción',
  description: 'SaaS vertical rápido para presupuestos de reformas.',
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  return (
    <html lang="es" className={`${inter.variable} font-sans antialiased`}>
      <body className="bg-zinc-50 min-h-screen border-t-4 border-blue-600">
        
        {/* Global Nav MVP */}
        <nav className="bg-white border-b border-zinc-200 shadow-sm sticky top-0 z-40">
          <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
            <Link href="/" className="font-extrabold text-xl tracking-tighter text-zinc-900">
              RENOVATE<span className="text-blue-600">.</span>
            </Link>
            
            {user && (
              <div className="flex gap-6 text-sm font-bold text-zinc-500 hidden md:flex">
                <Link href="/estimates" className="hover:text-zinc-900 transition">Presupuestos</Link>
                <Link href="/catalog" className="hover:text-zinc-900 transition">Catálogo</Link>
                <Link href="/settings" className="hover:text-zinc-900 transition">Ajustes</Link>
              </div>
            )}

            <div className="flex items-center gap-4">
              {user ? (
                <form action={signOut}>
                  <button className="text-xs font-bold text-zinc-500 hover:text-red-600 border border-zinc-200 bg-white px-3 py-1.5 rounded-lg shadow-sm transition">
                    Cerrar Sesión ({user.email})
                  </button>
                </form>
              ) : (
                <Link href="/login" className="text-sm font-bold bg-blue-50 text-blue-700 px-4 py-2 rounded-lg hover:bg-blue-100 transition shadow-sm">
                  Iniciar Sesión
                </Link>
              )}
            </div>
          </div>
        </nav>

        {children}
      </body>
    </html>
  );
}
