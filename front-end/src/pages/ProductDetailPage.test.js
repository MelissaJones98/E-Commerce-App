// Tests for a single product's page (/products/:productId): viewing the product, and the
// not-found, loading and error states. (Adding to the cart is tested in AddToCart.test.js.)
// renderAt (test-utils.js) answers GET /products/:id from its `products` option, the way the
// API does: the product, a 404 for an unknown id, or a 400 for an id that isn't a number.

// act() waits for React to finish updating after something the test does directly (here,
// navigating with the router).
import { act, screen } from '@testing-library/react';
import { REQUEST_FAILS, REQUEST_PENDING, renderAt } from '../test-utils';

const mug = {
  id: 1,
  category_id: null,
  sku: 'MUG-001',
  name: 'Coffee Mug',
  description: 'A 350ml ceramic mug',
  price: '8.50',
  stock_quantity: 42,
};
// Spread syntax: a copy of mug with these properties changed.
const spoons = { ...mug, id: 2, sku: 'SPN-001', name: 'Spoon Set', description: null };

// Waits for the page's <h1> with the given text.
function findHeading(name) {
  return screen.findByRole('heading', { level: 1, name });
}

test('shows the name as the heading, the full description, price and stock', async () => {
  renderAt('/products/1', { products: [mug] });

  expect(await findHeading('Coffee Mug')).toBeInTheDocument();
  expect(screen.getByText('A 350ml ceramic mug')).toBeInTheDocument();
  expect(screen.getByText('£8.50')).toBeInTheDocument();
  expect(screen.getByText('42 in stock')).toBeInTheDocument();
});

test('links back to products', async () => {
  renderAt('/products/1', { products: [mug] });

  await findHeading('Coffee Mug');
  expect(screen.getByRole('link', { name: '← Back to products' })).toHaveAttribute('href', '/');
});

test('a product with no description shows no "null"', async () => {
  renderAt('/products/2', { products: [spoons] });

  await findHeading('Spoon Set');
  expect(screen.queryByText('null')).not.toBeInTheDocument();
});

test('a retired or unknown product shows "Product not found"', async () => {
  // No products at all, so /products/1 gets a 404 (as a retired product does from the API).
  renderAt('/products/1', { products: [] });

  expect(await findHeading('Product not found')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: '← Back to products' })).toHaveAttribute('href', '/');
});

test('an invalid id shows "Product not found"', async () => {
  // 'abc' isn't a number, so the API (and renderAt) answers 400.
  renderAt('/products/abc', { products: [mug] });

  expect(await findHeading('Product not found')).toBeInTheDocument();
});

test('shows an error when the product cannot be loaded', async () => {
  renderAt('/products/1', { products: REQUEST_FAILS });

  expect(await screen.findByRole('alert')).toHaveTextContent(
    "Couldn't load this product. Please try again.",
  );
});

test('shows "Loading…" first', async () => {
  renderAt('/products/1', { products: REQUEST_PENDING });

  expect(await screen.findByText('Loading…')).toBeInTheDocument();
});

test('opening another product loads it', async () => {
  const router = renderAt('/products/1', { products: [mug, spoons] });
  await findHeading('Coffee Mug');

  // Going from one product page straight to another reuses the same page component, so this
  // proves it fetches again when the id in the URL changes.
  await act(async () => {
    await router.navigate('/products/2');
  });

  expect(await findHeading('Spoon Set')).toBeInTheDocument();
});
