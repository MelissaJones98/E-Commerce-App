// The function that calls the API's checkout endpoint, POST /cart/checkout. It needs a logged-in
// customer: the browser sends the session cookie automatically.
//
// Card details are NOT sent here: Stripe Elements gives the card straight to Stripe, which hands
// back a PaymentMethod id (pm_...) that stands in for it. Only that id goes to our API.
//
// Failures throw requestJson's Errors, which carry a `status` (see request.js), e.g.:
//   400 invalid details, an empty cart, or a PaymentMethod Stripe didn't accept
//   401 logged out
//   402 the card was declined
//   409 not enough stock, or the cart's total changed since the page showed it
//   502 Stripe failed
// Each Error's message is the API's own explanation, ready to show the customer.

import { requestJson } from './request';

// Places the order and resolves to it (the same shape as GET /orders/:id).
// The one argument is an object, destructured into its three parts:
//   shippingAddress  { line_1, line_2, city, region, postal_code, country_code }
//   paymentMethodId  Stripe's id for the card, e.g. 'pm_1Q...'
//   expectedTotal    the total the page showed on its Pay button, e.g. '28.45'. The API refuses
//                    to charge (409) if the cart no longer comes to exactly this.
export function placeOrder({ shippingAddress, paymentMethodId, expectedTotal }) {
  return requestJson('/cart/checkout', {
    method: 'POST',
    // Tells Express the body is JSON, so express.json() parses it into req.body.
    headers: { 'Content-Type': 'application/json' },
    // The API's field names use underscores, so each value is given its API name.
    body: JSON.stringify({
      shipping_address: shippingAddress,
      payment_method_id: paymentMethodId,
      expected_total: expectedTotal,
    }),
  });
}
