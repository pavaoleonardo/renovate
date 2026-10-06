import { describe, expect, it } from 'vitest'
import { appendTranscript, collectFinalTranscript, type SpeechRecognitionEventLike } from '@/lib/speech'

/**
 * The two decisions the dictation UI leans on: how a fragment joins the text
 * already in the field, and which results are final. Both are pure, so they can
 * be checked here with no browser and no microphone.
 */

/** A fake `result` event: each entry is [text, isFinal]. */
function event(results: Array<[string, boolean]>, resultIndex = 0): SpeechRecognitionEventLike {
  const list = {
    length: results.length,
  } as unknown as SpeechRecognitionEventLike['results']
  results.forEach(([transcript, isFinal], i) => {
    ;(list as Record<number, unknown>)[i] = { isFinal, length: 1, 0: { transcript } }
  })
  return { resultIndex, results: list }
}

describe('appendTranscript', () => {
  it('deja la cadena vacía si no hay nada que pegar', () => {
    expect(appendTranscript('', '')).toBe('')
    expect(appendTranscript('Hola', '')).toBe('Hola')
    expect(appendTranscript('Hola', '   ')).toBe('Hola')
  })

  it('une con un solo espacio, sin duplicarlo', () => {
    expect(appendTranscript('Añadir enchufes', 'en el salón')).toBe('Añadir enchufes en el salón')
    expect(appendTranscript('Añadir enchufes ', ' en el salón')).toBe('Añadir enchufes en el salón')
  })

  it('un campo vacío arranca sin espacio delante', () => {
    expect(appendTranscript('', '  en el salón')).toBe('en el salón')
  })
})

describe('collectFinalTranscript', () => {
  it('descarta lo provisional', () => {
    expect(collectFinalTranscript(event([['en el', false], ['salón', true]]), 0)).toBe('salón')
  })

  it('junta sólo los definitivos desde resultIndex', () => {
    const e = event([['Hola', true], ['añadir', true], ['tres', false]], 1)
    expect(collectFinalTranscript(e, e.resultIndex)).toBe('añadir')
  })

  it('sin resultados definitivos no devuelve nada', () => {
    expect(collectFinalTranscript(event([['a medias', false]]), 0)).toBe('')
  })
})
