import apiClient from '../apiClient'
import { ENDPOINTS } from '../endpoints'

/**
 * Transcribe recorded audio to text.
 * @param {Blob} audioBlob
 * @returns {Promise<{ transcript: string }>}  TODO: confirm shape.
 */
export async function speechToText(audioBlob) {
  const form = new FormData()
  form.append('audio', audioBlob, 'recording.webm')
  const { data } = await apiClient.post(ENDPOINTS.voiceStt, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return data
}

/**
 * Synthesize speech for a bot response.
 * @param {{ text: string, language?: string }} p
 * @returns {Promise<Blob>} audio blob (arraybuffer). TODO: confirm content-type.
 */
export async function textToSpeech({ text, language = 'en' } = {}) {
  const { data } = await apiClient.post(
    ENDPOINTS.voiceTts,
    { text, language },
    { responseType: 'blob' },
  )
  return data
}
