// Functions that call the API's /products endpoints. Both are public: no login needed.
// A product looks like:
//   { id, category_id, sku, name, description, price, stock_quantity }
// `price` is a string such as "8.50" (so its exact value is kept), and `description` may be null.
// Failures throw requestJson's Errors, which carry a `status` (see request.js).

import { requestJson } from './request';

// Every product in the shop (retired ones are already left out by the API), in id order.
export function getProducts() {
  return requestJson('/products');
}

// One product. `id` comes from the page's URL, so it's a string, e.g. '42', and could be
// anything a person typed. encodeURIComponent() escapes characters that mean something in a URL
// (like '/', '?' or '#'), so a typed id such as 'a/b' can't change which address is asked for.
// `${...}` inside backticks inserts a value into the text.
export function getProduct(id) {
  return requestJson(`/products/${encodeURIComponent(id)}`);
}
