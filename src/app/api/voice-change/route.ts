import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { AI_RATE_LIMIT_MESSAGE, VOICE_AI_ENDPOINT, aiRateLimitReached, askOpenAiJson, recordAiCall } from '@/lib/ai';
import { parseVoiceProposal, voiceChangePrompt, VoiceOutlineSection, VoiceCatalogEntry } from '@/lib/voice-change';

/** Topes del contexto que llega del editor, para que un envío inflado no se cuele. */
const MAX_OUTLINE_SECTIONS = 60;
const MAX_OUTLINE_LINES = 100;
const MAX_CATALOG_ENTRIES = 500;
const MAX_TEXT = 200;

function cleanText(value: unknown): string {
  return typeof value === 'string' ? value.trim().slice(0, MAX_TEXT) : '';
}

/** El presupuesto que manda el editor: cada sección con las descripciones de sus líneas. */
function parseOutline(raw: unknown): VoiceOutlineSection[] {
  if (!Array.isArray(raw)) return [];
  const out: VoiceOutlineSection[] = [];
  for (const item of raw.slice(0, MAX_OUTLINE_SECTIONS)) {
    if (!item || typeof item !== 'object') continue;
    const record = item as Record<string, unknown>;
    const section = cleanText(record.section);
    if (!section) continue;
    const linesRaw = record.lines;
    const lines = Array.isArray(linesRaw)
      ? linesRaw.slice(0, MAX_OUTLINE_LINES).map(cleanText).filter(Boolean)
      : [];
    out.push({ section, lines });
  }
  return out;
}

/** El catálogo recortado de la empresa (nombre, unidad y sección). Nunca lleva precios. */
function parseCatalog(raw: unknown): VoiceCatalogEntry[] {
  if (!Array.isArray(raw)) return [];
  const out: VoiceCatalogEntry[] = [];
  for (const item of raw.slice(0, MAX_CATALOG_ENTRIES)) {
    if (!item || typeof item !== 'object') continue;
    const record = item as Record<string, unknown>;
    const name = cleanText(record.name);
    if (!name) continue;
    out.push({ name, unit: cleanText(record.unit) || 'ud', section: cleanText(record.section) || null });
  }
  return out;
}

/**
 * «Dictar un cambio → propuesta de líneas».
 *
 * The transcription happens in the browser (Web Speech API, audio never leaves
 * the device); only the resulting *text* reaches this endpoint, which asks the
 * same OpenAI call the rest of the app uses, billed on the same per-company
 * rate limit. Alongside the transcript the editor sends the budget's outline
 * (its sections, with their lines) and the company catalog, so the AI can attach
 * the change to the service it refers to (`anchor`) instead of appending it at
 * the end. The answer is sanitised in `parseVoiceProposal` before it is returned,
 * so a broken one cannot break the editor.
 */
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
  if (await aiRateLimitReached(supabase, companyId, VOICE_AI_ENDPOINT)) {
    return NextResponse.json({ error: AI_RATE_LIMIT_MESSAGE }, { status: 429 });
  }

  // ── 3. Record this call ────────────────────────────────────────
  await recordAiCall(supabase, companyId, VOICE_AI_ENDPOINT);

  // ── 4. OpenAI call ─────────────────────────────────────────────
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ error: 'OpenAI API key not configured' }, { status: 500 });
  }

  const body = await req.json().catch(() => ({}));
  const transcript = typeof body.transcript === 'string' ? body.transcript.trim() : '';
  const outline = parseOutline(body.outline);
  const catalog = parseCatalog(body.catalog);

  if (!transcript) {
    return NextResponse.json({ error: 'No has dictado nada todavía.' }, { status: 400 });
  }

  try {
    const raw = await askOpenAiJson<Record<string, unknown>>(voiceChangePrompt(transcript, outline, catalog), 0.2);
    return NextResponse.json({ proposal: parseVoiceProposal(raw) });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'AI request failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
