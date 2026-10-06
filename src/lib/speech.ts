/**
 * Dictado por voz con la Web Speech API del propio navegador.
 *
 * No hay clave, ni servidor, ni coste: el navegador transcribe y **el audio no
 * sale del dispositivo**. Cuando el navegador no sabe dictar (Firefox hoy), la
 * interfaz simplemente no ofrece el botón.
 *
 * Las decisiones que sí se pueden comprobar sin navegador —pegar dos fragmentos
 * de texto, quedarse sólo con lo definitivo— viven aquí como funciones puras;
 * el componente sólo las llama.
 */

/** Idioma del dictado: obras y clientes en español. */
export const SPEECH_LANG = 'es-ES';

interface SpeechAlternative {
  transcript: string;
}

interface SpeechResult {
  isFinal: boolean;
  length: number;
  0: SpeechAlternative;
}

interface SpeechResultList {
  length: number;
  [index: number]: SpeechResult;
}

/** Lo mínimo del evento `result` que necesitamos. */
export interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: SpeechResultList;
}

/** Lo mínimo de un reconocedor que necesitamos. */
export interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: unknown) => void) | null;
  onend: (() => void) | null;
}

type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

/**
 * El constructor del navegador, o `null` si este navegador no sabe dictar.
 * Chrome expone `webkitSpeechRecognition`; el estándar usa `SpeechRecognition`.
 */
export function getSpeechRecognition(): SpeechRecognitionCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/**
 * Pega lo recién dictado a lo que ya había en el campo sin comerse el texto
 * previo ni dejar espacios dobles. Puro, para comprobarlo sin navegador.
 */
export function appendTranscript(base: string, spoken: string): string {
  const b = (base || '').replace(/\s+$/, '');
  const s = (spoken || '').replace(/^\s+/, '').replace(/\s+$/, '');
  if (!s) return b;
  if (!b) return s;
  return `${b} ${s}`;
}

/**
 * El texto **definitivo** de un evento `result` a partir de `resultIndex`: los
 * fragmentos provisionales se descartan, porque se reescriben mientras el
 * usuario habla y duplicarían palabras si se pegaran al campo.
 */
export function collectFinalTranscript(
  event: SpeechRecognitionEventLike,
  fromIndex: number,
): string {
  let out = '';
  for (let i = fromIndex; i < event.results.length; i++) {
    const result = event.results[i];
    if (!result || !result.isFinal) continue;
    out = appendTranscript(out, result[0]?.transcript ?? '');
  }
  return out;
}
