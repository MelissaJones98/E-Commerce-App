// A single order's page (at /orders/:orderId). A placeholder for now: a later ticket fetches the
// order's details from the API.

// useParams is a React Router "hook": a function, starting with `use`, that a component calls to
// read something from React. It returns the URL's parameters, here { orderId: '7' }.
import { useParams } from 'react-router';

// A component is a function returning JSX; `export default` makes it this file's main export.
export default function OrderDetailPage() {
  // Destructuring: take the orderId property out of the object useParams() returns.
  // URL parameters are always strings ('7', not 7).
  const { orderId } = useParams();

  return (
    <section>
      <h1>Order</h1>
      {/* {orderId} inside JSX inserts the variable's value into the text. */}
      <p>Order id: {orderId}</p>
    </section>
  );
}
