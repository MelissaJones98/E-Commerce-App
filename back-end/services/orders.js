// Reading orders from the database, shared by the checkout route (which
// returns the order it just created) and GET /orders/:orderId (which
// returns a past order). Keeping it in one place means a customer always
// sees an order in exactly the same shape.

// Fetches one order with its shipping address and items, or returns null if
// there's no such order FOR THIS CUSTOMER.
//
// Parameters:
//   db          anything with a .query() method: the pool (for normal reads),
//               or a client in the middle of a transaction (checkout reads the
//               order back before COMMIT, so it must use its own connection,
//               which can see the not-yet-committed rows)
//   customerId  the logged-in customer. Filtering by it means a customer can
//               never read someone else's order, even by guessing its id.
//   orderId     the order to fetch
export const getOrderDetails = async (db, customerId, orderId) => {
  // The order itself. `AND customer_id = $2` is the ownership check: another
  // customer's order simply isn't found.
  // items_total is what the items came to: the total minus delivery, worked out
  // by PostgreSQL's exact decimal maths so the browser never has to subtract
  // money. `AS items_total` names the result. payment_reference is deliberately
  // NOT selected: it's for the shop, not the customer.
  const orderResult = await db.query(
    `SELECT id, status, total_amount, delivery_charge,
            (total_amount - delivery_charge)::numeric(12,2) AS items_total,
            created_at, shipping_address_id
     FROM orders
     WHERE id = $1 AND customer_id = $2`,
    [orderId, customerId]
  );
  // No row: the order doesn't exist, or belongs to someone else. The caller
  // treats both the same way (404), so nothing about other customers leaks.
  if (orderResult.rows.length === 0) return null;

  // Destructuring with "rest": take shipping_address_id out (it's only needed
  // for the next query) and keep everything else as `order`.
  const { shipping_address_id, ...order } = orderResult.rows[0];

  // The address the order was shipped to.
  const addressResult = await db.query(
    `SELECT id, line_1, line_2, city, region, postal_code, country_code
     FROM addresses
     WHERE id = $1`,
    [shipping_address_id]
  );

  // The order's items. unit_price comes from order_items, NOT products: it's
  // the price frozen at checkout, so later price changes don't alter it.
  // The product is joined only for its SKU and name, and there's no
  // is_active filter: retired products still appear in past orders.
  // ::numeric(12,2) gives each line total exactly 2 decimal places, e.g. '17.00'.
  const itemsResult = await db.query(
    `SELECT oi.product_id, p.sku, p.name, oi.quantity, oi.unit_price,
            (oi.unit_price * oi.quantity)::numeric(12,2) AS line_total
     FROM order_items AS oi
     JOIN products AS p ON p.id = oi.product_id
     WHERE oi.order_id = $1
     ORDER BY oi.product_id`,
    [orderId]
  );

  // Spread syntax (`...order`) copies id, status, total_amount, delivery_charge,
  // items_total and created_at into the result alongside the address and items.
  return { ...order, shipping_address: addressResult.rows[0], items: itemsResult.rows };
};
