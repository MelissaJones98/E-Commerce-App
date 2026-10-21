// AddToCart: the quantity box and "Add to cart" button on a product's page, with the message
// that follows ("✓ Added 2 to your cart." or what went wrong).
//   - Logged out: the button takes you to Log in, which brings you back here afterwards.
//   - Sold out: a disabled "Out of stock" button instead.
//   - The quantity must be a whole number from 1 to the number in stock; anything else (0, 2.5,
//     too many, an empty box) just disables the button.
// Adding goes through useCart().addToCart, so the cart badge in the nav updates as well.

// useId: makes an id that's unique on the page, to connect the <label> to its <input>.
// useRef: a box that keeps a value between re-draws without causing one (see sendingRef).
import { useId, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { useAuth } from '../auth/AuthContext';
import { useCart } from '../cart/CartContext';

const ADD_ERROR = 'Could not add to your cart. Please try again.';

export default function AddToCart({ product }) {
  // checking: true while the app is still finding out who's logged in (see AuthContext.js).
  const { customer, checking, setCustomer } = useAuth();
  const { addToCart } = useCart();
  const navigate = useNavigate();
  const location = useLocation();
  const quantityId = useId();

  // The quantity exactly as typed. Kept as text (not a number), so that what's in the box is
  // what gets checked: Number('') would quietly become 0, and Number('2.5') would become 2.5.
  const [quantity, setQuantity] = useState('1');
  // true while the request is on its way: the button then says "Adding…" and is disabled.
  const [sending, setSending] = useState(false);
  // The message under the button: { kind: 'added' | 'error', text }, or null for none.
  const [message, setMessage] = useState(null);
  // Also "sending", but in a ref. A state change only takes effect on the NEXT draw, so a fast
  // double click can run handleSubmit twice before the button is disabled. A ref changes
  // immediately, so the second click sees it and stops.
  const sendingRef = useRef(false);

  // Sold out: nothing to choose, so just a disabled button saying so.
  if (product.stock_quantity === 0) {
    return (
      <button type="button" className="add-to-cart-button" disabled>
        Out of stock
      </button>
    );
  }

  // Is the quantity a whole number from 1 to the stock? /^\d+$/ means "only digits, at least
  // one" (from start ^ to end $), which rules out '', '2.5' and '-1' before Number() is used.
  const amount = Number(quantity);
  const validQuantity = /^\d+$/.test(quantity) && amount >= 1 && amount <= product.stock_quantity;

  // Sends the visitor to Log in, remembering this page (the same way RequireAuth does), so they
  // come straight back here after logging in or registering.
  function goToLogin() {
    navigate('/login', { state: { from: location } });
  }

  // Runs when the form is submitted: clicking the button, or pressing Enter in the box.
  // `event.preventDefault()` stops the browser's normal form submission, which would reload
  // the page.
  async function handleSubmit(event) {
    event.preventDefault();
    // Still checking who's logged in: wait. Treating "don't know yet" as "logged out" would send
    // a logged-in customer to the Log in page (the same rule RequireAuth follows).
    if (checking) return;
    if (!customer) {
      goToLogin();
      return;
    }
    if (sendingRef.current || !validQuantity) return;

    sendingRef.current = true;
    setSending(true);
    setMessage(null); // clear the previous message, so it can't be mistaken for this one's
    try {
      await addToCart(product.id, amount);
      setMessage({ kind: 'added', text: `✓ Added ${amount} to your cart.` });
    } catch (err) {
      if (err.status === 401) {
        // The session has expired (or was ended elsewhere), even though the app still thought
        // they were logged in. Record that they're logged out, so the nav updates, and send
        // them to Log in, which brings them back here.
        setCustomer(null);
        goToLogin();
        return;
      }
      // 409: not enough stock. The API's own message says how many are left and how many are
      // already in the cart, so show it. Anything else gets the general message.
      setMessage({ kind: 'error', text: err.status === 409 ? err.message : ADD_ERROR });
    } finally {
      // `finally` runs whether the try succeeded or failed (and even after the `return` above),
      // so the button is always usable again afterwards.
      sendingRef.current = false;
      setSending(false);
    }
  }

  return (
    // A <form>, so pressing Enter in the quantity box adds to the cart, like clicking the button.
    <form className="add-to-cart" onSubmit={handleSubmit}>
      <label htmlFor={quantityId}>Quantity</label>
      {/* type="number" gives a box with up/down arrows (a "spinbutton"). min and max set the
          arrows' limits; typing can still go outside them, which validQuantity catches.
          onChange runs on every keystroke; event.target.value is the box's text. */}
      <input
        id={quantityId}
        type="number"
        min="1"
        max={product.stock_quantity}
        step="1"
        value={quantity}
        onChange={(event) => setQuantity(event.target.value)}
      />
      {/* Disabled while sending, while the app is still checking who's logged in (usually a
          split second), or when the quantity isn't allowed. */}
      <button
        type="submit"
        className="add-to-cart-button"
        disabled={sending || checking || !validQuantity}
      >
        {sending ? 'Adding…' : 'Add to cart'}
      </button>

      {/* role="status" is announced politely by screen readers (after what they're reading);
          role="alert" interrupts, which suits a problem. */}
      {message?.kind === 'added' && (
        <p role="status" className="add-to-cart-message">
          {message.text}
        </p>
      )}
      {message?.kind === 'error' && (
        <p role="alert" className="form-error add-to-cart-message">
          {message.text}
        </p>
      )}
    </form>
  );
}
