# Firebase Setup (GitHub Pages)

## 1) Create Firebase project

1. Open Firebase Console and create/select your project.
2. Add a **Web App**.
3. Copy the Firebase config values.

## 2) Enable authentication

1. Firebase Console → Authentication → Sign-in method.
2. Enable **Google** provider.
3. Add authorized domains:
   - `localhost`
   - `<your-github-username>.github.io`

## 3) Enable Firestore

1. Firebase Console → Firestore Database → Create database.
2. Start in production mode.
3. Use these security rules:

```txt
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId}/contractions/{docId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

## 4) Local development config

1. Copy `.env.example` to `.env`.
2. Paste your Firebase config values.
3. Run `npm run dev`.

## 5) GitHub Pages secrets

In GitHub repo settings, add Actions secrets:

- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_STORAGE_BUCKET`
- `VITE_FIREBASE_MESSAGING_SENDER_ID`
- `VITE_FIREBASE_APP_ID`

The Pages workflow injects these at build time.
