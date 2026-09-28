'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  addCatalogService,
  createCatalogPhase,
  deleteCatalogService,
  listCatalogPhases,
  previewExcelUpload,
  processExcelUpload,
  updateCatalogService,
} from './actions'
import { ensureCatalog, searchCatalog, seedDefaultCatalog } from '@/app/actions'
import { DOCUMENT_ACCEPT, DOCUMENT_FORMATS_TEXT } from '@/lib/document-formats'
import { AlertCircle, CheckCircle2, Box, Plus, RefreshCw, Sparkles, Trash2, UploadCloud } from 'lucide-react'
import { CatalogService, ExcelPreview } from '@/types'

const UNITS = ['m2', 'ml', 'm3', 'ud', 'kg', 'h', 'vg']

const eur = (value: number) =>
  value.toLocaleString('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 })

/**
 * One grid template shared by the column header and every row of the "Partidas"
 * list, so Descripción / Ud / Precio / actions line up — no matter whether the
 * partida comes from the default catalog or from an imported document. The
 * market column only exists while a section has prices bands to show.
 */
const PARTIDA_COLUMNS = 'grid items-center gap-2 md:gap-3'
const PARTIDA_COLUMNS_BASE = `${PARTIDA_COLUMNS} grid-cols-[1fr_48px_96px_28px] md:grid-cols-[1fr_64px_112px_32px]`
const PARTIDA_COLUMNS_MARKET = `${PARTIDA_COLUMNS} grid-cols-[1fr_48px_96px_28px] md:grid-cols-[1fr_64px_112px_32px_170px]`

export default function CatalogPage() {
  const [services, setServices] = useState<CatalogService[]>([])
  const [phases, setPhases] = useState<{ id: string; name: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [importMode, setImportMode] = useState<'replace' | 'merge'>('replace')
  const [result, setResult] = useState<{ success: boolean; text: string } | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  /** What the app understood from the selected document, before anything is saved. */
  const [preview, setPreview] = useState<ExcelPreview | null>(null)
  /** Price column picked by hand (0 = A) or null to keep the detected one. */
  const [priceCol, setPriceCol] = useState<number | null>(null)
  /** Import only the partidas, without prices, for a budget that carries none. */
  const [noPrices, setNoPrices] = useState(false)
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
          setResult({ success: true, text: `Catálogo por defecto cargado: ${seeded.services} partidas.` })
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
      const parts = [`${res.servicesCreated} partidas añadidas`, `${res.phasesCreated} secciones nuevas`]
      if (res.servicesSkipped > 0) parts.push(`${res.servicesSkipped} ya existían`)
      setResult({ success: true, text: `Catálogo por defecto añadido: ${parts.join(', ')}.` })
    } else {
      setResult({ success: true, text: 'Tu catálogo ya tenía todas las partidas del catálogo por defecto.' })
    }

    await fetchCatalog()
  }

  /**
   * Analyses a document with the overrides the user has chosen. Selecting a file
   * runs it straight away; changing the price column or asking for "no prices"
   * runs it again on the same file. The catalog is only touched when the user
   * confirms what the preview shows.
   */
  const analyse = useCallback(
    async (selected: File, options: { priceCol: number | null; noPrices: boolean }) => {
      setBusy(true)
      setResult(null)

      const formData = new FormData()
      formData.append('file', selected)
      if (options.priceCol !== null) formData.append('priceCol', String(options.priceCol))
      if (options.noPrices) formData.append('noPrices', '1')

      const res = await previewExcelUpload(formData)
      setBusy(false)

      if (res.success) {
        setPreview(res.preview ?? null)
      } else {
        setPreview(null)
        setResult({ success: false, text: res.error || 'No se pudo analizar el documento.' })
      }
    },
    []
  )

  const handleFileChange = async (selected: File | null) => {
    setFile(selected)
    setPreview(null)
    setPriceCol(null)
    setNoPrices(false)
    setResult(null)
    if (!selected) return

    await analyse(selected, { priceCol: null, noPrices: false })
  }

  /** Re-reads the file with another price column or without prices at all. */
  const applyOverrides = async (next: { priceCol?: number | null; noPrices?: boolean }) => {
    const nextPriceCol = next.priceCol !== undefined ? next.priceCol : priceCol
    const nextNoPrices = next.noPrices !== undefined ? next.noPrices : noPrices
    setPriceCol(nextPriceCol)
    setNoPrices(nextNoPrices)
    if (file) await analyse(file, { priceCol: nextPriceCol, noPrices: nextNoPrices })
  }

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!file) return
    setBusy(true)
    setResult(null)

    const formData = new FormData()
    formData.append('file', file)
    formData.append('mode', importMode)
    if (priceCol !== null) formData.append('priceCol', String(priceCol))
    if (noPrices) formData.append('noPrices', '1')

    const res = await processExcelUpload(formData)
    setBusy(false)
    if (res.success) {
      setFile(null)
      setPreview(null)
      setPriceCol(null)
      setNoPrices(false)
      setResult({ success: true, text: res.message || 'Documento importado.' })
      await fetchCatalog()
    } else {
      setResult({ success: false, text: res.error || 'No se pudo importar el documento.' })
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
      setResult({ success: false, text: 'Indica la sección y el nombre de la partida.' })
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
      setResult({ success: false, text: res.error || 'No se pudo añadir la partida.' })
    }
  }

  const handleCreatePhase = async () => {
    const name = window.prompt('Nombre de la nueva sección (ej. «Extras y varios»)')
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
    <div className="max-w-shell mx-auto py-12 px-4 sm:px-6 lg:px-8">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-extrabold text-zinc-900 tracking-tight flex items-center gap-3">
            <Box size={28} className="text-blue-600" /> Mi Catálogo
          </h1>
          <p className="text-zinc-500 mt-2 font-medium">
            {loading ? 'Cargando…' : `${services.length} partidas en ${Object.keys(grouped).length} secciones`}
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
            <Plus size={16} /> Añadir partida
          </button>
          <button
            onClick={handleCreatePhase}
            disabled={busy}
            className="flex items-center gap-2 bg-zinc-100 hover:bg-zinc-200 text-zinc-900 px-4 py-2.5 rounded-xl font-bold text-sm transition active:scale-95"
          >
            <Plus size={16} /> Sección
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
                  42 partidas en 9 secciones con precios orientativos y su banda de mercado. ¿Cómo quieres cargarlo?
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
                    importado de un documento— y se sustituirán por las 42 del catálogo por defecto.{' '}
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
            <label className="block text-xs font-bold text-zinc-500 mb-1">Sección</label>
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
            <label className="block text-xs font-bold text-zinc-500 mb-1">Partida</label>
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
        <h3 className="font-bold text-zinc-800 mb-3 text-sm uppercase tracking-wider">Importar documento</h3>
        <div className="space-y-3">
          <label className="border-2 border-dashed border-blue-200 bg-blue-50/50 hover:bg-blue-50 rounded-xl p-6 flex flex-col items-center justify-center cursor-pointer transition w-full">
            <UploadCloud size={24} className="text-blue-600 mb-2" />
            <span className="font-bold text-blue-900 text-sm">
              {file ? file.name : 'Haz clic o arrastra tu presupuesto'}
            </span>
            <span className="text-[11px] text-blue-900/60 mt-1 text-center">{DOCUMENT_FORMATS_TEXT}</span>
            <input
              type="file"
              accept={DOCUMENT_ACCEPT}
              className="hidden"
              onChange={(e) => handleFileChange(e.target.files?.[0] || null)}
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
          {preview && (
            <div className="rounded-xl border border-zinc-200 overflow-hidden">
              <div className="p-3 bg-zinc-50 border-b border-zinc-100 space-y-1">
                <p className="text-sm font-black text-zinc-900">
                  Precio en tu catálogo → columna{' '}
                  <span className="text-blue-700">{preview.priceColumn.letter}</span>
                  {preview.priceColumn.header
                    ? ` («${preview.priceColumn.header}»)`
                    : ' (la columna con más números, sin cabecera)'}
                </p>
                <p className="text-xs font-bold text-zinc-500">
                  {preview.headerRow ? `Cabecera en la fila ${preview.headerRow} · ` : ''}
                  {preview.totals.services} partidas en {preview.totals.phases} secciones ·{' '}
                  {preview.sectionColumn
                    ? `secciones por la columna ${preview.sectionColumn.letter}` +
                      (preview.sectionColumn.header ? ` («${preview.sectionColumn.header}»)` : '')
                    : 'secciones por los títulos del documento'}
                </p>
                <p className="text-[11px] text-zinc-400 font-medium">
                  {preview.documentKind}: {preview.fileName}
                  {preview.sheets.length > 0
                    ? ` · ${preview.sheets.length === 1 ? 'hoja' : 'hojas'} ${preview.sheets
                        .map((sheet) => `«${sheet.name}» (${sheet.services} partidas)`)
                        .join(', ')}`
                    : ''}
                </p>
              </div>

              <div className="p-3 bg-zinc-50 border-b border-zinc-100 grid grid-cols-1 md:grid-cols-[1fr_auto] gap-3 items-end">
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-wide text-zinc-400 mb-1">
                    Columna con el precio
                  </label>
                  <select
                    value={priceCol === null ? 'auto' : String(priceCol)}
                    onChange={(e) => {
                      const value = e.target.value
                      // Picking a column by hand means you want its numbers as prices.
                      if (value === 'auto') applyOverrides({ priceCol: null })
                      else applyOverrides({ priceCol: Number(value), noPrices: false })
                    }}
                    disabled={busy}
                    className="w-full px-2.5 py-2 rounded-lg border border-zinc-200 bg-white text-sm font-medium disabled:opacity-60"
                  >
                    <option value="auto">
                      Automática: columna {preview.priceColumn.letter}
                      {preview.priceColumn.header ? ` («${preview.priceColumn.header}»)` : ''}
                      {preview.priceColumn.detectedByHeader
                        ? ' — por la cabecera'
                        : preview.priceColumn.chosenByUser
                          ? ' — elegida por ti'
                          : ' — la de más números'}
                    </option>
                    {preview.columns.map((column) => (
                      <option key={column.index} value={column.index}>
                        {column.letter}
                        {column.header ? ` «${column.header}»` : ' (sin cabecera)'} —{' '}
                        {column.samples.length > 0 ? column.samples.join(' · ') : 'vacía'}
                      </option>
                    ))}
                  </select>
                </div>
                <label className="flex items-center gap-2 text-xs font-bold text-zinc-700 whitespace-nowrap pb-2.5">
                  <input
                    type="checkbox"
                    checked={noPrices}
                    onChange={(e) => applyOverrides({ noPrices: e.target.checked })}
                    disabled={busy}
                  />
                  Importar sin precio
                </label>
              </div>

              {preview.warnings.length > 0 && (
                <div className="p-3 bg-amber-50 border-b border-amber-100 space-y-1.5">
                  {preview.warnings.map((warning) => (
                    <p key={warning} className="text-xs text-amber-900 font-medium flex items-start gap-2">
                      <AlertCircle size={14} className="shrink-0 mt-0.5" />
                      <span>{warning}</span>
                    </p>
                  ))}
                </div>
              )}

              <div className="max-h-64 overflow-auto">
                <div className="px-3 py-1.5 grid grid-cols-[1fr_48px_92px] gap-2 text-[10px] font-black uppercase tracking-wide text-zinc-400 bg-white border-b border-zinc-100">
                  <span>Descripción</span>
                  <span className="text-center">Ud</span>
                  <span className="text-right whitespace-nowrap">Precio (€)</span>
                </div>
                {preview.phases.map((phase) => (
                  <div key={phase.name}>
                    <div className="px-3 py-1.5 bg-blue-50/50 text-[11px] font-black uppercase tracking-wide text-blue-900">
                      {phase.name}
                    </div>
                    {phase.services.slice(0, 4).map((service, index) => (
                      <div
                        key={`${service.name}-${index}`}
                        className="px-3 py-1.5 grid grid-cols-[1fr_48px_92px] gap-2 text-xs items-center border-t border-zinc-50"
                      >
                        <span className="text-zinc-700 font-medium truncate" title={service.name}>
                          {service.name}
                        </span>
                        <span className="text-zinc-400 uppercase text-center">{service.unit}</span>
                        <span
                          className={`text-right tabular-nums font-bold ${
                            service.hasPrice ? 'text-zinc-800' : 'text-red-500'
                          }`}
                        >
                          {service.hasPrice ? eur(service.base_price) : 'sin precio'}
                        </span>
                      </div>
                    ))}
                    {phase.services.length > 4 && (
                      <div className="px-3 py-1.5 text-[11px] text-zinc-400 font-medium border-t border-zinc-50">
                        … y {phase.services.length - 4} partidas más en esta sección
                      </div>
                    )}
                  </div>
                ))}
              </div>

              <p className="p-2.5 bg-zinc-50 border-t border-zinc-100 text-[11px] text-zinc-500 font-medium">
                Lo que ves arriba es <strong>exactamente lo que se guardará como precio</strong> de cada partida:
                {preview.ignorePrices ? (
                  <> sin precio, tal como has pedido</>
                ) : (
                  <>
                    {' '}
                    columna {preview.priceColumn.letter}
                    {preview.priceColumn.header ? `, «${preview.priceColumn.header}»` : ' (la de más números)'}
                  </>
                )}
                . La descripción sale de la columna {preview.nameColumn.letter}
                {preview.nameColumn.header ? ` («${preview.nameColumn.header}»)` : ''}
                {preview.unitColumn.letter
                  ? ` y la unidad de la ${preview.unitColumn.letter}${
                      preview.unitColumn.header ? ` («${preview.unitColumn.header}»)` : ''
                    }`
                  : ' y la unidad por defecto (ud)'}
                . Si un inodoro aparece a 1,00 €, ese 1,00 € es el precio que se guardará: probablemente el documento trae
                mediciones en lugar de tarifas, así que elige la columna correcta aquí arriba o marca «importar sin precio».
              </p>
            </div>
          )}

          <button
            onClick={handleUpload}
            disabled={!file || !preview || busy}
            className="w-full bg-zinc-900 disabled:bg-zinc-300 hover:bg-black text-white px-6 py-3 rounded-xl font-bold transition active:scale-[0.99]"
          >
            {busy ? 'Procesando…' : preview ? 'Confirmar importación' : 'Importar documento'}
          </button>
          <p className="text-[11px] text-zinc-400 leading-snug">
            Se leen <strong>todas las hojas</strong> del archivo, no sólo la primera. El precio se busca por la cabecera
            («Precio», «PVP», «Importe»…) y, si no la hay, en la columna con más números —nunca en una columna de
            cantidades o mediciones—; las secciones salen de una columna tipo «Fase / Capítulo / Sección / Grupo» o, si
            no existe, de los títulos del propio documento. Todo eso se puede cambiar en el resumen de arriba antes de
            confirmar. Formatos admitidos: {DOCUMENT_FORMATS_TEXT}.
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
            Pulsa «Cargar catálogo por defecto» o sube tu propio documento (Excel, PDF, Word, CSV…).
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(grouped).map(([phaseName, list]) => {
            // Only the default catalog carries a market band, so the column shows
            // up when the section has one: imported partidas never sit in an empty column.
            const withMarket = list.some((s) => s.price_min != null && s.price_max != null)
            const columns = withMarket ? PARTIDA_COLUMNS_MARKET : PARTIDA_COLUMNS_BASE

            return (
              <div
                key={phaseName}
                className="bg-white rounded-2xl border border-zinc-100 overflow-hidden shadow-[0_4px_24px_rgba(0,0,0,0.02)]"
              >
                <div className="bg-zinc-50 px-5 py-3 border-b border-zinc-100 flex items-center justify-between">
                  <h3 className="font-bold text-zinc-800 uppercase tracking-wider text-xs">{phaseName}</h3>
                  <span className="text-[11px] font-bold text-zinc-400">{list.length} partidas</span>
                </div>
                {/* Column header: same grid as the rows below, so every column lines up. */}
                <div
                  className={`px-5 py-2 border-b border-zinc-100 text-[10px] font-black uppercase tracking-wide text-zinc-400 ${columns}`}
                >
                  <span className="pl-1.5">Descripción</span>
                  <span className="text-center">Ud</span>
                  <span className="text-right whitespace-nowrap pr-3">Precio (€)</span>
                  <span />
                  {withMarket && <span className="hidden md:block text-right whitespace-nowrap">Mercado</span>}
                </div>
                <div className="divide-y divide-zinc-50">
                  {list.map((service) => (
                    <div
                      key={service.id}
                      className={`px-5 py-3 hover:bg-zinc-50/60 transition ${columns}`}
                    >
                      <div className="min-w-0">
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
                        </div>
                        {service.description && (
                          <p className="text-[11px] text-zinc-400 mt-1 pl-1.5 leading-snug">{service.description}</p>
                        )}
                      </div>
                      <input
                        defaultValue={service.unit}
                        onBlur={(e) =>
                          e.target.value !== service.unit && handleUpdate(service.id, { unit: e.target.value })
                        }
                        className="w-full text-xs font-bold text-zinc-500 uppercase bg-transparent border border-transparent hover:border-zinc-200 focus:border-blue-400 rounded px-1.5 py-1 text-center transition"
                      />
                      {/* Editable number plus its currency, so the price reads like a real amount. */}
                      <div className="flex items-center justify-end gap-1">
                        <input
                          defaultValue={service.base_price}
                          inputMode="decimal"
                          onBlur={(e) => {
                            const value = Number(e.target.value.replace(',', '.'))
                            if (!Number.isNaN(value) && value !== service.base_price) {
                              handleUpdate(service.id, { base_price: value })
                            }
                          }}
                          className="flex-1 min-w-0 text-right font-bold text-zinc-900 tabular-nums text-sm bg-transparent border border-transparent hover:border-zinc-200 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 rounded px-1.5 py-1 transition"
                        />
                        <span className="text-[11px] font-bold text-zinc-400">€</span>
                      </div>
                      <button
                        onClick={() => handleDelete(service)}
                        className="justify-self-center p-1.5 text-zinc-300 hover:text-red-600 hover:bg-red-50 rounded transition"
                        title="Eliminar del catálogo"
                      >
                        <Trash2 size={16} />
                      </button>
                      {withMarket && (
                        <div className="hidden md:block text-right text-[11px] font-bold text-zinc-500 tabular-nums">
                          {service.price_min != null && service.price_max != null
                            ? `${eur(service.price_min)} – ${eur(service.price_max)}`
                            : ''}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
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
