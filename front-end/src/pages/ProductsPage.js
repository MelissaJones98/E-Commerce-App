// The Products page (the home page, at '/'): every product in the shop, as a grid of cards.
// It asks the API for the products when it first appears, and shows "Loading…" until they
// arrive, a message if the shop is empty, or an error if they can't be loaded.

// useState remembers values between re-draws; useEffect runs code after the page is drawn
// (here: fetching the products).
import { useEffect, useState } from 'react';
import { getProducts } from '../api/products';
import ProductList from '../components/ProductList';

export default function ProductsPage() {
  // One state object for the whole page:
  //   status    'loading' (waiting for the API), 'ready' (products arrived) or 'error'
  //   products  the list, once it has arrived
  // Keeping both in one object means they always change together.
  const [state, setState] = useState({ status: 'loading', products: [] });

  // Fetch the products once, when the page first appears (the empty array `[]` means "run only
  // once").
  useEffect(() => {
    // `ignore` becomes true if the page goes away (e.g. the customer clicks a product) before
    // the answer arrives. Setting state on a page that's gone is pointless, so it's skipped.
    let ignore = false;
    getProducts()
      // .then(fn) runs fn with the products once the request succeeds; .catch(fn) runs if it
      // fails. Any failure shows the same friendly message, so the error itself isn't needed.
      .then((products) => {
        if (!ignore) setState({ status: 'ready', products });
      })
      .catch(() => {
        if (!ignore) setState({ status: 'error', products: [] });
      });
    // The function useEffect returns is its "cleanup": React runs it when the page goes away.
    return () => {
      ignore = true;
    };
  }, []);

  return (
    <section>
      {/* className="centred" centres the heading (see App.css). */}
      <h1 className="centred">Products</h1>
      {/* Exactly one of these four is drawn, depending on the status. */}
      {state.status === 'loading' && <p>Loading…</p>}
      {/* role="alert" makes screen readers announce the error as soon as it appears. */}
      {state.status === 'error' && (
        <p role="alert" className="form-error">
          Couldn't load products. Please try again.
        </p>
      )}
      {state.status === 'ready' && state.products.length === 0 && <p>No products yet.</p>}
      {state.status === 'ready' && state.products.length > 0 && (
        <ProductList products={state.products} />
      )}
    </section>
  );
}
