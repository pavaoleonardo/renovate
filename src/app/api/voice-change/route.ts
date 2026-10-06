import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { AI_RATE_LIMIT_MESSAGE, VOICE_AI_ENDPOINT, aiRateLimitReached, askOpenAiJson, recordAiCall } from '@/lib/ai';
import { parseVoiceProposal, voiceChangePrompt } from '@/lib/voice-change';

/**
 * «Dictar un cambio → propuesta de líneas».
 *
 * The transcription happens in the browser (Web Speech API, audio never leaves
 * the device); only the resulting *text* reaches this endpoint, which asks the
 * same OpenAI call the rest of the app uses, billed on the same per-company
 * rate limit. The answer is sanitised in `parseVoiceProposal` before it is
 * returned, so a broken one cannot break the editor.
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
  const sections = Array.isArray(body.sections)
    ? body.sections.filter((s: unknown): s is string => typeof s === 'string' && s.trim().length > 0)
    : [];

  if (!transcript) {
    return NextResponse.json({ error: 'No has dictado nada todavía.' }, { status: 400 });
  }

  try {
    const raw = await askOpenAiJson<Record<string, unknown>>(voiceChangePrompt(transcript, sections), 0.2);
    return NextResponse.json({ proposal: parseVoiceProposal(raw) });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'AI request failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
