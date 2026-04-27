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

### Google sign-in callback clarification (important)

- For Firebase Web Auth, the OAuth callback is handled by Firebase at:
  - `https://<your-firebase-auth-domain>/__/auth/handler`
- You **do not** set the callback to your GitHub Pages URL.
- Your `VITE_FIREBASE_AUTH_DOMAIN` should be your Firebase auth domain (usually `your-project-id.firebaseapp.com`), not `github.io`.
- Your GitHub Pages host (for this project: `rileygramlich.github.io`) must be listed in **Firebase Authentication → Settings → Authorized domains**.

If Google sign-in fails on Pages, check these in order:
1. Google provider is enabled in Firebase Auth.
2. `rileygramlich.github.io` is in Authorized domains.
3. `VITE_FIREBASE_AUTH_DOMAIN` is set to `*.firebaseapp.com` for your project.
4. Deployed site URL is exactly `https://rileygramlich.github.io/ContractionCounter/`.

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
- `VITE_FIREBASE_MEASUREMENT_ID` (optional)

The Pages workflow injects these at build time.
