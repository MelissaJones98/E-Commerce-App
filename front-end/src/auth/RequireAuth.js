// RequireAuth: a guard for pages that need you to be logged in (Account, Cart, Checkout, Orders).
// routes.js puts those pages inside it, so it decides whether to show them:
//   - still checking who's logged in → "Loading…" (don't guess, or a logged-in customer could be
//     bounced to the login page by mistake);
//   - nobody logged in → go to the login page, remembering which page they wanted;
//   - logged in → show the page.

// Navigate: a component that changes page as soon as it's drawn.
// Outlet: shows whichever child route matches the URL (here, the protected page).
// useLocation: the current address, e.g. { pathname: '/orders/7', search: '?tab=items' }.
import { Navigate, Outlet, useLocation } from 'react-router';
import { useAuth } from './AuthContext';

export default function RequireAuth() {
  const { customer, checking } = useAuth();
  const location = useLocation();

  if (checking) return <p>Loading…</p>;

  if (!customer) {
    // `replace` swaps the current history entry instead of adding one, so the Back button skips
    // the page they couldn't see. `state` travels with the navigation (not in the address bar):
    // the login page reads state.from to send them back here after logging in. Because it's not
    // in the URL, nobody can make a link that sends a customer to another website after login.
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return <Outlet />;
}
