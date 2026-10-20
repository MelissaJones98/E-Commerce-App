// GuestOnly: a guard for pages that are only for logged-out visitors (Log in, Register).
// routes.js puts those pages inside it:
//   - logged out (or still checking) → show the page;
//   - logged in → go somewhere more useful instead.
// That second rule also does the redirect AFTER a successful login or registration: the page
// records the customer (setCustomer), this guard sees someone is now logged in, and sends them on.
// Having one place do the redirect means two redirects can never race each other.

// Navigate: a component that changes page as soon as it's drawn.
// Outlet: shows whichever child route matches the URL (here, the Log in or Register page).
// useLocation: the current address, plus any `state` passed when navigating here.
import { Navigate, Outlet, useLocation } from 'react-router';
// useAuth(): who's logged in (see AuthContext.js).
import { useAuth } from './AuthContext';

export default function GuestOnly() {
  // customer: the logged-in customer, or null when nobody is.
  const { customer } = useAuth();
  // location.state holds RequireAuth's note ({ from: the page they wanted }), if it sent them here.
  // Hooks like this must be called at the top, before any `if`, so they run on every draw.
  const location = useLocation();

  if (customer) {
    // Where to send a logged-in customer.
    // if RequireAuth sent them here, go back to the page they wanted (including
    // its ?query), otherwise go to Products.
    let target = '/'; // the default: Products
    if (location.state?.from) { // is there a note saying where the customer wants to go?
      target = location.state.from.pathname + location.state.from.search; 
      // that page's pathname + search
    }

    // `replace`: the login page is replaced in history, so Back doesn't return to the form.
    return <Navigate to={target} replace />; // this line does the moving
  }

  return <Outlet />;
}
