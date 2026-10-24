"use client";

import { useState } from 'react';
import { ChevronDown, ChevronUp, Minus, Plus, Trash2 } from 'lucide-react';
import type { CatalogService, EstimateRow } from '@/types';
import AutoGrowTextarea from './AutoGrowTextarea';
import DecimalInput from './DecimalInput';

const fmt = (n: number) => n.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' });

/**
 * One budget line, as a phone needs to see it.
 *
 * The desktop table shows every field of every line at once, and on a phone that
 * turned each line into a 300px block of scattered labels — an 18-line obra was
 * 5,400px of scrolling with four chevrons per card. Here the line is a 64px
 * summary (name, «61 M2 × 18,00 €», total) that opens into its fields on tap, so
 * the budget reads as a list first and as a form only where the user is editing.
 *
 * A line with no description yet starts open: a freshly added line is useless as
 * a summary, and the catalogue chevron has to be reachable immediately.
 */
export default function MobileLineCard({
  row,
  rowIndex,
  rowCount,
  sectionServices,
  parentPhase,
  onUpdate,
  onMove,
  onRemove,
  onApplyService,
}: {
  row: EstimateRow;
  rowIndex: number;
  rowCount: number;
  sectionServices: CatalogService[];
  parentPhase: string | null;
  onUpdate: (id: string, updates: Partial<EstimateRow>) => void;
  onMove: (index: number, delta: number) => void;
  onRemove: (id: string) => void;
  onApplyService: (id: string, serviceId: string) => void;
}) {
  const [open, setOpen] = useState(() => !row.service_name_snapshot);

  const quantity = row.quantity || 0;
  const price = row.price_snapshot || 0;
  const total = quantity * price;
  const unit = (row.unit_snapshot || '').trim();
  const label = row.service_name_snapshot || 'Nueva línea';

  return (
    <div className="md:hidden">
      {/* The whole summary is the toggle: a 44px-tall target, not a chevron the
          user has to hit. */}
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className={`flex w-full items-start gap-2 px-3 text-left transition ${open ? 'bg-blue-50/40 pb-2 pt-3' : 'py-3 active:bg-zinc-50'}`}
      >
        <span className="min-w-0 flex-1">
          <span className={`block text-sm font-semibold leading-snug text-zinc-900 ${open ? '' : 'line-clamp-2'}`}>
            {label}
          </span>
          <span className="mt-0.5 block text-xs font-medium tabular-nums text-zinc-500">
            {quantity.toLocaleString('es-ES')} {unit || 'ud'} × {fmt(price)}
          </span>
        </span>
        <span className="shrink-0 pt-0.5 text-sm font-extrabold tabular-nums text-zinc-900">
          {fmt(total)}
        </span>
        <ChevronDown
          size={16}
          className={`mt-1 shrink-0 text-zinc-400 transition ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div className="space-y-2 px-3 pb-3">
          <div className="relative">
            <AutoGrowTextarea
              minRows={2}
              value={row.service_name_snapshot || ''}
              onChange={(value) => onUpdate(row.id, { service_name_snapshot: value })}
              placeholder="Descripción del ítem…"
              aria-label="Descripción del ítem"
              className="w-full resize-none rounded-lg border border-zinc-200 bg-white px-2.5 py-2 pr-9 text-sm font-medium leading-snug text-zinc-900 outline-none transition placeholder:text-zinc-300 focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
            />
            {/* The catalogue picker sits inside the description box here too:
                choosing a partida of this section fills name, unit and price. */}
            <select
              title={sectionServices.length === 0 ? 'No hay partidas del catálogo en esta sección' : 'Elegir una partida del catálogo'}
              aria-label="Elegir una partida del catálogo"
              value=""
              onChange={(e) => onApplyService(row.id, e.target.value)}
              className="absolute inset-y-0 right-0 w-9 cursor-pointer opacity-0"
            >
              <option value="" disabled>
                {parentPhase ? `Elegir de «${parentPhase}»…` : 'Elegir del catálogo…'}
              </option>
              {sectionServices.length === 0 && (
                <option value="" disabled>Sin partidas del catálogo en esta sección</option>
              )}
              {sectionServices.map((service) => (
                <option key={service.id} value={service.id}>
                  {service.name} ({service.unit} — {fmt(service.base_price)})
                </option>
              ))}
            </select>
            <ChevronDown size={14} className="pointer-events-none absolute right-2.5 top-2.5 text-zinc-400" />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="mb-0.5 block text-[10px] font-black uppercase tracking-widest text-zinc-400">
                Unidad
              </label>
              <input
                value={row.unit_snapshot || ''}
                onChange={(e) => onUpdate(row.id, { unit_snapshot: e.target.value })}
                placeholder="m2"
                aria-label="Unidad"
                className="h-11 w-full rounded-lg border border-zinc-200 bg-white px-2.5 text-xs font-bold uppercase text-zinc-500 outline-none transition placeholder:text-zinc-300 focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              />
            </div>
            <div>
              <label className="mb-0.5 block text-[10px] font-black uppercase tracking-widest text-zinc-400">
                Precio
              </label>
              <div className="relative">
                <DecimalInput
                  value={row.price_snapshot}
                  onValueChange={(value) => onUpdate(row.id, { price_snapshot: value })}
                  ariaLabel={`Precio de ${label}`}
                  className="h-11 w-full rounded-lg border border-zinc-200 bg-white pl-2.5 pr-6 text-right text-sm font-medium tabular-nums outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                />
                <span className="pointer-events-none absolute right-2.5 top-3 text-sm text-zinc-400">€</span>
              </div>
            </div>
          </div>

          <div>
            <label className="mb-0.5 block text-[10px] font-black uppercase tracking-widest text-zinc-400">
              Cantidad
            </label>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => onUpdate(row.id, { quantity: Math.max(0, quantity - 1) })}
                aria-label="Restar una unidad"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-zinc-200 bg-white text-zinc-500 transition hover:bg-blue-50 hover:text-blue-600 active:scale-95"
              >
                <Minus size={16} />
              </button>
              <DecimalInput
                value={row.quantity}
                onValueChange={(value) => onUpdate(row.id, { quantity: value })}
                ariaLabel="Cantidad"
                className="h-11 min-w-0 flex-1 rounded-lg border border-zinc-200 bg-white text-center text-base font-bold tabular-nums text-blue-700 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              />
              <button
                type="button"
                onClick={() => onUpdate(row.id, { quantity: quantity + 1 })}
                aria-label="Sumar una unidad"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-zinc-200 bg-white text-zinc-500 transition hover:bg-blue-50 hover:text-blue-600 active:scale-95"
              >
                <Plus size={16} />
              </button>
            </div>
          </div>

          <div>
            <label className="mb-0.5 block text-[10px] font-black uppercase tracking-widest text-zinc-400">
              Nota para el cliente
            </label>
            <AutoGrowTextarea
              minRows={2}
              value={row.client_note || ''}
              onChange={(value) => onUpdate(row.id, { client_note: value })}
              placeholder="Opcional: cómo se explica esta partida en el presupuesto…"
              className="w-full resize-none rounded-lg border border-zinc-200 bg-white px-2.5 py-2 text-xs leading-relaxed text-zinc-600 outline-none transition placeholder:text-zinc-300 focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
            />
          </div>

          {/* Reordering and deleting live where the thumb already is, once the card
              is open: collapsed, a budget stays a list of numbers, not of buttons. */}
          <div className="flex items-center justify-between border-t border-zinc-200/70 pt-1">
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => onMove(rowIndex, -1)}
                disabled={rowIndex === 0}
                aria-label="Subir esta línea"
                className="flex h-11 w-11 items-center justify-center rounded-lg text-zinc-500 transition hover:bg-white disabled:opacity-25"
              >
                <ChevronUp size={18} />
              </button>
              <button
                type="button"
                onClick={() => onMove(rowIndex, 1)}
                disabled={rowIndex === rowCount - 1}
                aria-label="Bajar esta línea"
                className="flex h-11 w-11 items-center justify-center rounded-lg text-zinc-500 transition hover:bg-white disabled:opacity-25"
              >
                <ChevronDown size={18} />
              </button>
            </div>
            <button
              type="button"
              onClick={() => onRemove(row.id)}
              aria-label="Eliminar esta línea"
              className="flex h-11 items-center gap-1.5 rounded-lg px-3 text-xs font-bold text-zinc-500 transition hover:bg-red-50 hover:text-red-600"
            >
              <Trash2 size={16} /> Eliminar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
