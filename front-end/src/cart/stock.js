// What the Cart page does when the API refuses a quantity because there isn't enough stock
// (a 409). The API's message for that reads exactly:
//     `Not enough stock: ${stock_quantity} available`        (back-end/routes/cart.js)
// e.g. "Not enough stock: 3 available". This file reads the number (N) out of that text. If
// the back end's wording ever changes, the regular expression below stops matching, and the
// customer simply sees the API's own message instead (and the tests in stock.test.js fail,
// as a reminder to update this file).

// Decides what to do about a 409.
//   currentQuantity  how many of this product the cart holds now, e.g. 6
//   apiMessage       the 409's message, e.g. 'Not enough stock: 3 available'
// Returns { quantity, kind, text }:
//   quantity  the number to set the cart to automatically, or null to change nothing
//   kind      'adjusted' (the quantity was changed for them) or 'error' (it wasn't)
//   text      the message to show under the row
//
// The four cases:
//   1. N is 1 or more, and less than currentQuantity (stock has dropped below what's in the
//      cart, so even − was refused):
//        { quantity: N, kind: 'adjusted', text: 'Only N in stock, so your quantity is now N.' }
//   2. N is currentQuantity or more (+ went past the stock):
//        { quantity: null, kind: 'error', text: 'Only N in stock.' }
//   3. N is 0 (sold out since it was added):
//        { quantity: null, kind: 'error',
//          text: 'Sorry, this is now out of stock. Please remove it from your cart.' }
//   4. The message doesn't contain "<number> available":
//        { quantity: null, kind: 'error', text: apiMessage }
//
// Hints:
//   - apiMessage.match(/(\d+) available/) returns null if there's no match; otherwise an array
//     whose item [1] is the text the brackets captured, e.g. '3'.
//   - That captured text is a string: Number('3') turns it into the number 3.
export function stockAdjustment(currentQuantity, apiMessage) {
  // Step 1: find "<number> available" in the message.
  const match = apiMessage.match(/(\d+) available/);

  // Step 2: no number found → show the API's message as it is.
  if (match === null) {
    return { quantity: null, kind: 'error', text: apiMessage };
  }

  // Step 3: the captured digits, as a number.
  const n = Number(match[1]);

  // Step 4: your three checks go here, in order:
  if (n === 0) { 
    return { quantity: null, kind: 'error', text: 'Sorry, this is now out of stock. Please remove it from your cart.' }; 
  }

  if (n < currentQuantity) { 
    return { quantity: n, kind: 'adjusted', text: `Only ${n} in stock, so your quantity is now ${n}.` }; 
  }

  return { quantity: null, kind: 'error', text: `Only ${n} in stock.` };
}
