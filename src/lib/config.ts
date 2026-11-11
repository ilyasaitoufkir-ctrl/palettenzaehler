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
 * Ohne Firebase Konfiguration laufen die Daten lokal auf dem Gerät.
 * Die Bilderkennung läuft immer echt über /api/analyze bzw. auf der Claude Seite.
 */
export const LOKAL_MODUS = !firebaseVollstaendig
