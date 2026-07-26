import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Standardized async data hook giving every data-backed view a uniform
 * loading / error / empty contract. The live Catalyst endpoints may be down,
 * so consumers must handle all three states gracefully.
 *
 * @param {() => Promise<any>} asyncFn  fetcher; recreate via useCallback or list its deps.
 * @param {Array} deps                  re-run when these change.
 * @param {{ immediate?: boolean }} [opts]
 * @returns {{ data: any, loading: boolean, error: Error|null, reload: () => void }}
 */
export function useAsync(asyncFn, deps = [], { immediate = true } = {}) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(immediate)
  const [error, setError] = useState(null)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  const run = useCallback(() => {
    setLoading(true)
    setError(null)
    return Promise.resolve()
      .then(asyncFn)
      .then((result) => {
        if (mountedRef.current) setData(result)
        return result
      })
      .catch((err) => {
        if (mountedRef.current) setError(err)
      })
      .finally(() => {
        if (mountedRef.current) setLoading(false)
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  useEffect(() => {
    if (immediate) run()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run])

  return { data, loading, error, reload: run }
}
