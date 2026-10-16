// A single product's page (at /products/:productId). A placeholder for now: a later ticket will
// fetch the product from the API.

// useParams is a React Router "hook": a function, starting with `use`, that a component calls to
// read something from React. It returns the URL's parameters, here { productId: '42' }.
import { useParams } from 'react-router';

// A component is a function returning JSX; `export default` makes it this file's main export.
export default function ProductDetailPage() {
  // `const { productId } = ...` is destructuring: it takes the productId property out of the
  // object useParams() returns. URL parameters are always strings ('42', not 42).
  const { productId } = useParams();

  return (
    <section>
      <h1>Product</h1>
      {/* {productId} inside JSX inserts the variable's value into the text. */}
      <p>Product id: {productId}</p>
    </section>
  );
}
