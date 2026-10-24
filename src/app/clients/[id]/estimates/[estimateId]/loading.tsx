import LoadingOverlay from '@/components/LoadingOverlay'

/** Six reads (obra, partidas, notes, clients, catalogue, company) behind one card. */
export default function Loading() {
  return (
    <LoadingOverlay
      label="Abriendo el presupuesto…"
      hint="Cargando las partidas, el catálogo y los datos de la empresa."
    />
  )
}

