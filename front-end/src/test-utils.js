// Helpers shared by the front-end test files. It has no tests itself: Jest only runs files
// ending in .test.js.

// render() draws a component into a fake page (jsdom). Named import: picked out by name.
import { render } from '@testing-library/react';
// createMemoryRouter builds a router that keeps its URL history in memory instead of the
// browser's address bar; RouterProvider shows the router's current page.
import { createMemoryRouter, RouterProvider } from 'react-router';
// The app's real route table, so tests check exactly what users get.
import { routes } from './routes';

// Show the app as if the browser had opened `url`. `export` lets test files import it.
// It returns the router, so a test can drive it directly (e.g. router.navigate(-1) to go back).
export function renderAt(url) {
  // initialEntries is the starting history: a list of URLs, and the last one is the current page.
  const router = createMemoryRouter(routes, { initialEntries: [url] });
  // <RouterProvider router={router} /> is JSX: HTML-like syntax for creating React elements.
  // `router={router}` passes the router to RouterProvider as a "prop" (an input).
  render(<RouterProvider router={router} />);
  return router;
}
