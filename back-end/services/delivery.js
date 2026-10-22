// The delivery charge rule, in one place. GET /cart (routes/cart.js) uses it to
// show the customer what they'll pay, and POST /cart/checkout
// (routes/checkout.js) uses it to work out what to charge. Because both use
// this same function, the amount on the Pay button and the amount charged can
// never disagree.
//
// The rule: delivery costs £3.95, and is free when the items come to £30.00 or
// more (exactly £30.00 is free). Everything here is in whole pence, so the
// maths is exact (see utils/money.js for why).

// The charge, in pence: £3.95.
export const DELIVERY_CHARGE_PENCE = 395;

// The amount of items, in pence, from which delivery is free: £30.00.
export const FREE_DELIVERY_THRESHOLD_PENCE = 3000;

// Returns the delivery charge in pence for `itemsPence` pence of items:
//   0 (nothing to deliver)  -> 0
//   2999 (£29.99)           -> 395
//   3000 (£30.00) or more   -> 0
export const deliveryChargePence = (itemsPence) => {
  // Free in two cases: there's nothing to deliver (0p of items), or the items
  // reach the threshold. `||` means "or"; `>=` makes exactly £30.00 count as free.
  if ((itemsPence === 0) || (itemsPence >= FREE_DELIVERY_THRESHOLD_PENCE)) {
    return 0;
  } else {
    // Anything else, from 1p to £29.99, pays the standard charge.
    return DELIVERY_CHARGE_PENCE;
  }
};
