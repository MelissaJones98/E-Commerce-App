// Functions that call the API's /orders endpoints: the logged-in customer's order history. They
// need a login (the browser sends the session cookie); without one the API answers 401.
// Failures throw requestJson's Errors, which carry a `status` (see request.js).

import { requestJson } from './request';

// Every order the customer has placed, newest first, as summaries:
//   [{ id, status, total_amount, item_count, created_at }, ...]   ([] if there are none)
export function getOrders() {
  return requestJson('/orders');
}

// One order in full:
//   { id, status, total_amount, created_at, shipping_address: {...}, items: [...] }
// `id` comes from the page's URL, so encodeURIComponent() escapes anything that would change
// the address asked for (see getProduct in products.js). A 404 means the order doesn't exist OR
// belongs to another customer; the API deliberately doesn't say which.
export function getOrder(id) {
  return requestJson(`/orders/${encodeURIComponent(id)}`);
}
