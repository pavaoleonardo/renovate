import Link from 'next/link';

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24 bg-zinc-50">
      <div className="max-w-3xl text-center space-y-8">
        <h1 className="text-5xl font-extrabold tracking-tight text-zinc-900">
          Presupuestos de <span className="text-blue-600">Reforma</span>
        </h1>
        <p className="text-xl text-zinc-500">
          La forma más rápida para que las empresas de construcción creen, gestionen y realicen el seguimiento de sus presupuestos.
        </p>
        
        <div className="flex justify-center gap-4">
          <Link href="/estimates" className="px-6 py-3 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 transition">
            Ir al Panel
          </Link>
          <Link href="/estimates/new" className="px-6 py-3 rounded-lg bg-zinc-200 text-zinc-900 font-medium hover:bg-zinc-300 transition">
            + Nuevo Presupuesto
          </Link>
        </div>
      </div>
    </main>
  );
}
