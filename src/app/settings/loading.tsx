import LoadingOverlay from '@/components/LoadingOverlay'

/** Ajustes reads the company profile through /api/company on mount. */
export default function Loading() {
  return (
    <LoadingOverlay
      label="Cargando los datos de tu empresa…"
      hint="Nombre, CIF, contacto y logo: es lo que firma cada presupuesto."
    />
  )
}
