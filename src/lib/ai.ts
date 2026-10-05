import type { createClient } from '@/lib/supabase/server'

/**
 * Plumbing compartido de las llamadas de pago a la IA.
 *
 * Hoy hay dos funciones que llaman a OpenAI —la nota para el cliente
 * (`/api/translate-for-client`) y el emparejado de secciones al importar un
 * documento— y las dos tienen que cobrar en el mismo contador por empresa
 * (`ai_rate_limits`). Teniéndolo en un solo sitio, la clave, el modelo y el límite
 * no se separan con el tiempo.
 *
 * Sólo servidor: lee `OPENAI_API_KEY` y usa el cliente con cookies.
 */

/** El tipo del cliente de Supabase, sin volver a importar el paquete entero. */
type Db = ReturnType<typeof createClient>

/** Llamadas de pago permitidas por empresa, endpoint y ventana. */
export const AI_RATE_LIMIT = 10
export const AI_WINDOW_MINUTES = 60

/** Se enseña tal cual al usuario cuando la ventana está agotada. */
export const AI_RATE_LIMIT_MESSAGE = `Límite alcanzado: máximo ${AI_RATE_LIMIT} usos por hora. Inténtalo más tarde.`

/** El modelo que usan todas las funciones de IA. */
const AI_MODEL = 'gpt-4o-mini'

/** ¿La empresa ya gastó su ventana en este endpoint? */
export async function aiRateLimitReached(supabase: Db, companyId: string, endpoint: string) {
  const windowStart = new Date(Date.now() - AI_WINDOW_MINUTES * 60 * 1000).toISOString()
  const { count } = await supabase
    .from('ai_rate_limits')
    .select('*', { count: 'exact', head: true })
    .eq('company_id', companyId)
    .eq('endpoint', endpoint)
    .gte('called_at', windowStart)

  return (count ?? 0) >= AI_RATE_LIMIT
}

/**
 * Anota la llamada ANTES de hacerla, para que una llamada fallida también cuente: el
 * límite existe para acotar lo que se gasta, no lo que sale bien.
 */
export async function recordAiCall(supabase: Db, companyId: string, endpoint: string) {
  await supabase.from('ai_rate_limits').insert({ company_id: companyId, endpoint })
}

/**
 * Pide a OpenAI un objeto JSON y lo devuelve ya parseado.
 *
 * Lanza un error cuyo mensaje se puede enseñar tal cual: falta la clave, el texto de
 * error de OpenAI o «Failed to parse AI response». Cada llamante decide si eso aborta
 * su función (la nota del presupuesto sí) o si sólo deja sin asistencia al usuario
 * (una importación nunca debe caerse porque la IA falle).
 */
export async function askOpenAiJson<T>(prompt: string, temperature = 0.5): Promise<T> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) throw new Error('OpenAI API key not configured')

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: AI_MODEL,
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      temperature,
    }),
  })

  if (!response.ok) throw new Error(await response.text())

  const data = await response.json()
  const content = data.choices?.[0]?.message?.content || '{}'

  try {
    return JSON.parse(content) as T
  } catch {
    throw new Error('Failed to parse AI response')
  }
}
