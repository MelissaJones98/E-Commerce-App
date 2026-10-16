// The Products page (the home page, at '/'). A placeholder for now: a later ticket will fetch
// the products from the API and list them here.

// A component is a function returning JSX; `export default` makes it this file's main export.
export default function ProductsPage() {
  return (
    // A <section> groups the page's content. Every page has exactly one <h1>.
    <section>
      <h1>Products</h1>
      <p>Browse everything in the shop. (Coming soon.)</p>
    </section>
  );
}
