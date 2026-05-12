import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

const RATE_LIMIT = 10;        // max calls per window
const WINDOW_MINUTES = 60;    // rolling window in minutes

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
  const endpoint = 'translate-for-client';
  const windowStart = new Date(Date.now() - WINDOW_MINUTES * 60 * 1000).toISOString();

  // ── 2. Rate limit check ────────────────────────────────────────
  const { count } = await supabase
    .from('ai_rate_limits')
    .select('*', { count: 'exact', head: true })
    .eq('company_id', companyId)
    .eq('endpoint', endpoint)
    .gte('called_at', windowStart);

  if ((count ?? 0) >= RATE_LIMIT) {
    return NextResponse.json(
      { error: `Límite alcanzado: máximo ${RATE_LIMIT} usos por hora. Inténtalo más tarde.` },
      { status: 429 }
    );
  }

  // ── 3. Record this call ────────────────────────────────────────
  await supabase.from('ai_rate_limits').insert({ company_id: companyId, endpoint });

  // ── 4. Gemini API call ─────────────────────────────────────────
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'Gemini API key not configured' }, { status: 500 });
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

Tu tarea: para cada servicio, escribe una descripción corta (máximo 2 frases) en español claro y sencillo que un propietario sin conocimientos técnicos pueda entender fácilmente. Describe QUÉ se hace y POR QUÉ beneficia al cliente.

Devuelve ÚNICAMENTE un JSON con el formato: { "id_del_servicio": "descripción para el cliente", ... }

Servicios:
${serviceList}`;

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          temperature: 0.5,
        },
      }),
    }
  );

  if (!response.ok) {
    const err = await response.text();
    return NextResponse.json({ error: err }, { status: 500 });
  }

  const data = await response.json();
  const content = data.candidates?.[0]?.content?.parts?.[0]?.text || '{}';

  try {
    const notes = JSON.parse(content);
    return NextResponse.json({ notes });
  } catch {
    return NextResponse.json({ error: 'Failed to parse AI response' }, { status: 500 });
  }
}
