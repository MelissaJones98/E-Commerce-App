// A single product's page (at /products/:productId): everything about one product, plus the
// quantity box and Add to cart button (AddToCart.js).
// It fetches the product named in the URL, and shows "Loading…" until it arrives, "Product not
// found" for a retired, unknown or invalid id, or an error if it can't be loaded.

// useParams is a React Router "hook": a function, starting with `use`, that a component calls to
// read something from React. It returns the URL's parameters, here { productId: '42' }.
// Link: a link that changes page without reloading the website.
import { Link, useParams } from 'react-router';
import { useEffect, useState } from 'react';
import { getProduct } from '../api/products';
import { formatPrice } from '../format';
import AddToCart from '../components/AddToCart';

// The link back to the grid, used on both the product and the "not found" page.
function BackLink() {
  return <Link to="/">← Back to products</Link>;
}

export default function ProductDetailPage() {
  // `const { productId } = ...` is destructuring: it takes the productId property out of the
  // object useParams() returns. URL parameters are always strings ('42', not 42).
  const { productId } = useParams();
  // status: 'loading', 'ready' (product arrived), 'not-found' or 'error'.
  const [state, setState] = useState({ status: 'loading', product: null });

  // Fetch the product, and fetch again whenever the id in the URL changes: going from one
  // product's page straight to another reuses this same component, so `[productId]` (the
  // "dependency array") tells React to re-run this effect when productId is different.
  useEffect(() => {
    let ignore = false; // set by the cleanup below if the page moves on before the answer
    setState({ status: 'loading', product: null });
    getProduct(productId)
      .then((product) => {
        if (!ignore) setState({ status: 'ready', product });
      })
      .catch((err) => {
        if (ignore) return;
        // 404: no such product, or it's been retired. 400: the id isn't a number at all (e.g.
        // /products/abc). Either way, there's no product here to show.
        // `||` means "or".
        const notFound = err.status === 404 || err.status === 400;
        setState({ status: notFound ? 'not-found' : 'error', product: null });
      });
    // The cleanup runs before the effect runs again (a new productId) or when the page goes.
    return () => {
      ignore = true;
    };
  }, [productId]);

  // An early `return` draws a different page for these states, so the code below only deals
  // with a product that has arrived.
  if (state.status === 'loading') return <p>Loading…</p>;

  if (state.status === 'not-found') {
    return (
      <section>
        <h1>Product not found</h1>
        <p>This product isn't in the shop. It may have been removed.</p>
        <BackLink />
      </section>
    );
  }

  if (state.status === 'error') {
    return (
      <section>
        <p role="alert" className="form-error">
          Couldn't load this product. Please try again.
        </p>
        <BackLink />
      </section>
    );
  }

  // `const { product } = state` takes product out of the state object.
  const { product } = state;
  return (
    <section className="product-detail">
      <BackLink />
      <h1>{product.name}</h1>
      {/* Only drawn when there is a description, so null never shows as "null". */}
      {product.description && <p>{product.description}</p>}
      <p className="product-detail-price">{formatPrice(product.price)}</p>
      {/* {...} inside the text inserts the number, e.g. "42 in stock". */}
      <p>{product.stock_quantity} in stock</p>
      {/* The quantity box and Add to cart button (or "Out of stock"). */}
      <AddToCart product={product} />
    </section>
  );
}
