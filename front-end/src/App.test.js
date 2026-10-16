// Test for App, the real entry point. routes.test.js checks the route table with a memory
// router; this checks that App renders the route table and shows the home page at the URL the
// fake browser starts on.

// Named imports (picked out by name) from React Testing Library.
import { render, screen } from '@testing-library/react';
// Default import: App is the main (default) export of App.js.
import App from './App';

test('App shows the Products page at the home URL', async () => {
  // The fake browser (jsdom) starts at http://localhost/, so App should show the home page.
  render(<App />);

  // findByRole waits a moment for the page to appear; `await` pauses until it does.
  expect(await screen.findByRole('heading', { level: 1, name: 'Products' })).toBeInTheDocument();
});
