import Link from 'next/link';
import type { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';
import { computeTotals, DEFAULT_TAX_RATE } from '@/lib/estimate-totals';
import {
  ArrowRight,
  Check,
  FileText,
  Info,
  LayoutGrid,
  MousePointerClick,
  Sparkles,
} from 'lucide-react';

export const metadata: Metadata = {
  title: 'RENOVATE — Presupuestos de reforma en minutos',
  description:
    'Crea, ajusta y envía presupuestos de reforma con tu propio catálogo de precios, tu logo y un PDF claro que tus clientes entienden.',
};

const eur = (value: number) =>
  value.toLocaleString('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 });

/**
 * Static rows for the hero mock-up. Deliberately plain numbers that add up to
 * 3.085,00 € so the mock never contradicts the totals shown inside it.
 */
const MOCK_ROWS = [
  { phase: 'Demoliciones', name: 'Demolición de tabique de ladrillo', qty: '12 m² × 24,50 €', total: 294 },
  { phase: 'Albañilería', name: 'Alicatado de paredes', qty: '18 m² × 42,00 €', total: 756 },
  { phase: 'Instalaciones', name: 'Instalación eléctrica de baño', qty: '1 ud × 1190,00 €', total: 1190 },
  { phase: 'Fontanería', name: 'Sanitarios y grifería', qty: '1 ud × 845,00 €', total: 845 },
];

const FEATURES = [
  {
    icon: LayoutGrid,
    title: 'Tu catálogo, listo desde el minuto uno',
    text: 'Empiezas con 42 partidas repartidas en 9 fases de reforma. Edítalas, añade las tuyas o impórtalas desde tu Excel en un clic.',
  },
  {
    icon: MousePointerClick,
    title: 'Editor ágil, sin pelearte con el formato',
    text: 'Crea fases y partidas, reordénalas arrastrando, ajusta cantidades y deja una nota por línea para explicar cada trabajo.',
  },
  {
    icon: FileText,
    title: 'Un PDF que el cliente entiende',
    text: 'Tu logo, tu CIF y tus datos en la cabecera. Base imponible, IVA y total desglosados —al 21 %, al 10 % o sin IVA—, listo para imprimir o enviar por email.',
  },
];

const STEPS = [
  {
    title: 'Crea el presupuesto',
    text: 'Indica el cliente y la dirección de la obra. Tarda menos que abrir una hoja de cálculo.',
  },
  {
    title: 'Monta las partidas',
    text: 'Elige servicios del catálogo, ajusta cantidades y precios. Los totales se recalculan solos.',
  },
  {
    title: 'Envíalo y sigue su estado',
    text: 'Imprime el PDF o mándalo por email, y marca el presupuesto como enviado, aceptado, en curso o completado.',
  },
];

const CHECKLIST = [
  'Catálogo propio por empresa, con 42 partidas y 9 fases para empezar',
  'Importación desde Excel y edición en línea de nombre, unidad y precio',
  'Banda de mercado por partida, para revisar el precio antes de enviarlo',
  'Nota por línea redactada en lenguaje de cliente e incluida en el PDF',
  'IA que adapta las partidas técnicas a un texto que el cliente entiende',
  'Fases, partidas y notas: el presupuesto se estructura como la obra',
  'Estados del presupuesto y caducidad automática de las ofertas antiguas',
  'Ajustes de empresa con logo, CIF, dirección y teléfono para el PDF',
  'Presupuestos agrupados por año, para encontrar cualquier obra al instante',
];

export default async function Home() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Same helper the editor and the PDF use, so the sample can never disagree
  // with the numbers the app really produces.
  const mockTotals = computeTotals(
    MOCK_ROWS.reduce((acc, row) => acc + row.total, 0),
    DEFAULT_TAX_RATE
  );

  const primaryCta =
    'inline-flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 active:scale-[0.98] text-white font-bold px-6 py-3.5 rounded-xl shadow-md transition';
  const secondaryCta =
    'inline-flex items-center justify-center gap-2 bg-white hover:bg-zinc-50 active:scale-[0.98] text-zinc-900 font-bold px-6 py-3.5 rounded-xl border border-zinc-200 shadow-sm transition';

  return (
    <div className="flex flex-col min-h-[calc(100vh-4.25rem)]">
      {/* ============================== HERO ============================== */}
      <section className="relative overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 -top-48 h-[460px] bg-gradient-to-b from-blue-50 to-transparent"
        />

        <div className="relative max-w-5xl mx-auto px-4 pt-16 pb-20 md:pt-24 md:pb-28 grid gap-14 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
          <div>
            <span className="inline-flex items-center gap-2 bg-white border border-zinc-200 text-zinc-600 text-xs font-bold px-3 py-1.5 rounded-full shadow-sm">
              <Sparkles size={14} className="text-blue-600" />
              Pensado para empresas y autónomos de reformas
            </span>

            <h1 className="mt-6 text-4xl md:text-5xl font-extrabold tracking-tight text-zinc-900 leading-[1.05]">
              Presupuestos de reforma <span className="text-blue-600">en minutos</span>, no en tardes de Excel.
            </h1>

            <p className="mt-6 text-lg text-zinc-500 font-medium leading-relaxed">
              RENOVATE reúne tu catálogo de precios, un editor ágil y un PDF impecable para el cliente.
              Presupuesta con el cliente delante y envía la propuesta el mismo día.
            </p>

            <div className="mt-8 flex flex-col sm:flex-row gap-3">
              {user ? (
                <>
                  <Link href="/estimates" className={primaryCta}>
                    Ir a mis presupuestos <ArrowRight size={18} />
                  </Link>
                  <Link href="/catalog" className={secondaryCta}>
                    Revisar mi catálogo
                  </Link>
                </>
              ) : (
                <>
                  <Link href="/login/signup" className={primaryCta}>
                    Crear cuenta <ArrowRight size={18} />
                  </Link>
                  <Link href="/login" className={secondaryCta}>
                    Iniciar sesión
                  </Link>
                </>
              )}
            </div>

            <p className="mt-4 text-sm text-zinc-400 font-medium">
              Funciona en el navegador, sin instalar nada. Tu catálogo y tus presupuestos son solo tuyos.
            </p>
          </div>

          {/* Hero mock-up: a stylised estimate, pure CSS so it always renders */}
          <div className="bg-white border border-zinc-200 rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.08)] overflow-hidden">
            <div className="px-5 py-4 border-b border-zinc-100 flex items-start justify-between gap-4">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-widest text-blue-600">
                  Presupuesto 2026-014
                </p>
                <p className="text-sm font-bold text-zinc-900 mt-0.5">
                  Reforma de baño · C/ Mayor 14
                </p>
              </div>
              <span className="shrink-0 text-[11px] font-bold bg-amber-100 text-amber-800 px-2.5 py-1 rounded-full">
                Pendiente
              </span>
            </div>

            <div className="divide-y divide-zinc-100">
              {MOCK_ROWS.map((row) => (
                <div key={row.name} className="px-5 py-3.5">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">
                    {row.phase}
                  </p>
                  <div className="mt-1 flex items-baseline justify-between gap-4">
                    <p className="text-sm font-medium text-zinc-800 leading-snug">{row.name}</p>
                    <p className="text-sm font-bold text-zinc-900 tabular-nums whitespace-nowrap">
                      {eur(row.total)}
                    </p>
                  </div>
                  <p className="text-xs text-zinc-400 font-medium mt-0.5">{row.qty}</p>
                </div>
              ))}
            </div>

            <div className="px-5 py-4 bg-zinc-50 border-t border-zinc-100">
              <div className="flex items-center justify-between text-xs font-bold text-zinc-500">
                <span>Base imponible</span>
                <span className="tabular-nums">{eur(mockTotals.subtotal)}</span>
              </div>
              <div className="flex items-center justify-between text-xs font-bold text-zinc-500 mt-1">
                <span>IVA ({mockTotals.taxRate}%)</span>
                <span className="tabular-nums">{eur(mockTotals.tax)}</span>
              </div>
              <div className="flex items-center justify-between mt-3 pt-3 border-t border-zinc-200">
                <span className="text-[10px] font-extrabold uppercase tracking-widest text-zinc-400">
                  Total
                </span>
                <span className="text-xl font-black text-blue-600 tabular-nums">
                  {eur(mockTotals.total)}
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ============================= FEATURES ============================= */}
      <section className="max-w-5xl mx-auto px-4 pb-16 md:pb-20 w-full">
        <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight text-zinc-900">
          Todo lo que necesitas para presupuestar
        </h2>
        <p className="mt-3 text-zinc-500 font-medium max-w-2xl">
          Sin plantillas eternas ni copiar y pegar entre archivos: catálogo, editor y documento final
          en el mismo sitio.
        </p>

        <div className="mt-10 grid gap-5 md:grid-cols-3">
          {FEATURES.map(({ icon: Icon, title, text }) => (
            <div
              key={title}
              className="bg-white border border-zinc-200 rounded-2xl shadow-sm p-6 flex flex-col"
            >
              <div className="w-11 h-11 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                <Icon size={20} />
              </div>
              <h3 className="mt-5 text-lg font-extrabold tracking-tight text-zinc-900">{title}</h3>
              <p className="mt-2 text-sm text-zinc-500 font-medium leading-relaxed">{text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* =========================== CÓMO FUNCIONA =========================== */}
      <section className="bg-white border-y border-zinc-200">
        <div className="max-w-5xl mx-auto px-4 py-16 md:py-20 w-full">
          <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight text-zinc-900">
            Cómo funciona
          </h2>
          <p className="mt-3 text-zinc-500 font-medium max-w-2xl">
            Tres pasos, desde la primera visita a la obra hasta el presupuesto en el correo del cliente.
          </p>

          <ol className="mt-10 grid gap-5 md:grid-cols-3">
            {STEPS.map((step, index) => (
              <li key={step.title} className="bg-zinc-50 border border-zinc-200 rounded-2xl p-6">
                <span className="inline-flex items-center justify-center w-9 h-9 rounded-full bg-blue-600 text-white font-black text-sm shadow-sm">
                  {index + 1}
                </span>
                <h3 className="mt-4 text-lg font-extrabold tracking-tight text-zinc-900">
                  {step.title}
                </h3>
                <p className="mt-2 text-sm text-zinc-500 font-medium leading-relaxed">{step.text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ============================ CHECKLIST ============================ */}
      <section className="max-w-5xl mx-auto px-4 py-16 md:py-20 w-full">
        <div className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
          <div>
            <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight text-zinc-900">
              Lo que ya puedes hacer hoy
            </h2>
            <p className="mt-3 text-zinc-500 font-medium leading-relaxed">
              Cada presupuesto guarda sus propias partidas y precios, así que editar tu catálogo nunca
              cambia una oferta que ya has enviado.
            </p>

            {/* Honest note: the default prices are a hand-reviewed draft, never a licensed database */}
            <div className="mt-8 flex gap-3 bg-blue-50/60 border border-blue-100 rounded-2xl p-4">
              <Info size={18} className="text-blue-600 shrink-0 mt-0.5" />
              <p className="text-sm text-zinc-600 font-medium leading-relaxed">
                Los precios del catálogo por defecto son{' '}
                <strong className="font-bold">orientativos</strong> y proceden de un borrador revisado a
                mano. Revísalos y ajústalos a tu zona antes de enviar una oferta: son un punto de
                partida, no una tarifa oficial.
              </p>
            </div>
          </div>

          <ul className="grid gap-3">
            {CHECKLIST.map((item) => (
              <li
                key={item}
                className="flex items-start gap-3 bg-white border border-zinc-200 rounded-xl px-4 py-3 shadow-sm"
              >
                <span className="mt-0.5 w-5 h-5 shrink-0 rounded-full bg-green-100 text-green-700 flex items-center justify-center">
                  <Check size={13} />
                </span>
                <span className="text-sm text-zinc-700 font-medium leading-snug">{item}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ============================ CTA FINAL ============================ */}
      <section className="max-w-5xl mx-auto px-4 pb-16 md:pb-20 w-full">
        <div className="bg-blue-600 rounded-3xl px-6 py-12 md:px-12 md:py-14 text-center shadow-lg">
          <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight text-white">
            Tu próximo presupuesto, hoy mismo
          </h2>
          <p className="mt-4 text-blue-100 font-medium max-w-2xl mx-auto leading-relaxed">
            Crea tu cuenta, revisa el catálogo que te dejamos preparado y envía tu primera oferta con tu
            logo y tus datos.
          </p>

          <div className="mt-8 flex justify-center">
            <Link
              href={user ? '/estimates' : '/login/signup'}
              className="inline-flex items-center justify-center gap-2 bg-white hover:bg-zinc-50 active:scale-[0.98] text-blue-700 font-bold px-6 py-3.5 rounded-xl shadow-md transition"
            >
              {user ? 'Ir a mis presupuestos' : 'Crear cuenta'} <ArrowRight size={18} />
            </Link>
          </div>
        </div>
      </section>

      {/* ============================== FOOTER ============================== */}
      <footer className="border-t border-zinc-200 bg-white mt-auto">
        <div className="max-w-5xl mx-auto px-4 py-8 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <p className="font-extrabold tracking-tighter text-zinc-900 text-center md:text-left">
            RENOVATE<span className="text-blue-600">.</span>
          </p>
          <p className="text-sm text-zinc-400 font-medium text-center md:text-right">
            Presupuestos de reforma para empresas y autónomos · {new Date().getFullYear()}
          </p>
        </div>
      </footer>
    </div>
  );
}

