'use client'

import { useState, useEffect } from 'react'
import { CompanyProfile } from '@/types'
import { Save, Building2, CheckCircle2, Upload, ImageIcon, Trash2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

export default function SettingsPage() {
  const [profile, setProfile] = useState<Partial<CompanyProfile>>({
    name: '',
    contact_name: '',
    contact_email: '',
    contact_phone: '',
    address: '',
    cif: '',
    logo_url: '',
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [uploading, setUploading] = useState(false)

  const supabase = createClient()

  useEffect(() => {
    fetch('/api/company')
      .then(res => res.json())
      .then(data => {
        if (data) setProfile(data)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  const handleSave = async () => {
    setSaving(true)
    await fetch('/api/company', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(profile),
    })
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return
    const file = e.target.files[0]
    setUploading(true)

    const fileExt = file.name.split('.').pop()
    const fileName = `${Math.random().toString(36).substring(2, 15)}_${Date.now()}.${fileExt}`
    const filePath = `${fileName}`

    const { error: uploadError } = await supabase.storage
      .from('logos')
      .upload(filePath, file)

    if (uploadError) {
      console.error('Error uploading image: ', uploadError)
      alert('Error al subir el logo. Inténtalo de nuevo.')
      setUploading(false)
      return
    }

    const { data: { publicUrl } } = supabase.storage
      .from('logos')
      .getPublicUrl(filePath)

    setProfile({ ...profile, logo_url: publicUrl })
    setUploading(false)
  }

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto py-12 px-4">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-zinc-200 rounded w-48"></div>
          <div className="h-64 bg-zinc-100 rounded-xl"></div>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto py-12 px-4">
      <div className="mb-8">
        <h1 className="text-3xl font-extrabold text-zinc-900 tracking-tight flex items-center gap-3">
          <Building2 className="text-blue-600" size={28} />
          Ajustes de Empresa
        </h1>
        <p className="text-zinc-500 mt-2 font-medium">
          Esta información aparecerá en el pie de página de tus presupuestos.
        </p>
      </div>

      <div className="bg-white p-8 rounded-2xl shadow-[0_4px_24px_rgba(0,0,0,0.02)] border border-zinc-100 space-y-6">
        
        <div className="flex flex-col sm:flex-row gap-6 items-start">
          <div className="shrink-0 w-32 h-32 bg-zinc-50 border-2 border-dashed border-zinc-200 rounded-2xl flex items-center justify-center overflow-hidden relative group">
            {profile.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={profile.logo_url} alt="Logo de empresa" className="w-full h-full object-contain p-2" />
            ) : (
              <div className="flex flex-col items-center text-zinc-400">
                <ImageIcon size={32} className="mb-2" />
                <span className="text-xs font-medium">Sin logo</span>
              </div>
            )}
            
            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
              <label className="p-2 bg-white text-zinc-900 rounded-lg cursor-pointer hover:scale-105 transition shadow-sm" title="Subir imagen">
                <Upload size={18} />
                <input 
                  type="file" 
                  accept="image/*" 
                  className="hidden" 
                  onChange={handleLogoUpload}
                  disabled={uploading}
                />
              </label>
              {profile.logo_url && (
                <button 
                  onClick={() => setProfile({ ...profile, logo_url: null })}
                  className="p-2 bg-red-500 text-white rounded-lg hover:scale-105 transition shadow-sm"
                  title="Eliminar logo"
                >
                  <Trash2 size={18} />
                </button>
              )}
            </div>
            {uploading && (
              <div className="absolute inset-0 bg-white/80 flex items-center justify-center">
                <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
              </div>
            )}
          </div>
          <div className="flex-1 space-y-1.5 pt-2">
            <h3 className="font-bold text-zinc-900 text-lg">Logo de la Empresa</h3>
            <p className="text-sm text-zinc-500 font-medium">Recomendado: Imagen cuadrada o apaisada en PNG/JPG, con fondo transparente si es posible. Tamaño máximo 2MB.</p>
          </div>
        </div>

        <div className="pt-4">
          <label className="block text-sm font-bold text-zinc-700 mb-1.5">Nombre de la empresa</label>
          <input
            type="text"
            value={profile.name || ''}
            onChange={(e) => setProfile({ ...profile, name: e.target.value })}
            placeholder="Reformas Líder S.L."
            className="w-full px-4 py-3 rounded-xl border border-zinc-200 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 font-medium transition"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-bold text-zinc-700 mb-1.5">Persona de contacto</label>
            <input
              type="text"
              value={profile.contact_name || ''}
              onChange={(e) => setProfile({ ...profile, contact_name: e.target.value })}
              placeholder="Sergio"
              className="w-full px-4 py-3 rounded-xl border border-zinc-200 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 font-medium transition"
            />
          </div>
          <div>
            <label className="block text-sm font-bold text-zinc-700 mb-1.5">CIF / NIF</label>
            <input
              type="text"
              value={profile.cif || ''}
              onChange={(e) => setProfile({ ...profile, cif: e.target.value })}
              placeholder="B12345678"
              className="w-full px-4 py-3 rounded-xl border border-zinc-200 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 font-medium transition"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-bold text-zinc-700 mb-1.5">Email</label>
            <input
              type="email"
              value={profile.contact_email || ''}
              onChange={(e) => setProfile({ ...profile, contact_email: e.target.value })}
              placeholder="lider@reformas.com"
              className="w-full px-4 py-3 rounded-xl border border-zinc-200 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 font-medium transition"
            />
          </div>
          <div>
            <label className="block text-sm font-bold text-zinc-700 mb-1.5">Teléfono</label>
            <input
              type="tel"
              value={profile.contact_phone || ''}
              onChange={(e) => setProfile({ ...profile, contact_phone: e.target.value })}
              placeholder="+34 699 161 552"
              className="w-full px-4 py-3 rounded-xl border border-zinc-200 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 font-medium transition"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-bold text-zinc-700 mb-1.5">Dirección</label>
          <input
            type="text"
            value={profile.address || ''}
            onChange={(e) => setProfile({ ...profile, address: e.target.value })}
            placeholder="C/ Ejemplo 123, 28001 Madrid"
            className="w-full px-4 py-3 rounded-xl border border-zinc-200 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 font-medium transition"
          />
        </div>

        <div className="pt-4 border-t border-zinc-100">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 bg-zinc-900 hover:bg-black disabled:bg-zinc-300 text-white px-8 py-3 rounded-xl font-bold transition shadow-md text-sm active:scale-95"
          >
            {saved ? (
              <><CheckCircle2 size={18} /> Guardado</>
            ) : saving ? (
              'Guardando...'
            ) : (
              <><Save size={18} /> Guardar Cambios</>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
