// App: the top-level component (index.js renders it into the page).
// It turns the route table into a router that follows the browser's real address bar.

// Named imports from React Router:
// - createBrowserRouter builds a router that reads and changes the browser's URL;
// - RouterProvider draws the page for the router's current URL.
import { createBrowserRouter, RouterProvider } from 'react-router';
// `{ routes }` is a named import of the route table from routes.js.
import { routes } from './routes';

// Build the router once, when this file first loads, not every time App draws. It keeps the
// app's navigation state, so it should only ever be created once.
const router = createBrowserRouter(routes);

// A component is a function returning JSX; `export default` makes App this file's main export.
export default function App() {
  // `router={router}` passes the router to RouterProvider as a prop (an input).
  return <RouterProvider router={router} />;
}
