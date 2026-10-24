import LoadingOverlay from '@/components/LoadingOverlay'

/** The flat route for an obra with no client: same editor, same wait. */
export default function Loading() {
  return (
    <LoadingOverlay
      label="Abriendo el presupuesto…"
      hint="Cargando las partidas, el catálogo y los datos de la empresa."
    />
  )
}

