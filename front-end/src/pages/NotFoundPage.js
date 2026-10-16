// The "Page not found" page, shown for any URL that doesn't match a route (the '*' route).

// Link changes page without reloading the whole website. `{ Link }` is a named import.
import { Link } from 'react-router';

// A component is a function returning JSX; `export default` makes it this file's main export.
export default function NotFoundPage() {
  return (
    <section>
      <h1>Page not found</h1>
      <p>Sorry, there's no page at this address.</p>
      {/* A way back, so the visitor isn't stuck. */}
      <Link to="/">Back to the shop</Link>
    </section>
  );
}
