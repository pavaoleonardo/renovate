import LoadingOverlay from '@/components/LoadingOverlay'

/** One client and their obras, with the pending-change badge of each. */
export default function Loading() {
  return (
    <LoadingOverlay
      label="Abriendo la ficha del cliente…"
      hint="Reuniendo sus obras, sus importes y los cambios pendientes."
    />
  )
}
