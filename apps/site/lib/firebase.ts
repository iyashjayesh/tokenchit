/**
 * Firebase configuration for the web app.
 *
 * These values are not secrets. Firebase web config is shipped to every browser that loads
 * the page — Google documents the API key as a project identifier, not a credential, and
 * access is controlled by Firebase security rules rather than by hiding this object. It is
 * checked in so the site builds anywhere without setup.
 *
 * The CLI has none of this and never will: it makes exactly one network call, to publish,
 * and adding analytics to a tool that reads your logs would undo the reason to trust it.
 */
export const FIREBASE_CONFIG = {
  apiKey: "AIzaSyBCGGsoPVfwAim5MftqFS8m9uG2FJl5LYQ",
  authDomain: "tokenchit.firebaseapp.com",
  projectId: "tokenchit",
  storageBucket: "tokenchit.firebasestorage.app",
  messagingSenderId: "16198850579",
  appId: "1:16198850579:web:7ceeae72d089c04c2487e6",
  measurementId: "G-1L6BL7KRR3",
} as const;
