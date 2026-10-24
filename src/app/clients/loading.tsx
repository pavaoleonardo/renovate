import LoadingOverlay from '@/components/LoadingOverlay'

/** The client list reads clients, obras and the company: three round trips before a row shows. */
export default function Loading() {
  return (
    <LoadingOverlay
      label="Preparando tus clientes…"
      hint="Leyendo las fichas, sus obras y el importe de cada presupuesto."
    />
  )
}
