import { useState, useRef, useEffect } from 'react'
import { speechToText } from '../api/services/voiceService'

export function useVoice(onTranscript) {
  const [isRecording, setIsRecording] = useState(false)
  const [error, setError] = useState(null)
  const recorderRef = useRef(null)
  const chunksRef = useRef([])

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(stream)
      chunksRef.current = []

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }

      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop())
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
        try {
          const { transcript } = await speechToText(blob)
          onTranscript?.(transcript)
        } catch {
          setError('Transcription failed')
        }
      }

      recorder.start()
      recorderRef.current = recorder
      setIsRecording(true)
      setError(null)
    } catch (err) {
      setError(err.message)
    }
  }

  const stopRecording = () => {
    recorderRef.current?.stop()
    setIsRecording(false)
  }

  useEffect(() => {
    return () => {
      if (recorderRef.current?.state === 'recording') {
        recorderRef.current.stop()
      }
    }
  }, [])

  return { isRecording, startRecording, stopRecording, error }
}
