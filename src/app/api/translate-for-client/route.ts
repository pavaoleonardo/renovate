import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  const { rows } = await req.json();

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'OpenAI API key not configured' }, { status: 500 });
  }

  // Build a prompt with all technical service names
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

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      temperature: 0.5,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    return NextResponse.json({ error: err }, { status: 500 });
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content || '{}';
  
  try {
    const notes = JSON.parse(content);
    return NextResponse.json({ notes });
  } catch {
    return NextResponse.json({ error: 'Failed to parse AI response' }, { status: 500 });
  }
}
