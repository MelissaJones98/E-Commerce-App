// Tests for the Products page (the home page, '/'): the grid of products from GET /products.
// renderAt (test-utils.js) answers GET /products with the `products` option, so no server is
// needed.

// within(element) searches inside one part of the page, e.g. a single product card.
import { screen, within } from '@testing-library/react';
import { REQUEST_FAILS, REQUEST_PENDING, renderAt } from '../test-utils';

// Three products in the API's shape: one in stock, one sold out, one with no description.
const mug = {
  id: 1,
  category_id: null,
  sku: 'MUG-001',
  name: 'Coffee Mug',
  description: 'A 350ml ceramic mug',
  price: '8.50',
  stock_quantity: 42,
};
// `{ ...mug, ... }` is "spread" syntax: copy every property of mug, then override the ones
// listed after it.
const teapot = { ...mug, id: 2, sku: 'POT-001', name: 'Teapot', price: '24.00', stock_quantity: 0 };
const spoons = { ...mug, id: 3, sku: 'SPN-001', name: 'Spoon Set', description: null };

// Finds a product's card: the <article> whose heading is the product's name. closest() walks up
// from the heading to the nearest enclosing <article>.
async function findCard(name) {
  const heading = await screen.findByRole('heading', { name });
  return heading.closest('article');
}

test('shows "Loading…" until the products arrive', async () => {
  renderAt('/', { products: REQUEST_PENDING });

  expect(await screen.findByText('Loading…')).toBeInTheDocument();
});

test("shows each product's name, description and price", async () => {
  renderAt('/', { products: [mug, teapot] });

  const card = await findCard('Coffee Mug');
  expect(within(card).getByText('A 350ml ceramic mug')).toBeInTheDocument();
  expect(within(card).getByText('£8.50')).toBeInTheDocument();
  expect(await findCard('Teapot')).toBeInTheDocument();
});

test('each card links to its product page', async () => {
  renderAt('/', { products: [mug] });

  // /Coffee Mug/ is a regular expression: it matches any link name CONTAINING "Coffee Mug"
  // (the link's name is all the text inside it, including the price).
  const link = await screen.findByRole('link', { name: /Coffee Mug/ });
  expect(link).toHaveAttribute('href', '/products/1');
});

test('a sold-out product says "Out of stock"', async () => {
  renderAt('/', { products: [mug, teapot] });

  expect(within(await findCard('Teapot')).getByText('Out of stock')).toBeInTheDocument();
  // And only the sold-out one does.
  expect(within(await findCard('Coffee Mug')).queryByText('Out of stock')).not.toBeInTheDocument();
});

test('a product with no description shows no "null"', async () => {
  renderAt('/', { products: [spoons] });

  await findCard('Spoon Set');
  // queryByText returns null instead of throwing when nothing matches, so it suits "not there".
  expect(screen.queryByText('null')).not.toBeInTheDocument();
});

test('shows a message when there are no products', async () => {
  renderAt('/', { products: [] });

  expect(await screen.findByText('No products yet.')).toBeInTheDocument();
});

test('shows an error when the products cannot be loaded', async () => {
  renderAt('/', { products: REQUEST_FAILS });

  expect(await screen.findByRole('alert')).toHaveTextContent(
    "Couldn't load products. Please try again.",
  );
});

test('the page heading is "Products", and it is the only <h1>', async () => {
  renderAt('/', { products: [mug, teapot] });

  // Wait for the products, so the check covers the finished page (cards use <h2>s).
  await findCard('Teapot');
  expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Products');
});
