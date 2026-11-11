const env = import.meta.env

export const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY as string | undefined,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined,
  projectId: env.VITE_FIREBASE_PROJECT_ID as string | undefined,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET as string | undefined,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID as string | undefined,
  appId: env.VITE_FIREBASE_APP_ID as string | undefined,
}

const firebaseVollstaendig = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.appId)

/** artifact: Betrieb als veröffentlichte Claude Seite (Datenbank und KI über die Seite, keine eigenen Schlüssel) */
export const PLATTFORM: 'web' | 'artifact' = env.VITE_PLATTFORM === 'artifact' ? 'artifact' : 'web'

/**
 * Demo Modus: läuft ohne Firebase und ohne KI Schlüssel.
 * Aktiv, wenn keine Firebase Konfiguration vorhanden ist oder VITE_DEMO_MODE=true gesetzt ist.
 */
/**
 * Echte KI ohne Firebase: Daten bleiben lokal, die Bilderkennung läuft über /api/analyze,
 * geschützt durch den Zugangscode (APP_ZUGANGSCODE auf dem Server).
 */
export const KI_ECHT = env.VITE_KI_ECHT === 'true'

export const DEMO_MODUS = env.VITE_DEMO_MODE === 'true' || !firebaseVollstaendig
