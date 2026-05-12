'use client'

import { useState, useEffect } from 'react'
import { processExcelUpload, searchCatalog } from './actions'
import { UploadCloud, CheckCircle2, AlertCircle, RefreshCw, Box } from 'lucide-react'
import { CatalogService } from '@/types'


export default function CatalogUpload() {
  const [file, setFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{ success: boolean; message?: string; error?: string } | null>(null)
  const [services, setServices] = useState<CatalogService[]>([])
  const [loadingCatalog, setLoadingCatalog] = useState(true)

  const fetchCatalog = async () => {
    setLoadingCatalog(true)
    const data = await searchCatalog()
    setServices(data || [])
    setLoadingCatalog(false)
  }

  useEffect(() => {
    fetchCatalog()
  }, [])

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!file) return
    
    setLoading(true)
    setResult(null)
    
    const formData = new FormData()
    formData.append('file', file)
    
    const res = await processExcelUpload(formData)
    setResult(res)
    setLoading(false)
    if (res.success) {
      setFile(null)
      fetchCatalog() // Refresh the list after successful upload
    }
  }

  // Group services by phase
  const groupedServices = services.reduce((acc, service) => {
    const phaseName = service.phase_name || 'Sin categoría'
    if (!acc[phaseName]) acc[phaseName] = []
    acc[phaseName].push(service)
    return acc
  }, {} as Record<string, CatalogService[]>)

  return (
    <div className="max-w-2xl mx-auto py-12 px-4">
      <div className="mb-8">
        <h1 className="text-3xl font-extrabold text-zinc-900 tracking-tight">Importar Catálogo</h1>
        <p className="text-zinc-500 mt-2 font-medium">
          Sube un archivo Excel (.xlsx) que contenga las fases y servicios de tu empresa.
        </p>
      </div>

      <div className="bg-white p-8 rounded-2xl shadow-[0_4px_24px_rgba(0,0,0,0.02)] border border-zinc-100">
        <form onSubmit={handleUpload}>
          <label className="border-2 border-dashed border-blue-200 bg-blue-50/50 hover:bg-blue-50 rounded-xl p-10 flex flex-col items-center justify-center cursor-pointer transition w-full group">
            <div className="bg-white p-4 rounded-full shadow-sm mb-4 text-blue-600 group-hover:scale-110 transition-transform">
              <UploadCloud size={32} />
            </div>
            <span className="font-bold text-blue-900 text-lg">Haz clic para buscar o arrastra el archivo</span>
            <span className="text-sm font-medium text-blue-600/70 mt-1">Formato .xlsx esperado</span>
            
            <input 
              type="file" 
              accept=".xlsx,.xls"
              className="hidden" 
              onChange={(e) => setFile(e.target.files?.[0] || null)}
            />
          </label>

          {file && (
            <div className="mt-6 bg-zinc-50 border border-zinc-200 rounded-lg p-4 flex justify-between items-center">
              <span className="font-medium text-zinc-800 break-all">{file.name}</span>
              <span className="text-xs font-bold text-zinc-400">{(file.size / 1024).toFixed(1)} KB</span>
            </div>
          )}

          {result && (
            <div className={`mt-6 p-4 rounded-lg flex items-start gap-3 border font-medium ${result.success ? 'bg-green-50 text-green-800 border-green-200' : 'bg-red-50 text-red-800 border-red-200'}`}>
              {result.success ? <CheckCircle2 className="shrink-0 mt-0.5" size={20} /> : <AlertCircle className="shrink-0 mt-0.5" size={20} />}
              <span>{result.success ? result.message : result.error}</span>
            </div>
          )}

          <button 
            type="submit" 
            disabled={!file || loading}
            className="w-full mt-8 bg-zinc-900 disabled:bg-zinc-300 disabled:cursor-not-allowed hover:bg-black text-white px-6 py-4 rounded-xl font-bold transition shadow-sm text-lg active:scale-[0.98]"
          >
            {loading ? 'Procesando...' : 'Importar Datos'}
          </button>
        </form>

        <div className="mt-8 border-t border-zinc-100 pt-8">
          <h3 className="font-bold text-zinc-800 mb-4 text-sm uppercase tracking-wider">Formato de Excel Esperado</h3>
          <div className="bg-zinc-50 p-4 rounded-lg font-mono text-xs text-zinc-600 overflow-x-auto border border-zinc-200 whitespace-pre">
{`         | Fase 1: Demoliciones         |      |  |  |  | Precio
Ud.      | PROTECCION DE ZONAS COMUNES  |      |  |  |  | 1
M2.      | DEMOLICION TABIQUE LADRILLO  |      |  |  |  | 86.4
         | Fase 2: Albañilería          |      |  |  |  |
M2.      | SOLERA HASTA 5CM             |      |  |  |  | 18.82`}
          </div>
          <p className="text-xs text-zinc-500 font-medium mt-3">
            El sistema detecta filas con la palabra &quot;Fase&quot; como secciones. Las demás filas se leen como: Col A = Unidad, Col B = Nombre del Servicio, Col G = Precio.
          </p>
        </div>
      </div>

      <div className="mt-12 mb-8 flex items-center justify-between">
        <h2 className="text-2xl font-extrabold text-zinc-900 tracking-tight flex items-center gap-2">
          <Box size={24} className="text-blue-600" /> Mi Catálogo Actual
        </h2>
        <button 
          onClick={fetchCatalog}
          className="p-2 text-zinc-400 hover:text-zinc-900 transition hover:bg-zinc-100 rounded-full"
          title="Actualizar catálogo"
        >
          <RefreshCw size={20} className={loadingCatalog ? "animate-spin" : ""} />
        </button>
      </div>

      <div className="bg-white rounded-2xl shadow-[0_4px_24px_rgba(0,0,0,0.02)] border border-zinc-100 overflow-hidden">
        {loadingCatalog ? (
          <div className="p-8 text-center text-zinc-500 font-medium animate-pulse">Cargando catálogo...</div>
        ) : services.length === 0 ? (
          <div className="p-12 text-center text-zinc-500 font-medium">No hay servicios en el catálogo. Sube un archivo Excel para empezar.</div>
        ) : (
          <div className="divide-y divide-zinc-100">
            {Object.entries(groupedServices).map(([phaseName, phaseServices]) => (
              <div key={phaseName}>
                <div className="bg-zinc-50 px-6 py-3 border-b border-zinc-100 sticky top-0">
                  <h3 className="font-bold text-zinc-800 uppercase tracking-wider text-xs">{phaseName}</h3>
                </div>
                <div className="divide-y divide-zinc-50">
                  {phaseServices.map(service => (
                    <div key={service.id} className="px-6 py-3 flex items-center justify-between hover:bg-zinc-50 transition group">
                      <div>
                        <div className="font-medium text-zinc-900 text-sm">{service.name}</div>
                        <div className="text-xs font-bold text-zinc-400 uppercase mt-0.5">{service.unit}</div>
                      </div>
                      <div className="font-bold text-zinc-900 tabular-nums">
                        {service.base_price.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
