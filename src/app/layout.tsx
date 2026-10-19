import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { signOut } from './login/actions';
import AuthSessionHandler from '@/components/AuthSessionHandler';
import CompanyBrand from '@/components/CompanyBrand';
import type { CompanyBrandInfo } from '@/types';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });

export const metadata: Metadata = {
  title: 'Renovate MVP - Presupuestos de Construcción',
  description: 'SaaS vertical rápido para presupuestos de reformas.',
  // Build fingerprint: lets you confirm which deployment a browser is showing.
  // View Source → search "build-commit".
  other: {
    'build-commit': process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? 'local',
  },
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  /**
   * The company that owns the session, for the bar's brand. One embedded select
   * through users.company_id → companies (the FK exists): the nav is rendered on
   * every route, so it must not cost three round trips. If the lookup fails the
   * bar keeps its wordmark — a missing name is better than a broken image.
   */
  let company: CompanyBrandInfo | null = null;
  if (user) {
    const { data, error } = await supabase
      .from('users')
      .select('company_id, companies(name, logo_url)')
      .eq('id', user.id)
      .single();

    if (error) {
      console.error('nav: company lookup failed', error.message);
    } else {
      const joined = data?.companies as CompanyBrandInfo | CompanyBrandInfo[] | null;
      company = Array.isArray(joined) ? (joined[0] ?? null) : joined;
    }
  }

  return (
    <html lang="es" className={`${inter.variable} font-sans antialiased`}>
      <body className="bg-zinc-50 min-h-screen border-t-4 border-blue-600">
        <AuthSessionHandler />

        {/* Global Nav MVP */}
        <nav className="bg-white border-b border-zinc-200 shadow-sm sticky top-0 z-40">
          <div className="w-full px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-3">
            <Link href="/" className="font-extrabold text-xl tracking-tighter text-zinc-900 shrink-0">
              RENOVATE<span className="text-blue-600">.</span>
            </Link>
            
            {user && (
              <div className="flex gap-6 text-sm font-bold text-zinc-500 hidden md:flex">
                <Link href="/clients" className="hover:text-zinc-900 transition">Clientes</Link>
                <Link href="/catalog" className="hover:text-zinc-900 transition">Catálogo</Link>
                <Link href="/settings" className="hover:text-zinc-900 transition">Ajustes</Link>
              </div>
            )}

            <div className="flex items-center gap-3 sm:gap-4 min-w-0">
              {/* The company's own brand, next to (never instead of) RENOVATE. */}
              {company?.name && (
                <Link
                  href="/clients"
                  title={company.name}
                  className="flex items-center gap-2 min-w-0 hover:opacity-80 transition"
                >
                  <CompanyBrand name={company.name} logoUrl={company.logo_url} />
                  <span className="hidden sm:inline truncate max-w-[9rem] lg:max-w-[12rem] text-sm lg:text-base font-extrabold tracking-tight text-zinc-900">
                    {company.name}
                  </span>
                </Link>
              )}
              {user ? (
                <form action={signOut}>
                  <button className="text-xs font-bold text-zinc-500 hover:text-red-600 border border-zinc-200 bg-white px-3 py-1.5 rounded-lg shadow-sm transition whitespace-nowrap">
                    {/* The email only where there is room for it: the bar now also
                        carries the company's name. */}
                    <span className="hidden lg:inline">Cerrar Sesión ({user.email})</span>
                    <span className="lg:hidden">Salir</span>
                  </button>
                </form>
              ) : (
                <Link href="/login" className="text-sm font-bold bg-blue-50 text-blue-700 px-4 py-2 rounded-lg hover:bg-blue-100 transition shadow-sm">
                  Iniciar Sesión
                </Link>
              )}
            </div>
          </div>

          {/* Mobile nav: the section links get their own row so the top bar stays on one line. */}
          {user && (
            <div className="md:hidden border-t border-zinc-100">
              <div className="px-4 h-11 flex items-center gap-6 text-sm font-bold text-zinc-500 overflow-x-auto">
                <Link href="/clients" className="hover:text-zinc-900 transition whitespace-nowrap">Clientes</Link>
                <Link href="/catalog" className="hover:text-zinc-900 transition whitespace-nowrap">Catálogo</Link>
                <Link href="/settings" className="hover:text-zinc-900 transition whitespace-nowrap">Ajustes</Link>
              </div>
            </div>
          )}
        </nav>

        {children}
      </body>
    </html>
  );
}
