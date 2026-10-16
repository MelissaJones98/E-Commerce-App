// Layout: the frame shown around every page. It has a header (the site name and the main nav)
// and a <main> area where the current page appears.

// Named imports from React Router:
// - Link: a link that changes page without reloading the whole website;
// - NavLink: a Link that knows when it points at the current page and marks itself active
//   (it adds class="active" and aria-current="page");
// - Outlet: a placeholder that shows whichever child route matches the URL.
import { Link, NavLink, Outlet } from 'react-router';
// Importing a CSS file applies its styles; CRA's build tool bundles it into the page.
import '../App.css';

// The nav links, stored as data so the JSX below can loop over them instead of repeating
// <NavLink> six times. Each object has `to` (the URL) and `label` (the visible text).
const navLinks = [
  { to: '/', label: 'Products' },
  { to: '/cart', label: 'Cart' },
  { to: '/orders', label: 'Orders' },
  { to: '/account', label: 'Account' },
  { to: '/login', label: 'Log in' },
  { to: '/register', label: 'Register' },
];

// A React component is a function that returns JSX (HTML-like markup).
// `export default` makes Layout this file's main export, imported without braces.
export default function Layout() {
  return (
    // <>...</> is a "fragment": it groups elements without adding an extra <div> to the page.
    <>
      {/* In JSX, comments go inside {curly braces}. className is JSX's name for HTML's class. */}
      <header className="site-header">
        {/* The site name is a plain link home, not a heading: each page has its own <h1>. */}
        <Link to="/" className="site-name">
          E-Commerce App
        </Link>

        {/* aria-label names this nav for screen readers (and for the tests: name 'Main'). */}
        <nav aria-label="Main">
          <ul className="nav-links">
            {/* {...} inside JSX runs JavaScript. navLinks.map() turns each object into a <li>.
                ({ to, label }) is "destructuring": it unpacks those two properties into
                variables. `=>` defines an arrow function (a short way to write a function). */}
            {navLinks.map(({ to, label }) => (
              // React needs a unique `key` on each item in a list, to track them between updates.
              <li key={to}>
                {/* {label} inside JSX inserts the variable's value as the link's text.
                    A NavLink also counts as active on pages "inside" its URL (e.g. Orders on
                    /orders/7), but React Router treats a link to '/' specially: it's only
                    active on exactly '/', so Products isn't highlighted on every page. */}
                <NavLink to={to}>{label}</NavLink>
              </li>
            ))}
          </ul>
        </nav>
      </header>

      <main className="page">
        {/* The page that matches the current URL is drawn here. */}
        <Outlet />
      </main>
    </>
  );
}
