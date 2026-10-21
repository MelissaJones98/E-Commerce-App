// CartContext: the app-wide count of items in the logged-in customer's cart, shown as the
// number on the cart icon in the nav (CartLink.js), and the addToCart() function the product
// page uses, so that adding something updates that number everywhere at once.
//
// It works the same way as AuthContext (read that first): <CartProvider> holds the state, and
// any component inside it reads it with the useCart() hook. It sits INSIDE <AuthProvider>
// (see routes.js), because it needs to know who's logged in.

import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { addCartItem, getCart } from '../api/cart';
import { useAuth } from '../auth/AuthContext';

const CartContext = createContext(null);

// The number of items in a cart: the total of every item's quantity, so 2 mugs and 1 teapot
// count as 3 (the same way the API counts items in an order).
// .reduce() walks through the array, carrying a running result: it starts at 0 (the second
// argument), and for each item, (sum, item) => sum + item.quantity gives the new running total.
export function countItems(cart) {
  return cart.items.reduce((sum, item) => sum + item.quantity, 0);
}

export function CartProvider({ children }) {
  // Who's logged in, and whether the app is still finding out (see AuthContext.js).
  const { customer, checking } = useAuth();
  // The number on the badge, or null when it isn't known (still loading, it failed to load, or
  // nobody is logged in). null and 0 are different: 0 means "known to be empty".
  const [itemCount, setItemCount] = useState(null);
  // A counter that goes up whenever the count's "situation" changes: someone logs in or out, or
  // an item is added. Each request remembers the number when it was sent, and its answer is
  // only used if the number hasn't changed since. Otherwise the answer is out of date: e.g. the
  // cart of a customer who has since logged out, or a cart from BEFORE an add that has already
  // finished. It's the same idea as knownRef in AuthContext. A ref (not state) because changing
  // it shouldn't re-draw anything.
  const versionRef = useRef(0);

  // Runs when the app first knows who's logged in, and again whenever that changes (the
  // dependency array lists both values it reads).
  useEffect(() => {
    versionRef.current += 1; // `+= 1` adds one: the situation has changed
    const version = versionRef.current;

    // Still checking, or nobody logged in: there's no cart to count, and asking would just get
    // a 401. `return` ends the effect here.
    if (checking || !customer) {
      setItemCount(null);
      return;
    }

    getCart()
      .then((cart) => {
        if (versionRef.current === version) setItemCount(countItems(cart));
      })
      .catch(() => {
        // The badge isn't important enough to show an error for: just show no number.
        if (versionRef.current === version) setItemCount(null);
      });
  }, [customer, checking]);

  // The product page calls this to add `quantity` of a product. The API replies with the whole
  // updated cart, and the count is taken from that: the server's own number, which stays right
  // even if the cart was changed somewhere else too (e.g. another tab).
  // If the API refuses (e.g. 409, not enough stock), addCartItem throws: the count is left as
  // it was, and the Error goes on to the page to show (`await` passes a rejection along).
  async function addToCart(productId, quantity) {
    const version = versionRef.current;
    const cart = await addCartItem(productId, quantity);
    // Skip it if the customer logged out (or in) while the request was on its way.
    if (versionRef.current !== version) return;
    versionRef.current += 1; // anything sent before this add is now out of date
    setItemCount(countItems(cart));
  }

  return (
    <CartContext.Provider value={{ itemCount, addToCart }}>{children}</CartContext.Provider>
  );
}

// The hook components use: const { itemCount, addToCart } = useCart();
export function useCart() {
  const value = useContext(CartContext);
  if (!value) throw new Error('useCart() must be used inside <CartProvider>');
  return value;
}
