'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  addCatalogService,
  createCatalogPhase,
  deleteCatalogService,
  listCatalogPhases,
  processExcelUpload,
  updateCatalogService,
} from './actions'
import { ensureCatalog, searchCatalog, seedDefaultCatalog } from '@/app/actions'
import { AlertCircle, CheckCircle2, Box, Plus, RefreshCw, Sparkles, Trash2, UploadCloud } from 'lucide-react'
import { CatalogService } from '@/types'

const UNITS = ['m2', 'ml', 'm3', 'ud', 'kg', 'h', 'vg']

const eur = (value: number) =>
  value.toLocaleString('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 })

export default function CatalogPage() {
  const [services, setServices] = useState<CatalogService[]>([])
  const [phases, setPhases] = useState<{ id: string; name: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [importMode, setImportMode] = useState<'replace' | 'merge'>('replace')
  const [result, setResult] = useState<{ success: boolean; text: string } | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [seedStep, setSeedStep] = useState<null | 'choose' | 'confirm-replace'>(null)
  const [newService, setNewService] = useState({ phaseId: '', name: '', unit: 'ud', price: '' })

  const fetchCatalog = useCallback(async () => {
    setLoading(true)
    const [catalog, phaseList] = await Promise.all([searchCatalog(), listCatalogPhases()])
    setServices(catalog || [])
    setPhases(phaseList || [])
    setNewService((prev) => ({ ...prev, phaseId: prev.phaseId || phaseList?.[0]?.id || '' }))
    setLoading(false)
    return catalog || []
  }, [])

  // First visit: if the company has no catalog yet, load the default one.
  useEffect(() => {
    ;(async () => {
      const existing = await fetchCatalog()
      if (existing.length === 0) {
        const seeded = await ensureCatalog()
        if (seeded.seeded) {
          setResult({ success: true, text: `Catálogo por defecto cargado: ${seeded.services} servicios.` })
          await fetchCatalog()
        }
      }
    })()
  }, [fetchCatalog])

  const runSeed = async (mode: 'merge' | 'replace') => {
    setBusy(true)
    setResult(null)
    const res = await seedDefaultCatalog({ mode })
    setBusy(false)
    setSeedStep(null)

    if (!res.success) {
      setResult({ success: false, text: res.error || 'No se pudo cargar el catálogo por defecto.' })
      return
    }

    if (mode === 'replace') {
      setResult({ success: true, text: `Catálogo reemplazado: ${res.servicesCreated} partidas del catálogo por defecto.` })
    } else if (res.servicesCreated > 0 || res.phasesCreated > 0) {
      const parts = [`${res.servicesCreated} partidas añadidas`, `${res.phasesCreated} fases nuevas`]
      if (res.servicesSkipped > 0) parts.push(`${res.servicesSkipped} ya existían`)
      setResult({ success: true, text: `Catálogo por defecto añadido: ${parts.join(', ')}.` })
    } else {
      setResult({ success: true, text: 'Tu catálogo ya tenía todas las partidas del catálogo por defecto.' })
    }

    await fetchCatalog()
  }

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!file) return
    setBusy(true)
    setResult(null)

    const formData = new FormData()
    formData.append('file', file)
    formData.append('mode', importMode)

    const res = await processExcelUpload(formData)
    setBusy(false)
    if (res.success) {
      setFile(null)
      setResult({ success: true, text: res.message || 'Excel importado.' })
      await fetchCatalog()
    } else {
      setResult({ success: false, text: res.error || 'No se pudo importar el Excel.' })
    }
  }

  const handleUpdate = async (id: string, updates: { name?: string; unit?: string; base_price?: number }) => {
    setServices((prev) => prev.map((s) => (s.id === id ? { ...s, ...updates } : s)))
    const res = await updateCatalogService(id, updates)
    if (!res.success) setResult({ success: false, text: res.error || 'No se pudo guardar el cambio.' })
  }

  const handleDelete = async (service: CatalogService) => {
    if (!window.confirm(`¿Eliminar «${service.name}» del catálogo?`)) return
    setServices((prev) => prev.filter((s) => s.id !== service.id))
    const res = await deleteCatalogService(service.id)
    if (!res.success) {
      setResult({ success: false, text: res.error || 'No se pudo eliminar.' })
      await fetchCatalog()
    }
  }

  const handleAddService = async () => {
    const phaseId = newService.phaseId || phases[0]?.id
    if (!phaseId || !newService.name.trim()) {
      setResult({ success: false, text: 'Indica la fase y el nombre del servicio.' })
      return
    }
    setBusy(true)
    const res = await addCatalogService(phaseId, {
      name: newService.name,
      unit: newService.unit,
      base_price: Number(newService.price.replace(',', '.')) || 0,
    })
    setBusy(false)
    if (res.success) {
      setNewService({ phaseId, name: '', unit: 'ud', price: '' })
      setShowAdd(false)
      await fetchCatalog()
    } else {
      setResult({ success: false, text: res.error || 'No se pudo añadir el servicio.' })
    }
  }

  const handleCreatePhase = async () => {
    const name = window.prompt('Nombre de la nueva fase (ej. «Extras y varios»)')
    if (!name) return
    setBusy(true)
    const res = await createCatalogPhase(name)
    setBusy(false)
    if (res.success && res.phase) setNewService((prev) => ({ ...prev, phaseId: res.phase!.id }))
    await fetchCatalog()
  }

  const grouped = services.reduce((acc, service) => {
    const phaseName = service.phase_name || 'Sin categoría'
    if (!acc[phaseName]) acc[phaseName] = []
    acc[phaseName].push(service)
    return acc
  }, {} as Record<string, CatalogService[]>)

  return (
    <div className="max-w-3xl mx-auto py-12 px-4">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-extrabold text-zinc-900 tracking-tight flex items-center gap-3">
            <Box size={28} className="text-blue-600" /> Mi Catálogo
          </h1>
          <p className="text-zinc-500 mt-2 font-medium">
            {loading ? 'Cargando…' : `${services.length} servicios en ${Object.keys(grouped).length} fases`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setSeedStep('choose')}
            disabled={busy}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:bg-zinc-300 text-white px-4 py-2.5 rounded-xl font-bold text-sm transition active:scale-95"
          >
            <Sparkles size={16} /> Cargar catálogo por defecto
          </button>
          <button
            onClick={() => setShowAdd((v) => !v)}
            disabled={busy}
            className="flex items-center gap-2 bg-zinc-900 hover:bg-black disabled:bg-zinc-300 text-white px-4 py-2.5 rounded-xl font-bold text-sm transition active:scale-95"
          >
            <Plus size={16} /> Añadir servicio
          </button>
          <button
            onClick={handleCreatePhase}
            disabled={busy}
            className="flex items-center gap-2 bg-zinc-100 hover:bg-zinc-200 text-zinc-900 px-4 py-2.5 rounded-xl font-bold text-sm transition active:scale-95"
          >
            <Plus size={16} /> Fase
          </button>
        </div>
      </div>

      {result && (
        <div
          className={`mb-6 p-4 rounded-lg flex items-start gap-3 border font-medium text-sm ${
            result.success ? 'bg-green-50 border-green-200 text-green-800' : 'bg-red-50 border-red-100 text-red-700'
          }`}
        >
          {result.success ? (
            <CheckCircle2 size={18} className="shrink-0 mt-0.5" />
          ) : (
            <AlertCircle size={18} className="shrink-0 mt-0.5" />
          )}
          <span>{result.text}</span>
        </div>
      )}

      {seedStep && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl border border-zinc-100 w-full max-w-lg p-6">
            <div className="flex items-start gap-3">
              <div className="bg-blue-50 text-blue-600 rounded-full p-2 shrink-0">
                <Sparkles size={20} />
              </div>
              <div>
                <h3 className="text-lg font-extrabold text-zinc-900">Catálogo por defecto</h3>
                <p className="text-sm text-zinc-500 font-medium mt-1">
                  42 partidas en 9 fases con precios orientativos y su banda de mercado. ¿Cómo quieres cargarlo?
                </p>
              </div>
            </div>

            {seedStep === 'choose' ? (
              <div className="mt-5 space-y-3">
                <button
                  onClick={() => runSeed('merge')}
                  disabled={busy}
                  className="w-full text-left p-4 rounded-xl border-2 border-blue-200 bg-blue-50/50 hover:bg-blue-50 disabled:opacity-60 transition active:scale-[0.99]"
                >
                  <div className="font-bold text-blue-900 flex items-center gap-2">
                    Añadir a lo que ya tengo
                    <span className="text-[10px] font-black uppercase bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">
                      Recomendado
                    </span>
                  </div>
                  <p className="text-xs text-blue-900/70 mt-1">
                    Añade sólo las partidas que te falten (tienes {services.length}). No borra nada.
                  </p>
                </button>

                <button
                  onClick={() => setSeedStep('confirm-replace')}
                  disabled={busy}
                  className="w-full text-left p-4 rounded-xl border-2 border-zinc-200 hover:border-red-200 hover:bg-red-50/40 disabled:opacity-60 transition active:scale-[0.99]"
                >
                  <div className="font-bold text-zinc-900">Reemplazar todo mi catálogo</div>
                  <p className="text-xs text-zinc-500 mt-1">
                    Borra tus {services.length} partidas actuales y deja sólo las 42 del catálogo por defecto.
                  </p>
                </button>
              </div>
            ) : (
              <div className="mt-5">
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-900">
                  <p className="font-bold flex items-center gap-2">
                    <AlertCircle size={16} /> ¿Seguro que quieres reemplazar?
                  </p>
                  <p className="mt-1 leading-snug">
                    Se eliminarán <strong>{services.length} partidas</strong> de tu catálogo —incluidas las que hayas
                    importado de Excel— y se sustituirán por las 42 del catálogo por defecto.{' '}
                    <strong>No se puede deshacer.</strong>
                  </p>
                </div>
                <div className="flex gap-2 mt-4">
                  <button
                    onClick={() => runSeed('replace')}
                    disabled={busy}
                    className="flex-1 bg-red-600 hover:bg-red-700 disabled:bg-zinc-300 text-white px-4 py-2.5 rounded-xl font-bold text-sm transition active:scale-95"
                  >
                    Sí, reemplazar
                  </button>
                  <button
                    onClick={() => setSeedStep('choose')}
                    disabled={busy}
                    className="flex-1 bg-zinc-100 hover:bg-zinc-200 text-zinc-900 px-4 py-2.5 rounded-xl font-bold text-sm transition active:scale-95"
                  >
                    Volver
                  </button>
                </div>
              </div>
            )}

            <button
              onClick={() => setSeedStep(null)}
              disabled={busy}
              className="w-full mt-4 text-zinc-400 hover:text-zinc-600 font-medium text-sm transition"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {showAdd && (
        <div className="mb-6 bg-white p-5 rounded-2xl border border-zinc-100 shadow-[0_4px_24px_rgba(0,0,0,0.02)] grid grid-cols-1 md:grid-cols-[1.3fr_1.3fr_0.6fr_0.7fr_auto] gap-3 items-end">
          <div>
            <label className="block text-xs font-bold text-zinc-500 mb-1">Fase</label>
            <select
              value={newService.phaseId}
              onChange={(e) => setNewService({ ...newService, phaseId: e.target.value })}
              className="w-full px-3 py-2.5 rounded-lg border border-zinc-200 bg-zinc-50 font-medium text-sm"
            >
              {phases.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold text-zinc-500 mb-1">Servicio</label>
            <input
              value={newService.name}
              onChange={(e) => setNewService({ ...newService, name: e.target.value })}
              placeholder="Ej. Cambio de bañera por plato de ducha"
              className="w-full px-3 py-2.5 rounded-lg border border-zinc-200 bg-zinc-50 font-medium text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-zinc-500 mb-1">Unidad</label>
            <select
              value={newService.unit}
              onChange={(e) => setNewService({ ...newService, unit: e.target.value })}
              className="w-full px-3 py-2.5 rounded-lg border border-zinc-200 bg-zinc-50 font-medium text-sm"
            >
              {UNITS.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold text-zinc-500 mb-1">Precio €</label>
            <input
              value={newService.price}
              onChange={(e) => setNewService({ ...newService, price: e.target.value })}
              inputMode="decimal"
              placeholder="0,00"
              className="w-full px-3 py-2.5 rounded-lg border border-zinc-200 bg-zinc-50 font-medium text-sm tabular-nums"
            />
          </div>
          <button
            onClick={handleAddService}
            disabled={busy}
            className="h-[42px] bg-blue-600 hover:bg-blue-700 disabled:bg-zinc-300 text-white px-5 rounded-lg font-bold text-sm transition active:scale-95"
          >
            Añadir
          </button>
        </div>
      )}

      <div className="bg-white p-6 rounded-2xl shadow-[0_4px_24px_rgba(0,0,0,0.02)] border border-zinc-100 mb-8">
        <h3 className="font-bold text-zinc-800 mb-3 text-sm uppercase tracking-wider">Importar desde Excel</h3>
        <div className="space-y-3">
          <label className="border-2 border-dashed border-blue-200 bg-blue-50/50 hover:bg-blue-50 rounded-xl p-6 flex flex-col items-center justify-center cursor-pointer transition w-full">
            <UploadCloud size={24} className="text-blue-600 mb-2" />
            <span className="font-bold text-blue-900 text-sm">
              {file ? file.name : 'Haz clic o arrastra tu archivo .xlsx'}
            </span>
            <input
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
            />
          </label>
          <div className="flex flex-wrap items-center gap-4 text-sm">
            <label className="flex items-center gap-2 font-medium text-zinc-700">
              <input type="radio" checked={importMode === 'replace'} onChange={() => setImportMode('replace')} />
              Reemplazar todo mi catálogo
            </label>
            <label className="flex items-center gap-2 font-medium text-zinc-700">
              <input type="radio" checked={importMode === 'merge'} onChange={() => setImportMode('merge')} />
              Añadir a lo que ya tengo
            </label>
          </div>
          <button
            onClick={handleUpload}
            disabled={!file || busy}
            className="w-full bg-zinc-900 disabled:bg-zinc-300 hover:bg-black text-white px-6 py-3 rounded-xl font-bold transition active:scale-[0.99]"
          >
            {busy ? 'Procesando…' : 'Importar Excel'}
          </button>
          <p className="text-[11px] text-zinc-400 leading-snug">
            Formato: filas con la palabra «Fase» como secciones. En el resto, Col A = unidad, Col B = nombre del
            servicio, Col G = precio.
          </p>
        </div>
      </div>

      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-lg font-black text-zinc-400 uppercase tracking-wider">Partidas</h2>
        <button
          onClick={fetchCatalog}
          className="p-2 text-zinc-400 hover:text-zinc-900 transition hover:bg-zinc-100 rounded-full"
          title="Actualizar catálogo"
        >
          <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {loading ? (
        <div className="p-8 text-center text-zinc-500 font-medium animate-pulse">Cargando catálogo…</div>
      ) : services.length === 0 ? (
        <div className="bg-white rounded-2xl border border-zinc-100 p-12 text-center">
          <p className="text-zinc-500 font-medium">Tu catálogo está vacío.</p>
          <p className="text-zinc-400 text-sm mt-1">
            Pulsa «Cargar catálogo por defecto» o sube tu propio Excel.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(grouped).map(([phaseName, list]) => (
            <div
              key={phaseName}
              className="bg-white rounded-2xl border border-zinc-100 overflow-hidden shadow-[0_4px_24px_rgba(0,0,0,0.02)]"
            >
              <div className="bg-zinc-50 px-5 py-3 border-b border-zinc-100 flex items-center justify-between">
                <h3 className="font-bold text-zinc-800 uppercase tracking-wider text-xs">{phaseName}</h3>
                <span className="text-[11px] font-bold text-zinc-400">{list.length} partidas</span>
              </div>
              <div className="divide-y divide-zinc-50">
                {list.map((service) => (
                  <div key={service.id} className="px-5 py-3 hover:bg-zinc-50/60 transition">
                    <div className="flex items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          {service.code && (
                            <span className="text-[10px] font-black text-zinc-400 bg-zinc-100 px-1.5 py-0.5 rounded">
                              {service.code}
                            </span>
                          )}
                          <input
                            defaultValue={service.name}
                            onBlur={(e) =>
                              e.target.value !== service.name && handleUpdate(service.id, { name: e.target.value })
                            }
                            className="flex-1 min-w-0 font-medium text-zinc-900 text-sm bg-transparent border border-transparent hover:border-zinc-200 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 rounded px-1.5 py-1 transition"
                          />
                          <input
                            defaultValue={service.unit}
                            onBlur={(e) =>
                              e.target.value !== service.unit && handleUpdate(service.id, { unit: e.target.value })
                            }
                            className="w-16 text-xs font-bold text-zinc-500 uppercase bg-transparent border border-transparent hover:border-zinc-200 focus:border-blue-400 rounded px-1.5 py-1 text-center transition"
                          />
                          <input
                            defaultValue={service.base_price}
                            inputMode="decimal"
                            onBlur={(e) => {
                              const value = Number(e.target.value.replace(',', '.'))
                              if (!Number.isNaN(value) && value !== service.base_price) {
                                handleUpdate(service.id, { base_price: value })
                              }
                            }}
                            className="w-24 text-right font-bold text-zinc-900 tabular-nums text-sm bg-transparent border border-transparent hover:border-zinc-200 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 rounded px-1.5 py-1 transition"
                          />
                          <button
                            onClick={() => handleDelete(service)}
                            className="p-1.5 text-zinc-300 hover:text-red-600 hover:bg-red-50 rounded transition"
                            title="Eliminar del catálogo"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                        {service.description && (
                          <p className="text-[11px] text-zinc-400 mt-1 pl-1.5 leading-snug">{service.description}</p>
                        )}
                      </div>
                      {service.price_min != null && service.price_max != null && (
                        <div className="hidden md:block text-right shrink-0 pt-1">
                          <div className="text-[10px] font-bold uppercase text-zinc-400">Mercado</div>
                          <div className="text-[11px] font-bold text-zinc-500 tabular-nums">
                            {eur(service.price_min)} – {eur(service.price_max)}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <p className="text-[11px] text-zinc-400 mt-8 leading-relaxed">
        Los precios del catálogo por defecto son orientativos (banda de mercado España 2026). Revísalos y ajústalos a
        tus tarifas: el precio guardado aquí es el que se usará en tus próximos presupuestos. También puedes cambiar el
        precio de una línea concreta dentro de un presupuesto sin afectar al catálogo.
      </p>
    </div>
  )
}
