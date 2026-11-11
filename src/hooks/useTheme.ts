import { useCallback, useEffect, useState } from 'react'

export type Thema = 'system' | 'light' | 'dark'
const KEY = 'pz-thema'

function anwenden(t: Thema) {
  const root = document.documentElement
  if (t === 'system') root.removeAttribute('data-theme')
  else root.setAttribute('data-theme', t)
}

export function themaInitialisieren() {
  try {
    anwenden((localStorage.getItem(KEY) as Thema) || 'system')
  } catch {
    /* egal */
  }
}

export function useTheme() {
  const [thema, setThema] = useState<Thema>(() => {
    try {
      return (localStorage.getItem(KEY) as Thema) || 'system'
    } catch {
      return 'system'
    }
  })
  useEffect(() => anwenden(thema), [thema])
  const weiter = useCallback(() => {
    setThema((t) => {
      const n: Thema = t === 'system' ? 'dark' : t === 'dark' ? 'light' : 'system'
      try {
        localStorage.setItem(KEY, n)
      } catch {
        /* egal */
      }
      return n
    })
  }, [])
  return { thema, weiter }
}
