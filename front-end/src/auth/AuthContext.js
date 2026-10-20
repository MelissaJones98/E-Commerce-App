// AuthContext: the app-wide record of who's logged in.
//
// Many parts of the app need to know who's logged in: the nav (which links to show), the
// protected pages (whether to let you in), and the login and register pages (to update it).
// Passing that through every component as a prop would be tedious, so React's "context" makes
// it available to any component inside <AuthProvider> through the useAuth() hook.

// createContext: makes a context. useContext: reads it. useState and useEffect: see LoginPage.js.
// useRef: a box (`ref.current`) that keeps a value between re-draws WITHOUT causing a re-draw
// when it changes. Used below to remember "the app already knows who's logged in".
import { createContext, useContext, useEffect, useRef, useState } from 'react';
// getMe(): asks the API who's logged in. logout() (renamed here to apiLogout, so it doesn't clash
// with the logout function below): asks the API to end the session.
import { getMe, logout as apiLogout } from '../api/auth';

// The context itself. `null` is its value when used outside an AuthProvider (useAuth checks).
const AuthContext = createContext(null);

// Wrap the app in this (routes.js does) so every page can use useAuth().
// `{ children }` is destructuring: `children` is whatever is drawn between
// <AuthProvider> and </AuthProvider>.
export function AuthProvider({ children }) {
  // customer: the logged-in customer, or null when nobody is. (storeCustomer is React's setter;
  // the rest of the app uses setCustomer below instead.)
  const [customer, storeCustomer] = useState(null);
  // checking: true until the app knows who's logged in. While it's true, the app shouldn't show
  // the logged-out nav or bounce anyone to the login page.
  const [checking, setChecking] = useState(true);
  // true once a page has said who's logged in (by logging in, registering or logging out).
  const knownRef = useRef(false);

  // Pages call this after logging in, registering or logging out. It also settles "who's logged
  // in?", so the app stops checking, and any slower answer from /auth/me is ignored (below).
  function setCustomer(newCustomer) {
    knownRef.current = true;
    storeCustomer(newCustomer);
    setChecking(false);
  }

  // Ask the API once, when the app first appears. The empty array `[]` means "run only once".
  useEffect(() => {
    getMe().then((found) => {
      // If the customer logged in (or out) while this request was on its way, its answer is out
      // of date: e.g. "nobody" from before they logged in. Using it would wrongly log them out.
      if (knownRef.current) return;
      storeCustomer(found);
      setChecking(false);
    });
  }, []);

  // Logs out on the server, then forgets the customer here, so every part of the app updates.
  // If the server couldn't log out, apiLogout() throws: the customer is kept (the app never
  // pretends to be logged out while the server still has the session) and the error goes on
  // to whoever called this, to show a message.
  async function logout() {
    await apiLogout();
    setCustomer(null);
  }

  // `value` is what useAuth() gives every component inside the provider.
  // `{ customer, checking, ... }` is shorthand for `{ customer: customer, checking: checking, ... }`.
  return (
    <AuthContext.Provider value={{ customer, checking, setCustomer, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

// The hook pages use: const { customer, checking, setCustomer, logout } = useAuth();
export function useAuth() {
  const value = useContext(AuthContext);
  // A clear message instead of a confusing crash if a component is drawn outside the provider.
  if (!value) throw new Error('useAuth() must be used inside <AuthProvider>');
  return value;
}
