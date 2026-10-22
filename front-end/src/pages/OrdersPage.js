// Your Orders (at /orders; RequireAuth makes sure someone is logged in): a table of every order
// the customer has placed, newest first, with its number, date, status and total. Each order's
// number links to its own page (/orders/12).

// Link: a link that changes page without reloading the whole website.
import { Link } from 'react-router';
// useState remembers the page's state between re-draws; useEffect runs code after the page is
// drawn (here: fetching the orders).
import { useEffect, useState } from 'react';
// getOrders(): asks the API for the customer's orders (see api/orders.js).
import { getOrders } from '../api/orders';
// useAuth(): who's logged in, and setCustomer() to record that nobody is.
import { useAuth } from '../auth/AuthContext';
// The formatting helpers: "21 Oct 2026", "£44.50", "Paid".
import { formatDate, formatPrice, formatStatus } from '../format';

export default function OrdersPage() {
  const { setCustomer } = useAuth();
  // status: 'loading', 'ready' (the list arrived) or 'error'; orders: the list.
  const [state, setState] = useState({ status: 'loading', orders: [] });

  // Fetch the orders once, when the page opens (see ProductsPage.js for this pattern).
  useEffect(() => {
    let ignore = false; // set by the cleanup if the page closes before the answer
    getOrders()
      .then((orders) => {
        if (!ignore) setState({ status: 'ready', orders });
      })
      .catch((err) => {
        if (ignore) return;
        // 401: the login has expired. Recording that nobody is logged in is enough: RequireAuth
        // (which guards this page) then sends the visitor to Log in, and back here afterwards.
        if (err.status === 401) {
          setCustomer(null);
          return;
        }
        setState({ status: 'error', orders: [] });
      });
    // The cleanup: React runs it when the page goes away.
    return () => {
      ignore = true;
    };
    // Only when the page opens: setCustomer is remade on every draw, so it's left out on purpose.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <section>
      <h1 className="centred">Your Orders</h1>

      {/* Exactly one of the four parts below is drawn, depending on the state.
          `condition && (...)` draws the part in brackets only when the condition is true. */}
      {state.status === 'loading' && <p className="centred">Loading…</p>}

      {state.status === 'error' && (
        <p role="alert" className="form-error centred">
          Couldn't load your orders. Please try again.
        </p>
      )}

      {state.status === 'ready' && state.orders.length === 0 && (
        <div className="orders">
          <p>You haven't placed any orders yet.</p>
          <Link to="/">Browse products</Link>
        </div>
      )}

      {state.status === 'ready' && state.orders.length > 0 && (
        <div className="orders">
          {/* A real <table>: screen readers announce it as a table and read each cell with
              its column header ("Date, 21 Oct 2026"). */}
          <table className="orders-table">
            {/* The table's name for screen readers. visually-hidden keeps it off the screen,
                because the page heading already says what the table is. */}
            <caption className="visually-hidden">Your past orders</caption>
            {/* <thead> holds the header row; each <th> is a column header. scope="col" says
                the header belongs to the column below it. */}
            <thead>
              <tr>
                <th scope="col">Order</th>
                <th scope="col">Date</th>
                <th scope="col">Status</th>
                <th scope="col" className="orders-total">
                  Total
                </th>
              </tr>
            </thead>
            {/* <tbody> holds one row (<tr>) per order, with a cell (<td>) per column. .map()
                turns each order into a row; the order's id is its unique `key`. The link's
                address is a template literal: `/orders/${order.id}` gives '/orders/12'. */}
            <tbody>
              {state.orders.map((order) => (
                <tr key={order.id}>
                  <td>
                    <Link to={`/orders/${order.id}`}>Order #{order.id}</Link>
                  </td>
                  <td>{formatDate(order.created_at)}</td>
                  <td>{formatStatus(order.status)}</td>
                  <td className="orders-total">{formatPrice(order.total_amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
