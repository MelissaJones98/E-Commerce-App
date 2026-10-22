// CheckoutForm: the delivery address fields, Stripe's card box and the Pay button, on the
// Checkout page. It must sit inside Stripe's <Elements> (CheckoutPage.js puts it there), because
// useStripe() and useElements() read Stripe from it.
//
// Paying, step by step:
//   1. Check the address: line 1, town/city and postcode must be filled in. If not, say which,
//      and stop. Nothing is sent anywhere.
//   2. Ask Stripe to turn the card box into a PaymentMethod. The card details go straight from
//      the card box to Stripe, never to our API. Stripe answers with an id (pm_...), or an error
//      such as "Your card number is incomplete."
//   3. Send the address, that id and the total shown on the Pay button to POST /cart/checkout.
//   4. On success, open the new order's page with a thank-you, and reload the cart so the badge
//      empties. On failure, show the API's message above the Pay button and keep everything typed.
//
// Props:
//   cart           the cart from the API: its order_total is what the Pay button shows and what
//                  the API is told to expect
//   onCartChanged  reloads the cart; called when the API says the cart isn't what was shown (409)
//                  or is empty (400), so the page shows the cart as it really is now

import { useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
// CardElement: Stripe's one-line card box (number, expiry and security code).
// useStripe / useElements: the Stripe object, and the card box's element, for step 2.
import { CardElement, useElements, useStripe } from '@stripe/react-stripe-js';
import { placeOrder } from '../api/checkout';
import { useAuth } from '../auth/AuthContext';
import { useCart } from '../cart/CartContext';
import { formatPrice } from '../format';
// False when there's no publishable key, so payments can't work (see stripe.js).
import { paymentsAvailable } from '../stripe';

// The address fields, in the order they're shown: [the API's name for it, its label, the
// message when it's required but blank (null if it's optional), its browser autofill name].
// Keeping them in one list means the form and the checks below can't drift apart.
const FIELDS = [
  ['line_1', 'Address line 1', 'Enter address line 1', 'address-line1'],
  ['line_2', 'Address line 2 (optional)', null, 'address-line2'],
  ['city', 'Town / city', 'Enter your town or city', 'address-level2'],
  ['region', 'County (optional)', null, 'address-level1'],
  ['postal_code', 'Postcode', 'Enter your postcode', 'postal-code'],
];

// An empty form: every field set to ''. Object.fromEntries turns a list of [name, value] pairs
// into an object, e.g. { line_1: '', line_2: '', ... }.
const EMPTY_ADDRESS = Object.fromEntries(FIELDS.map(([name]) => [name, '']));

export default function CheckoutForm({ cart, onCartChanged }) {
  const stripe = useStripe();
  const elements = useElements();
  const { setCustomer } = useAuth();
  const { refresh } = useCart();
  const navigate = useNavigate();
  const location = useLocation();

  // What's typed in each address field.
  const [address, setAddress] = useState(EMPTY_ADDRESS);
  // A message under each required field left blank: { line_1: 'Enter address line 1', ... }.
  const [fieldErrors, setFieldErrors] = useState({});
  // The message above the Pay button when paying failed, or null.
  const [error, setError] = useState(null);
  // true while paying: the button says "Paying…" and is disabled.
  const [busy, setBusy] = useState(false);
  // The same, in a ref: a state change only takes effect on the next draw, so two very fast
  // clicks could both see busy === false and pay twice. A ref changes immediately.
  const busyRef = useRef(false);

  // Keeps one field's state up to date as the customer types. `[name]: value` (square brackets)
  // uses the VALUE of name as the property name; `...current` copies the other fields.
  function handleChange(name, value) {
    setAddress((current) => ({ ...current, [name]: value }));
  }

  // The address as the API wants it: each part trimmed (spaces at either end removed), empty
  // optional parts sent as null, and always in the UK (GB). `|| null` gives null for ''.
  function shippingAddress() {
    return {
      line_1: address.line_1.trim(),
      line_2: address.line_2.trim() || null,
      city: address.city.trim(),
      region: address.region.trim() || null,
      postal_code: address.postal_code.trim(),
      country_code: 'GB',
    };
  }

  async function handleSubmit(event) {
    // A form normally reloads the page when submitted; preventDefault() stops that.
    event.preventDefault();
    if (busyRef.current) return;

    // Step 1: a message for each required field that's blank (or only spaces).
    const errors = {};
    for (const [name, , requiredMessage] of FIELDS) {
      if (requiredMessage && address[name].trim() === '') errors[name] = requiredMessage;
    }
    setFieldErrors(errors);
    // Object.keys(errors) lists the fields with a message; any at all means stop here.
    if (Object.keys(errors).length > 0) return;
    // Stripe hasn't loaded (or there's no key): the button is disabled anyway, but Enter in a
    // field can still submit the form.
    if (!stripe || !elements) return;

    busyRef.current = true;
    setBusy(true);
    setError(null);
    try {
      // Step 2: the card box becomes a PaymentMethod. Stripe answers either { paymentMethod }
      // or { error }; destructuring picks out both (one of them is undefined).
      const { paymentMethod, error: cardError } = await stripe.createPaymentMethod({
        type: 'card',
        card: elements.getElement(CardElement),
      });
      if (cardError) {
        // E.g. "Your card number is incomplete." Nothing has been sent to our API.
        setError(cardError.message);
        return;
      }

      // Step 3: place the order, telling the API the total the customer saw.
      const order = await placeOrder({
        shippingAddress: shippingAddress(),
        paymentMethodId: paymentMethod.id,
        expectedTotal: cart.order_total,
      });

      // Step 4: open the new order, with { justPlaced: true } so it says thank you. Then reload
      // the cart, so the nav's badge empties. (Reloading first would briefly show "Your cart is
      // empty." here before the order page.) A failed reload doesn't matter: the order is placed.
      navigate(`/orders/${order.id}`, { state: { justPlaced: true } });
      refresh().catch(() => {});
    } catch (err) {
      if (err.status === 401) {
        // The login has expired. Record that they're logged out and go to Log in, which brings
        // them back here afterwards (as the Cart page does).
        setCustomer(null);
        navigate('/login', { state: { from: location } });
        return;
      }
      // Every other failure: the API's own message, e.g. "Your card was declined."
      setError(err.message);
      // 409 (the cart or a price changed, or stock ran out) or 400 (e.g. the cart was emptied
      // elsewhere): reload the cart, so the page shows what's really in it now.
      if (err.status === 409 || err.status === 400) await onCartChanged();
    } finally {
      // Runs whether paying worked or not, so the button always comes back.
      busyRef.current = false;
      setBusy(false);
    }
  }

  return (
    // noValidate turns off the browser's own "Please fill in this field" bubbles: the form shows
    // its own messages (step 1) instead.
    <form onSubmit={handleSubmit} className="form checkout-form" noValidate>
      <h2>Delivery address</h2>
      {/* One label and input per field. .map() turns each entry of FIELDS into its JSX;
          [name, label, , autoComplete] skips the third item (the message) with an empty slot. */}
      {FIELDS.map(([name, label, , autoComplete]) => (
        <div key={name} className="checkout-field">
          <label htmlFor={`checkout-${name}`}>{label}</label>
          <input
            id={`checkout-${name}`}
            value={address[name]}
            onChange={(e) => handleChange(name, e.target.value)}
            // Lets the browser offer the customer's saved address.
            autoComplete={autoComplete}
            // aria-invalid tells screen readers the field has a problem; aria-describedby points
            // them at the message, so it's read out with the field.
            aria-invalid={fieldErrors[name] ? 'true' : undefined}
            aria-describedby={fieldErrors[name] ? `checkout-${name}-error` : undefined}
          />
          {fieldErrors[name] && (
            <p id={`checkout-${name}-error`} className="form-error">
              {fieldErrors[name]}
            </p>
          )}
        </div>
      ))}

      <h2>Payment</h2>
      {paymentsAvailable ? (
        // Stripe's card box. hidePostalCode: the address above already has the postcode.
        <div className="card-box">
          <CardElement options={{ hidePostalCode: true }} />
        </div>
      ) : (
        <p className="form-error">Payments aren't available right now.</p>
      )}

      {/* The failure message, if any. role="alert" makes screen readers announce it. */}
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}

      {/* Disabled while paying, without a key, or until Stripe has loaded. */}
      <button type="submit" disabled={busy || !paymentsAvailable || !stripe}>
        {busy ? 'Paying…' : `Pay ${formatPrice(cart.order_total)}`}
      </button>
    </form>
  );
}
