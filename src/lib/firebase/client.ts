import { initializeApp, type FirebaseApp } from 'firebase/app'
import { getAuth, type Auth } from 'firebase/auth'
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager, type Firestore } from 'firebase/firestore'
import { getStorage, type FirebaseStorage } from 'firebase/storage'
import { firebaseConfig } from '../config'

let app: FirebaseApp | null = null
let auth: Auth | null = null
let db: Firestore | null = null
let storage: FirebaseStorage | null = null

export function firebase() {
  if (!app) {
    app = initializeApp(firebaseConfig)
    auth = getAuth(app)
    // Offline Cache: Schreibvorgänge ohne Netz werden lokal gehalten und später übertragen
    db = initializeFirestore(app, {
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
    })
    storage = getStorage(app)
  }
  return { app: app!, auth: auth!, db: db!, storage: storage! }
}
