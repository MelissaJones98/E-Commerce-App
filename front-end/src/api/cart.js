// Functions that call the API's /cart endpoints. They need a logged-in customer: the browser
// sends the session cookie automatically, and without one the API answers 401.
// A cart looks like:
//   { items: [{ product_id, sku, name, price, quantity, line_total }, ...], total }
// Failures throw requestJson's Errors, which carry a `status` (see request.js): e.g. 401 when
// logged out, 404 for a retired product, 409 when there isn't enough stock.

import { requestJson } from './request';

// The logged-in customer's cart.
export function getCart() {
  return requestJson('/cart');
}

// Adds `quantity` of a product to the cart (added to any already there), and resolves to the
// whole updated cart.
export function addCartItem(productId, quantity) {
  return requestJson('/cart/items', {
    method: 'POST',
    // Tells Express the body is JSON, so express.json() parses it into req.body.
    headers: { 'Content-Type': 'application/json' },
    // The API's field names use underscores. `product_id: productId` sets the product_id
    // property to the value of productId; `quantity` alone is shorthand for quantity: quantity.
    body: JSON.stringify({ product_id: productId, quantity }),
  });
}
