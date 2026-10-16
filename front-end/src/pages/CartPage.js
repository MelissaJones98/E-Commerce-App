// The Cart page (at /cart). A placeholder for now: a later ticket fetches the cart from the API.

// Link changes page without reloading the whole website. `{ Link }` is a named import.
import { Link } from 'react-router';

// A component is a function returning JSX; `export default` makes it this file's main export.
export default function CartPage() {
  return (
    <section>
      <h1>Your cart</h1>
      <p>The items in your cart. (Coming soon.)</p>
      {/* Checkout isn't in the nav bar: customers reach it from their cart. */}
      <Link to="/checkout">Go to checkout</Link>
    </section>
  );
}
