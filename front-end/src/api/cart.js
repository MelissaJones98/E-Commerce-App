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

// Sets how many of a product are in the cart. Unlike addCartItem, this REPLACES the quantity
// (3 means "make it 3", not "add 3"). Resolves to the whole updated cart.
// A 409 means there isn't enough stock; its message reads "Not enough stock: N available".
export function setCartQuantity(productId, quantity) {
  return requestJson(`/cart/items/${productId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ quantity }),
  });
}

// Removes a product from the cart completely. The API replies 204 No Content (no body), so
// this resolves to null; ask getCart() for the updated cart.
export function removeCartItem(productId) {
  return requestJson(`/cart/items/${productId}`, { method: 'DELETE' });
}
