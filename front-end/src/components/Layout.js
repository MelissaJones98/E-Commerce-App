// Layout: the frame shown around every page. It has a header (the site name and the main nav)
// and a <main> area where the current page appears.

// Named imports from React Router:
// - Link: a link that changes page without reloading the whole website;
// - NavLink: a Link that knows when it points at the current page and marks itself active
//   (it adds class="active" and aria-current="page");
// - Outlet: a placeholder that shows whichever child route matches the URL.
// - useNavigate: a hook that returns a function for changing page from code (after logging out).
import { Link, NavLink, Outlet, useNavigate } from 'react-router';
// useState: remembers the "could not log out" message between re-draws.
import { useState } from 'react';
// useAuth(): who's logged in, whether the app is still checking, and logout().
import { useAuth } from '../auth/AuthContext';
// CartLink: the cart icon with its item-count badge.
import CartLink from './CartLink';
// Importing a CSS file applies its styles; CRA's build tool bundles it into the page.
import '../App.css';

// The nav links, stored as data so the JSX below can loop over them instead of repeating
// <NavLink> for each one. Each object has `to` (the URL) and `label` (the visible text).
// Which list is shown depends on who's logged in (layout B: only show what you can use).
const productsLink = { to: '/', label: 'Products' };
// Logged in: the shop pages that need an account. The cart isn't in this list: it's an icon
// with a badge (<CartLink />), drawn separately in the JSX below, straight after Products.
const customerLinks = [
  { to: '/orders', label: 'Orders' },
  { to: '/account', label: 'Account' },
];
// Logged out: the ways to get an account (after Products, which everyone sees).
const visitorLinks = [
  { to: '/login', label: 'Log in' },
  { to: '/register', label: 'Register' },
];

// A React component is a function that returns JSX (HTML-like markup).
// `export default` makes Layout this file's main export, imported without braces.
export default function Layout() {
  const { customer, checking, logout } = useAuth();
  const navigate = useNavigate();
  // The message shown if logging out fails, or null.
  const [logoutError, setLogoutError] = useState(null);

  // true once the app knows someone is logged in (and isn't still checking).
  const loggedIn = !checking && Boolean(customer);
  // Which links come after Products (and, when logged in, the cart icon). While the app is
  // still checking who's logged in, show only Products, so the nav never shows the wrong set
  // for a moment.
  // `a ? b : c` picks b if a is true, else c; they're chained here for three cases.
  const links = checking ? [] : customer ? customerLinks : visitorLinks;

  // Runs when Log out is clicked.
  async function handleLogout() {
    setLogoutError(null);
    try {
      // Go to Products FIRST, then log out. The other way round, the page you're on (e.g. Cart)
      // would notice nobody is logged in and send you to the login page instead.
      navigate('/');
      await logout();
    } catch (err) {
      // The server didn't log out, so stay logged in and say so.
      setLogoutError(err.message);
    }
  }

  return (
    // <>...</> is a "fragment": it groups elements without adding an extra <div> to the page.
    <>
      {/* In JSX, comments go inside {curly braces}. className is JSX's name for HTML's class. */}
      <header className="site-header">
        {/* The site name is a plain link home, not a heading: each page has its own <h1>. */}
        <Link to="/" className="site-name">
          Melsy Mart
        </Link>

        {/* aria-label names this nav for screen readers (and for the tests: name 'Main'). */}
        <nav aria-label="Main">
          <ul className="nav-links">
            {/* Products is always first. A NavLink also counts as active on pages "inside" its
                URL (e.g. Orders on /orders/7), but React Router treats a link to '/' specially:
                it's only active on exactly '/', so Products isn't highlighted on every page. */}
            <li>
              <NavLink to={productsLink.to}>{productsLink.label}</NavLink>
            </li>
            {/* Logged in: the cart icon comes next, so the order is Products · Cart · Orders. */}
            {loggedIn && (
              <li>
                <CartLink />
              </li>
            )}
            {/* {...} inside JSX runs JavaScript. navLinks.map() turns each object into a <li>.
                ({ to, label }) is "destructuring": it unpacks those two properties into
                variables. `=>` defines an arrow function (a short way to write a function). */}
            {links.map(({ to, label }) => (
              // React needs a unique `key` on each item in a list, to track them between updates.
              <li key={to}>
                {/* {label} inside JSX inserts the variable's value as the link's text. */}
                <NavLink to={to}>{label}</NavLink>
              </li>
            ))}
            {/* Logged in (and finished checking): a greeting and the Log out button.
                `condition && (...)` draws the part in brackets only when condition is true. */}
            {loggedIn && (
              <>
                {/* Customers who signed in with Google may have no first name, so fall back
                    to "Hi there". `${...}` inside backticks inserts a value into the text. */}
                <li className="nav-greeting">
                  {customer.first_name ? `Hi, ${customer.first_name}` : 'Hi there'}
                </li>
                <li>
                  {/* A <button>, not a link: logging out changes something rather than going
                      to a page. className="nav-button" makes it look like the links. */}
                  <button type="button" className="nav-button" onClick={handleLogout}>
                    Log out
                  </button>
                </li>
              </>
            )}
          </ul>
        </nav>
        {/* Shown only if logging out failed. role="alert" makes screen readers announce it. */}
        {logoutError && (
          <p role="alert" className="form-error">
            {logoutError}
          </p>
        )}
      </header>

      <main className="page">
        {/* The page that matches the current URL is drawn here. */}
        <Outlet />
      </main>
    </>
  );
}
