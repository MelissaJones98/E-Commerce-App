// CartLink: the cart icon in the nav, with a badge showing how many items are in the cart.
// It's only drawn for logged-in customers (Layout.js decides). Clicking it opens the Cart page.
//
// The icon is a picture, so screen readers can't "see" it or the number on it. Instead the
// link gets an aria-label: a text name that screen readers read out (e.g. "Cart, 3 items"), and
// the picture and badge are hidden from them with aria-hidden, so nothing is read twice.

// NavLink: a link that marks itself active (aria-current="page") on the page it points to.
import { NavLink } from 'react-router';
import { useCart } from '../cart/CartContext';

// The link's name for screen readers, given the number of items in the cart.
//   count  a whole number of items, or null when it isn't known (still loading, or the cart
//          couldn't be loaded)
// Must return exactly:
//   null or 0  → 'Cart'            (no number to announce)
//   1          → 'Cart, 1 item'
//   2 or more  → 'Cart, 3 items'   (the number, then "items")
export function cartLabel(count) {
  if (count === 1) {
    return 'Cart, 1 item';
  } else if (count > 1) {
    return `Cart, ${count} items`;
  }
  return 'Cart';
}

// A simple shopping-cart drawing in SVG (Scalable Vector Graphics: shapes described as text,
// which the browser draws). viewBox sets the drawing's own coordinates (24 × 24 units), which
// are then scaled to width/height. stroke="currentColor" draws the lines in the link's text
// colour. aria-hidden="true" hides it from screen readers; focusable="false" stops some older
// browsers making it a Tab stop.
function CartIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="24"
      height="24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {/* The two wheels: circles at (9, 20) and (18, 20), radius 1.5. */}
      <circle cx="9" cy="20" r="1.5" />
      <circle cx="18" cy="20" r="1.5" />
      {/* The handle and basket: a path, where M moves the pen and L draws a line to a point. */}
      <path d="M2 3h3l2.5 12h11l2-8H6.2" />
    </svg>
  );
}

export default function CartLink() {
  const { itemCount } = useCart();

  return (
    // In JSX, attribute names follow JavaScript: aria-label stays as it is, but class becomes
    // className (and SVG's stroke-width becomes strokeWidth, above).
    <NavLink to="/cart" aria-label={cartLabel(itemCount)} className="cart-link">
      <CartIcon />
      {/* The badge only when there's at least one item. `itemCount > 0` is false for null too
          (null counts as 0 in a comparison), so an unknown count shows no badge. */}
      {itemCount > 0 && (
        <span className="cart-badge" aria-hidden="true">
          {itemCount}
        </span>
      )}
    </NavLink>
  );
}
