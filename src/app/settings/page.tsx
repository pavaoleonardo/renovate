'use client'

import { useState, useEffect } from 'react'
import { CompanyProfile } from '@/types'
import { Save, Building2, CheckCircle2 } from 'lucide-react'

export default function SettingsPage() {
  const [profile, setProfile] = useState<Partial<CompanyProfile>>({
    name: '',
    contact_name: '',
    contact_email: '',
    contact_phone: '',
    address: '',
    cif: '',
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

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
        
        <div>
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
