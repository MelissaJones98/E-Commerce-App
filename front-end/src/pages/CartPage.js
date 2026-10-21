// The Cart page (at /cart; RequireAuth makes sure someone is logged in). It shows the cart as
// one card: a row for each product with its unit price, quantity (with − and + to change it),
// row price and a × to remove it, then the subtotal and "Proceed to checkout".
//
// Every number shown comes from the API: each row's price is the API's line_total (unit price ×
// quantity) and the subtotal is its total, so nothing is added up in the browser. The cart
// itself lives in CartContext, so changing it here also updates the badge in the nav.

// Link: a link that changes page without reloading. useLocation/useNavigate: for sending an
// expired login to the Log in page and back (see `change` below).
import { Link, useLocation, useNavigate } from 'react-router';
import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { countItems, useCart } from '../cart/CartContext';
import { formatPrice } from '../format';
// stockAdjustment: what to do about a 409 (not enough stock); see cart/stock.js.
import { stockAdjustment } from '../cart/stock';

const UPDATE_ERROR = 'Could not update your cart. Please try again.';

export default function CartPage() {
  const { cart, updateQuantity, removeItem, refresh } = useCart();
  const { setCustomer } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // The first load when the page opens: 'loading', 'ready' or 'error'. (After that, the page
  // simply shows whatever cart CartContext holds.)
  const [status, setStatus] = useState('loading');
  // true while a change is on its way to the API. Every −, + and × is disabled meanwhile, so
  // changes never overlap: each reply is a whole cart, and two crossing replies could leave a
  // row showing the wrong number.
  const [busy, setBusy] = useState(false);
  // The same, in a ref: a state change only takes effect on the next draw, so two very fast
  // clicks could both see busy === false. A ref changes immediately (see AddToCart.js).
  const busyRef = useRef(false);
  // A message under a row, after a change: { [product_id]: { kind: 'error' | 'adjusted', text } }.
  // An object used as a lookup table, keyed by product id.
  const [messages, setMessages] = useState({});

  // Load the cart afresh when the page opens, so it never shows an out-of-date cart (one
  // changed in another tab, say). refresh() throws if it can't load, which shows the error.
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

  // Sets (or, with null, clears) one row's message, leaving the other rows' messages alone.
  // `{ ...current, [id]: message }` copies the lookup table and replaces one entry; [id] in
  // square brackets uses the VALUE of id as the key.
  function setMessage(productId, message) {
    setMessages((current) => ({ ...current, [productId]: message }));
  }

  // What happens when stock has run short (409). stockAdjustment (cart/stock.js) reads how many
  // are left from the API's message, and decides: set the quantity to that number automatically,
  // or just say how many there are. If the automatic change itself fails, the customer gets the
  // general error, never a message claiming the quantity changed.
  async function handle409(item, err) {
    const { quantity, kind, text } = stockAdjustment(item.quantity, err.message);
    if (quantity !== null) {
      try {
        await updateQuantity(item.product_id, quantity);
      } catch {
        setMessage(item.product_id, { kind: 'error', text: UPDATE_ERROR });
        return;
      }
    }
    setMessage(item.product_id, { kind, text });
  }

  // Runs one change (− , + or ×) for a row. `action` is a function that makes the change, e.g.
  // () => updateQuantity(1, 4). Only one change at a time; errors become messages on the row.
  async function change(item, action) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setMessage(item.product_id, null); // a new change clears the row's old message
    try {
      await action();
    } catch (err) {
      if (err.status === 401) {
        // The login has expired. Record that they're logged out (the nav updates) and send them
        // to Log in, which brings them back here afterwards.
        setCustomer(null);
        navigate('/login', { state: { from: location } });
      } else if (err.status === 404) {
        // The product isn't in the cart any more (removed in another tab, or retired): just
        // reload the cart, so the row disappears. No message: there's nothing to fix. If the
        // reload itself fails, keep the cart that's showing (keepOnError) and say so on the row.
        await refresh({ keepOnError: true }).catch(() =>
          setMessage(item.product_id, { kind: 'error', text: UPDATE_ERROR }),
        );
      } else if (err.status === 409) {
        await handle409(item, err);
      } else {
        setMessage(item.product_id, { kind: 'error', text: UPDATE_ERROR });
      }
    } finally {
      // Runs whether the change worked or not, so the buttons always come back.
      busyRef.current = false;
      setBusy(false);
    }
  }

  if (status === 'loading') {
    return (
      <section>
        <h1 className="centred">Your Cart</h1>
        <p className="centred">Loading…</p>
      </section>
    );
  }

  if (status === 'error' || !cart) {
    return (
      <section>
        <h1 className="centred">Your Cart</h1>
        <p role="alert" className="form-error centred">
          Couldn't load your cart. Please try again.
        </p>
      </section>
    );
  }

  if (cart.items.length === 0) {
    return (
      <section>
        <h1 className="centred">Your Cart</h1>
        <div className="cart">
          <p>Your cart is empty.</p>
          <Link to="/">Browse products</Link>
        </div>
      </section>
    );
  }

  // The number of items for the subtotal line: the total quantity, the same as the badge.
  const count = countItems(cart);

  return (
    <section>
      <h1 className="centred">Your Cart</h1>
      <div className="cart">
        <ul className="cart-items">
          {cart.items.map((item) => {
            const message = messages[item.product_id];
            return (
              <li key={item.product_id} className="cart-item">
                <div className="cart-item-name">
                  <strong>{item.name}</strong>
                  <span className="cart-item-each">{formatPrice(item.price)} each</span>
                </div>

                {/* − quantity +. The buttons' visible text is just − or +, so aria-label gives
                    each a full name for screen readers, including which product it changes. */}
                <div className="cart-quantity">
                  <button
                    type="button"
                    className="round-button"
                    aria-label={`Decrease quantity of ${item.name}`}
                    disabled={busy || item.quantity <= 1}
                    onClick={() =>
                      change(item, () => updateQuantity(item.product_id, item.quantity - 1))
                    }
                  >
                    −
                  </button>
                  <span aria-label={`Quantity of ${item.name}: ${item.quantity}`}>
                    {item.quantity}
                  </span>
                  <button
                    type="button"
                    className="round-button"
                    aria-label={`Increase quantity of ${item.name}`}
                    disabled={busy}
                    onClick={() =>
                      change(item, () => updateQuantity(item.product_id, item.quantity + 1))
                    }
                  >
                    +
                  </button>
                </div>

                {/* The row's price: unit price × quantity, worked out by the API. */}
                <span className="cart-item-total">{formatPrice(item.line_total)}</span>

                <button
                  type="button"
                  className="round-button"
                  aria-label={`Remove ${item.name} from your cart`}
                  disabled={busy}
                  onClick={() => change(item, () => removeItem(item.product_id))}
                >
                  {/* aria-hidden: the button's name (above) already says what it does. */}
                  <span aria-hidden="true">×</span>
                </button>

                {/* This row's message, if any: an adjustment (status) or a problem (alert). */}
                {message?.kind === 'adjusted' && (
                  <p role="status" className="cart-item-message">
                    {message.text}
                  </p>
                )}
                {message?.kind === 'error' && (
                  <p role="alert" className="form-error cart-item-message">
                    {message.text}
                  </p>
                )}
              </li>
            );
          })}
        </ul>

        {/* The subtotal of every row, worked out by the API. `count === 1 ? a : b` gives
            "1 item" or "4 items". */}
        <p className="cart-subtotal">
          <span>Subtotal ({count === 1 ? '1 item' : `${count} items`})</span>
          <strong>{formatPrice(cart.total)}</strong>
        </p>

        <div className="cart-actions">
          {/* Checkout isn't in the nav bar: customers reach it from their cart. */}
          <Link to="/checkout" className="button-link">
            Proceed to checkout
          </Link>
        </div>
      </div>
    </section>
  );
}
