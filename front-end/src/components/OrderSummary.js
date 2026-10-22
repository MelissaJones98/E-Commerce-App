// OrderSummary: the contents of one order's card: when it was placed and its status, a row per
// item (the price paid, the quantity, the row's price), the total, and the delivery address.
//
// It takes an order exactly as the API sends it (GET /orders/:id, or POST /cart/checkout,
// which returns the same shape). It deliberately leaves out the heading and the × link: the
// order page adds "Order #12" and a × back to the list, and the Checkout ticket can add its
// own heading and "Thank you" message around the same summary.
//
// Every price comes from the API: unit_price is the price PAID (frozen at checkout, so it
// never changes even if the shop's price does), and line_total and total_amount were worked
// out exactly by the database. This component only formats them.

// The formatting helpers: "£44.50", "21 Oct 2026", "Paid".
import { formatDate, formatPrice, formatStatus } from '../format';
// addressLines(): the delivery address as a list of lines, with empty parts left out.
import { addressLines } from '../orders/address';

// `{ order }` destructures the props: <OrderSummary order={order} /> gives order = that order.
export default function OrderSummary({ order }) {
  // The number of items: the total of the quantities (2 serums + 1 cream = 3).
  // .reduce() walks through the items carrying a running total: it starts at 0 (the second
  // argument), and for each item, (sum, item) => sum + item.quantity gives the new total.
  const count = order.items.reduce((sum, item) => sum + item.quantity, 0);

  return (
    // <>...</> is a "fragment": it groups the parts below without adding an extra element,
    // so they sit directly inside whatever card the page puts this summary in.
    <>
      {/* "Placed 21 Oct 2026 · Paid" */}
      <p className="order-placed">
        Placed {formatDate(order.created_at)} · {formatStatus(order.status)}
      </p>

      {/* One row per item. .map() turns each item into an <li>; React needs a unique `key` on
          each, and an order holds each product once, so its product_id is unique. */}
      <ul className="order-items">
        {order.items.map((item) => (
          <li key={item.product_id} className="order-item">
            {/* The name with "£18.50 each" under it, styled the same as in the cart (the
                cart-item-... classes in App.css). */}
            <div className="cart-item-name">
              <strong>{item.name}</strong>
              <span className="cart-item-each">{formatPrice(item.unit_price)} each</span>
            </div>
            <span>× {item.quantity}</span>
            <span className="order-item-total">{formatPrice(item.line_total)}</span>
          </li>
        ))}
      </ul>

      {/* "Total (3 items)  £44.50", on the right. `count === 1 ? a : b` picks "1 item" for a
          single item, otherwise "3 items" (a template literal: ${count} inserts the number). */}
      <p className="cart-subtotal">
        <span>Total ({count === 1 ? '1 item' : `${count} items`})</span>
        <strong>{formatPrice(order.total_amount)}</strong>
      </p>

      {/* The delivery address, one line per part (empty parts are left out by addressLines). */}
      <div className="order-address">
        <h2>Delivered to</h2>
        <ul>
          {/* .map((line, index) => ...) also gives each line's position (0, 1, 2...). The
              position is a fine key here: the lines never move or change order. */}
          {addressLines(order.shipping_address).map((line, index) => (
            <li key={index}>{line}</li>
          ))}
        </ul>
      </div>
    </>
  );
}
