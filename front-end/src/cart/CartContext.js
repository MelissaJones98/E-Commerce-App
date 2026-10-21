// CartContext: the app-wide copy of the logged-in customer's cart. The Cart page shows it in
// full, the cart icon in the nav shows how many items it holds, and the functions here
// (addToCart, updateQuantity, removeItem, refresh) change or reload it, so every part of the
// app updates at once.
//
// It works the same way as AuthContext (read that first): <CartProvider> holds the state, and
// any component inside it reads it with the useCart() hook. It sits INSIDE <AuthProvider>
// (see routes.js), because it needs to know who's logged in.
//
// The cart is always the server's own copy: every change sends a request, and the cart is
// replaced by whatever the API sends back. Nothing is worked out in the browser, so the badge,
// the Cart page and the server can never disagree (and money is never added up here).

import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { addCartItem, getCart, removeCartItem, setCartQuantity } from '../api/cart';
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
  // The cart as the API last sent it, { items: [...], total }, or null when it isn't known
  // (still loading, it failed to load, or nobody is logged in).
  const [cart, setCart] = useState(null);
  // A counter that goes up whenever the cart's "situation" changes: someone logs in or out, or
  // the cart is changed or reloaded. Each request remembers the number when it was sent, and its
  // answer is only used if the number hasn't changed since. Otherwise the answer is out of date:
  // e.g. the cart of a customer who has since logged out, or a cart from BEFORE a change that
  // has already finished. It's the same idea as knownRef in AuthContext. A ref (not state)
  // because changing it shouldn't re-draw anything.
  const versionRef = useRef(0);

  // Stores `newCart` if nothing has changed since the request that fetched it was sent (when
  // the version was `version`). Then bumps the version, so anything sent before this answer is
  // now out of date. Returns true if it stored the cart.
  function applyIfCurrent(version, newCart) {
    if (versionRef.current !== version) return false;
    versionRef.current += 1; // `+= 1` adds one
    setCart(newCart);
    return true;
  }

  // Runs when the app first knows who's logged in, and again whenever that changes (the
  // dependency array lists both values it reads).
  useEffect(() => {
    versionRef.current += 1; // the situation has changed: older answers no longer count
    const version = versionRef.current;

    // Still checking, or nobody logged in: there's no cart, and asking would just get a 401.
    if (checking || !customer) {
      setCart(null);
      return;
    }

    getCart()
      .then((loaded) => applyIfCurrent(version, loaded))
      .catch(() => {
        // The badge isn't important enough to show an error for: just show no number. (The
        // Cart page calls refresh() itself, and shows its own error.)
        if (versionRef.current === version) setCart(null);
      });
    // applyIfCurrent is a plain function remade on every draw; leaving it out of the list is
    // deliberate (it only reads the ref and calls setCart), so the next line tells the linter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customer, checking]);

  // The product page calls this to add `quantity` of a product. The API replies with the whole
  // updated cart, which replaces ours. If the API refuses (e.g. 409, not enough stock),
  // addCartItem throws: the cart is left as it was, and the Error goes on to the page to show
  // (`await` passes a rejection along).
  async function addToCart(productId, quantity) {
    const version = versionRef.current;
    applyIfCurrent(version, await addCartItem(productId, quantity));
  }

  // The Cart page calls this for − and +: sets a product's quantity, and stores the cart the
  // API sends back. Errors go on to the page, as above.
  async function updateQuantity(productId, quantity) {
    const version = versionRef.current;
    applyIfCurrent(version, await setCartQuantity(productId, quantity));
  }

  // The Cart page calls this for ×: removes a product. The API sends nothing back (204), so the
  // cart is then loaded again to get the new items and total.
  async function removeItem(productId) {
    const version = versionRef.current;
    await removeCartItem(productId);
    // Logged out (or something else changed) while removing? Then the reload isn't wanted.
    if (versionRef.current !== version) return;
    applyIfCurrent(version, await getCart());
  }

  // Loads the cart again, e.g. when the Cart page opens, so it never shows an out-of-date cart
  // (one changed in another tab, say). Unlike the automatic load above, a failure here is
  // passed on, so the Cart page can show an error.
  //   keepOnError  false (the default): a failure forgets the old cart (it may be out of date).
  //                true: a failure keeps the cart that's showing, e.g. when reloading after one
  //                row went wrong, so a network blip doesn't wipe the whole cart off the page.
  // `{ keepOnError = false } = {}` destructures an options object with a default value, and
  // `= {}` lets refresh() be called with no argument at all.
  async function refresh({ keepOnError = false } = {}) {
    const version = versionRef.current;
    try {
      applyIfCurrent(version, await getCart());
    } catch (err) {
      if (!keepOnError && versionRef.current === version) setCart(null);
      throw err; // hand the Error on to whoever called refresh()
    }
  }

  // The number on the badge: the total quantity, or null while the cart isn't known.
  const itemCount = cart ? countItems(cart) : null;

  return (
    <CartContext.Provider
      value={{ cart, itemCount, addToCart, updateQuantity, removeItem, refresh }}
    >
      {children}
    </CartContext.Provider>
  );
}

// The hook components use, e.g. const { cart, itemCount, addToCart } = useCart();
export function useCart() {
  const value = useContext(CartContext);
  if (!value) throw new Error('useCart() must be used inside <CartProvider>');
  return value;
}
