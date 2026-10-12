import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { AI_RATE_LIMIT_MESSAGE, aiRateLimitReached, askOpenAiJson, recordAiCall } from '@/lib/ai';

const AI_ENDPOINT = 'translate-for-client';

export async function POST(req: NextRequest) {
  const supabase = createClient();

  // ── 1. Auth check ──────────────────────────────────────────────
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: userRecord } = await supabase
    .from('users')
    .select('company_id')
    .eq('id', user.id)
    .single();

  if (!userRecord?.company_id) {
    return NextResponse.json({ error: 'Company not found' }, { status: 403 });
  }

  const companyId = userRecord.company_id;

  // ── 2. Rate limit check ────────────────────────────────────────
  if (await aiRateLimitReached(supabase, companyId, AI_ENDPOINT)) {
    return NextResponse.json({ error: AI_RATE_LIMIT_MESSAGE }, { status: 429 });
  }

  // ── 3. Record this call ────────────────────────────────────────
  await recordAiCall(supabase, companyId, AI_ENDPOINT);

  // ── 4. OpenAI call ─────────────────────────────────────────────
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ error: 'OpenAI API key not configured' }, { status: 500 });
  }

  const { rows } = await req.json();

  const serviceList = rows
    .filter((r: { type: string; service_name_snapshot: string }) => r.type === 'item' && r.service_name_snapshot)
    .map((r: { id: string; service_name_snapshot: string }, i: number) => `${i + 1}. [id:${r.id}] ${r.service_name_snapshot}`)
    .join('\n');

  if (!serviceList) {
    return NextResponse.json({ notes: {} });
  }

  const prompt = `Eres un experto en reformas del hogar. El siguiente listado contiene servicios técnicos de construcción escritos en jerga profesional.

Tu tarea: para cada servicio, escribe UNA sola frase muy corta (máximo 12 palabras) en español sencillo y directo que diga al propietario QUÉ trabajo se hace. Nada más: sin explicar beneficios, sin justificar el precio y sin repetir el nombre de la partida. Una nota de dos frases por línea hace el presupuesto interminable y confunde al cliente que lo lee entero.

Devuelve ÚNICAMENTE un JSON con el formato: { "id_del_servicio": "frase corta para el cliente", ... }

Servicios:
${serviceList}`;

  try {
    const notes = await askOpenAiJson<Record<string, string>>(prompt, 0.5);
    return NextResponse.json({ notes });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'AI request failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
