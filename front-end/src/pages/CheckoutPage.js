// The Checkout page (at /checkout; RequireAuth makes sure someone is logged in). One column, top
// to bottom:
//   1. Your order: each item, the subtotal, the delivery charge and the total (plus "Spend £X
//      more for free delivery" while delivery is charged)
//   2. Delivery address and 3. Payment: CheckoutForm, with Stripe's card box and the Pay button
//
// Every number shown comes from the API's cart (total, delivery_charge, order_total,
// free_delivery_remaining): nothing is added up in the browser, so the Pay button always shows
// exactly what the API will charge.

import { useEffect, useState } from 'react';
// Link: a link that changes page without reloading.
import { Link } from 'react-router';
// <Elements> makes Stripe available to everything inside it (CheckoutForm's useStripe()).
import { Elements } from '@stripe/react-stripe-js';
import { countItems, useCart } from '../cart/CartContext';
import CheckoutForm from '../components/CheckoutForm';
import { formatPrice } from '../format';
// The Promise of the Stripe object (or null without a key), loaded once when the app starts.
import { stripePromise } from '../stripe';

export default function CheckoutPage() {
  const { cart, refresh } = useCart();
  // The first load when the page opens: 'loading', 'ready' or 'error'.
  const [status, setStatus] = useState('loading');

  // Load the cart afresh when the page opens (as the Cart page does), so the total is never out
  // of date. refresh() throws if it can't load, which shows the error.
  useEffect(() => {
    let ignore = false; // set by the cleanup if the page closes before the answer
    refresh()
      .then(() => {
        if (!ignore) setStatus('ready');
      })
      .catch(() => {
        if (!ignore) setStatus('error');
      });
    return () => {
      ignore = true;
    };
    // Only when the page opens: refresh is remade on every draw, so it's left out on purpose.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // An early `return` draws a different page for each state, so the code at the bottom only
  // deals with a loaded cart that has something in it.
  if (status === 'loading') {
    return (
      <section>
        <h1 className="centred">Checkout</h1>
        <p className="centred">Loading…</p>
      </section>
    );
  }

  if (status === 'error' || !cart) {
    return (
      <section>
        <h1 className="centred">Checkout</h1>
        <p role="alert" className="form-error centred">
          Couldn't load your cart. Please try again.
        </p>
      </section>
    );
  }

  if (cart.items.length === 0) {
    return (
      <section>
        <h1 className="centred">Checkout</h1>
        <div className="cart">
          <p>Your cart is empty.</p>
          <Link to="/">Browse products</Link>
        </div>
      </section>
    );
  }

  // The number of items for the subtotal line (the total quantity, as on the Cart page).
  const count = countItems(cart);

  return (
    <section>
      <h1 className="centred">Checkout</h1>
      <div className="cart checkout">
        <h2>Your order</h2>
        <ul className="order-items">
          {cart.items.map((item) => (
            <li key={item.product_id} className="order-item">
              <div className="cart-item-name">
                <strong>{item.name}</strong>
                <span className="cart-item-each">{formatPrice(item.price)} each</span>
              </div>
              <span>× {item.quantity}</span>
              <span className="order-item-total">{formatPrice(item.line_total)}</span>
            </li>
          ))}
        </ul>

        {/* Subtotal, Delivery and Total, as on the order page. The API sends a free delivery as
            '0.00', which reads better as "Free". */}
        <p className="cart-subtotal order-line">
          <span>Subtotal ({count === 1 ? '1 item' : `${count} items`})</span>
          <span>{formatPrice(cart.total)}</span>
        </p>
        <p className="cart-subtotal order-line">
          <span>Delivery</span>
          <span>{cart.delivery_charge === '0.00' ? 'Free' : formatPrice(cart.delivery_charge)}</span>
        </p>
        <p className="cart-subtotal">
          <span>Total</span>
          <strong>{formatPrice(cart.order_total)}</strong>
        </p>
        {/* While delivery is charged, say how much more would make it free. */}
        {cart.free_delivery_remaining !== '0.00' && (
          <p className="free-delivery-hint">
            Spend {formatPrice(cart.free_delivery_remaining)} more for free delivery
          </p>
        )}

        {/* Stripe's provider around the form. stripe={stripePromise} may be null (no key), which
            <Elements> accepts: the form then shows that payments aren't available. */}
        <Elements stripe={stripePromise}>
          <CheckoutForm cart={cart} onCartChanged={() => refresh({ keepOnError: true }).catch(() => {})} />
        </Elements>
      </div>
    </section>
  );
}
