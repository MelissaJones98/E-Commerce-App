// One order's page (at /orders/:orderId; RequireAuth makes sure someone is logged in). It fetches
// the order named in the URL and shows it as a centred card: "Order #12", a × back to Your
// Orders, and the order's contents (OrderSummary). It shows "Order not found" for an order that
// doesn't exist, belongs to someone else (the API answers the same for both, so nobody can find
// out which order numbers exist), or has an invalid id.

// useParams reads the :orderId part of the URL. Link changes page without reloading.
// useLocation gives the current location, including any `state` passed along with the page
// change (the checkout page passes { justPlaced: true } straight after paying).
// useNavigate gives navigate(), used here to clear that state from the history.
import { Link, useLocation, useNavigate, useParams } from 'react-router';
// useState remembers the page's state between re-draws; useEffect runs code after the page is
// drawn (here: fetching the order).
import { useEffect, useState } from 'react';
// getOrder(id): asks the API for one order (see api/orders.js).
import { getOrder } from '../api/orders';
// useAuth(): who's logged in, and setCustomer() to record that nobody is.
import { useAuth } from '../auth/AuthContext';
// The order's contents: items, total and address.
import OrderSummary from '../components/OrderSummary';

// The text link back to the list, used on the "not found" and error pages.
function BackLink() {
  return <Link to="/orders">Back to your orders</Link>;
}

export default function OrderDetailPage() {
  // URL parameters are always strings: '12', not 12.
  const { orderId } = useParams();
  const { setCustomer } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  // True only when the checkout page has just sent the customer here. `?.` reads justPlaced
  // only if there is a state (opening the page any other way has none, so this is undefined).
  // It's copied into state ONCE, when the page opens: useState(() => ...) only runs the function
  // the first time. That way the message stays on screen after the history is cleared below.
  const [justPlaced] = useState(() => location.state?.justPlaced === true);

  // The browser keeps a page's state in its history, so a reload (or Back, then Forward) would
  // bring { justPlaced: true } back and say thank you again. So straight away, replace this
  // history entry with the same address and no state. `replace: true` swaps the entry instead
  // of adding a new one, so Back still goes where it did before.
  useEffect(() => {
    if (location.state?.justPlaced) {
      navigate(location.pathname, { replace: true, state: null });
    }
    // Only when the page opens: the check above stops it doing anything a second time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // status: 'loading', 'ready' (the order arrived), 'not-found' or 'error'.
  const [state, setState] = useState({ status: 'loading', order: null });

  // Fetch the order, and fetch again whenever the id in the URL changes (going straight from one
  // order to another reuses this same component). See ProductDetailPage.js for this pattern.
  useEffect(() => {
    // `ignore` becomes true (in the cleanup below) if the page moves on before the answer
    // arrives, e.g. to another order; the late answer is then skipped instead of shown.
    let ignore = false;
    setState({ status: 'loading', order: null });
    getOrder(orderId)
      .then((order) => {
        if (!ignore) setState({ status: 'ready', order });
      })
      .catch((err) => {
        if (ignore) return;
        // 401: the login has expired. RequireAuth sends the visitor to Log in once nobody is
        // logged in, and brings them back here afterwards.
        if (err.status === 401) {
          setCustomer(null);
          return;
        }
        // 404: no such order (or not theirs). 400: the id isn't a number (e.g. /orders/abc).
        // `||` means "or". `notFound ? 'not-found' : 'error'` picks the first if notFound is
        // true, otherwise the second: any other failure is a loading error.
        const notFound = err.status === 404 || err.status === 400;
        setState({ status: notFound ? 'not-found' : 'error', order: null });
      });
    // The cleanup: React runs it before the effect runs again (a new orderId) or when the page
    // goes away.
    return () => {
      ignore = true;
    };
    // setCustomer is remade on every draw; only orderId should re-run this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId]);

  // An early `return` draws a different page for each of these states, so the code at the
  // bottom only deals with an order that has arrived.
  if (state.status === 'loading') return <p className="centred">Loading…</p>;

  if (state.status === 'not-found') {
    return (
      <section className="centred">
        <h1>Order not found</h1>
        <BackLink />
      </section>
    );
  }

  if (state.status === 'error') {
    return (
      <section className="centred">
        <p role="alert" className="form-error">
          Couldn't load this order. Please try again.
        </p>
        <BackLink />
      </section>
    );
  }

  // `const { order } = state` takes the order out of the state object (destructuring).
  const { order } = state;
  return (
    // The same centred card as the product page (product-detail), so the × sits in its corner.
    <section className="product-detail order-detail">
      {/* A × back to Your Orders. Its name for screen readers comes from aria-label; the "×"
          itself is hidden from them (see ProductDetailPage.js). */}
      <Link to="/orders" className="product-detail-close" aria-label="Back to your orders">
        <span aria-hidden="true">×</span>
      </Link>
      {/* {order.id} inside JSX inserts the number: "Order #12". */}
      <h1>Order #{order.id}</h1>
      {/* `justPlaced && (...)` draws the message only when justPlaced is true. role="status"
          lets screen readers announce it. */}
      {justPlaced && (
        <p role="status" className="order-thanks">
          Thank you, your order is confirmed
        </p>
      )}
      <OrderSummary order={order} />
    </section>
  );
}
