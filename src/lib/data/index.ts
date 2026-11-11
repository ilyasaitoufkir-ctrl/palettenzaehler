import { LOKAL_MODUS, PLATTFORM } from '../config'
import { createLokalRepo } from './lokalRepo'
import type { DataRepo } from './repo'

let instanz: DataRepo | null = null

/** Liefert den Datenzugriff: Claude Seite, Firebase wenn konfiguriert, sonst lokal auf dem Gerät. */
export async function ladeRepo(): Promise<DataRepo> {
  if (instanz) return instanz
  if (PLATTFORM === 'artifact') {
    const { createArtifactRepo } = await import('./artifactRepo')
    instanz = await createArtifactRepo()
  } else if (LOKAL_MODUS) {
    instanz = createLokalRepo()
  } else {
    // Firebase nur laden, wenn es gebraucht wird
    const { createFirebaseRepo } = await import('./firebaseRepo')
    instanz = createFirebaseRepo()
  }
  return instanz
}

export type { DataRepo, AuthZustand } from './repo'
