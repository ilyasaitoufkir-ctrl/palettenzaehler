import { DEMO_MODUS, PLATTFORM } from '../config'
import { createDemoRepo } from './demoRepo'
import type { DataRepo } from './repo'

let instanz: DataRepo | null = null

/** Liefert den Datenzugriff: Firebase, wenn konfiguriert, sonst Demo Modus. */
export async function ladeRepo(): Promise<DataRepo> {
  if (instanz) return instanz
  if (PLATTFORM === 'artifact') {
    const { createArtifactRepo } = await import('./artifactRepo')
    instanz = await createArtifactRepo()
  } else if (DEMO_MODUS) {
    instanz = createDemoRepo()
  } else {
    // Firebase nur laden, wenn es gebraucht wird
    const { createFirebaseRepo } = await import('./firebaseRepo')
    instanz = createFirebaseRepo()
  }
  return instanz
}

export type { DataRepo, AuthZustand } from './repo'
