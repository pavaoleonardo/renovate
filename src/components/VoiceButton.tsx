"use client";

import { useEffect, useRef, useState } from 'react';
import { Mic, MicOff } from 'lucide-react';
import { collectFinalTranscript, getSpeechRecognition, SPEECH_LANG, type SpeechRecognitionLike } from '@/lib/speech';

/**
 * El botón de dictado. Habla con la Web Speech API del navegador: el audio no
 * sale del dispositivo y no hace falta ninguna clave. Si el navegador no sabe
 * dictar, no se pinta nada — mejor no ofrecer un botón que no funciona.
 *
 * Va en su propio componente porque lo usan dos sitios: la captura de cambios y
 * el campo «Añadir nota» de «Cambios de esta obra».
 */
export default function VoiceButton({
  onTranscript,
  lang = SPEECH_LANG,
  className = '',
  title = 'Dictar',
}: {
  onTranscript: (chunk: string) => void;
  lang?: string;
  className?: string;
  title?: string;
}) {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const recRef = useRef<SpeechRecognitionLike | null>(null);
  // Keep the latest callback without re-arming the recogniser on every render.
  const onTranscriptRef = useRef(onTranscript);
  onTranscriptRef.current = onTranscript;

  useEffect(() => {
    setSupported(getSpeechRecognition() !== null);
    return () => {
      recRef.current?.abort();
      recRef.current = null;
    };
  }, []);

  if (!supported) return null;

  const stop = () => {
    recRef.current?.stop();
    recRef.current = null;
    setListening(false);
  };

  const start = () => {
    const Ctor = getSpeechRecognition();
    if (!Ctor) return;
    const rec = new Ctor();
    rec.lang = lang;
    rec.continuous = true;
    rec.interimResults = false;
    rec.onresult = (event) => {
      const chunk = collectFinalTranscript(event, event.resultIndex);
      if (chunk) onTranscriptRef.current(chunk);
    };
    rec.onerror = () => {
      recRef.current = null;
      setListening(false);
    };
    rec.onend = () => {
      recRef.current = null;
      setListening(false);
    };
    recRef.current = rec;
    try {
      rec.start();
      setListening(true);
    } catch {
      recRef.current = null;
      setListening(false);
    }
  };

  return (
    <button
      type="button"
      onClick={listening ? stop : start}
      aria-pressed={listening}
      title={listening ? 'Parar de dictar' : title}
      className={`relative shrink-0 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg font-bold text-sm transition active:scale-95 ${
        listening
          ? 'bg-red-500 hover:bg-red-600 text-white'
          : 'bg-white border border-zinc-200 text-zinc-600 hover:text-zinc-900 hover:border-zinc-300'
      } ${className}`}
    >
      {listening ? <MicOff size={16} /> : <Mic size={16} />}
      {listening && <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />}
    </button>
  );
}
