// The app's route table: which component to show for each URL.
// It's a plain array, shared by the real app (App.js, browser router) and the tests
// (routes.test.js, memory router), so the tests check exactly what users get.

// Default imports (no braces): each file's main export.
import Layout from './components/Layout';
import ProductsPage from './pages/ProductsPage';
import ProductDetailPage from './pages/ProductDetailPage';
import RegisterPage from './pages/RegisterPage';
import LoginPage from './pages/LoginPage';
import AccountPage from './pages/AccountPage';
import CartPage from './pages/CartPage';
import CheckoutPage from './pages/CheckoutPage';
import OrdersPage from './pages/OrdersPage';
import OrderDetailPage from './pages/OrderDetailPage';
import NotFoundPage from './pages/NotFoundPage';

// `export const` makes `routes` a named export (imported as `import { routes } from './routes'`).
export const routes = [
  {
    // The layout route matches every URL that starts with '/' (all of them) and draws Layout.
    // Layout's <Outlet /> then shows whichever child below matches the rest of the URL.
    path: '/',
    // `element` is what to draw: JSX for the Layout component.
    element: <Layout />,
    // Child paths have no leading '/': they're relative to the parent ('cart' means '/cart').
    children: [
      // `index: true` means "the child for exactly '/'", i.e. the home page.
      { index: true, element: <ProductsPage /> },
      // ':productId' is a URL parameter: it matches any one segment (e.g. '42') and the page
      // reads it with useParams(). The name must match what the page reads.
      { path: 'products/:productId', element: <ProductDetailPage /> },
      { path: 'register', element: <RegisterPage /> },
      { path: 'login', element: <LoginPage /> },
      { path: 'account', element: <AccountPage /> },
      { path: 'cart', element: <CartPage /> },
      { path: 'checkout', element: <CheckoutPage /> },
      { path: 'orders', element: <OrdersPage /> },
      { path: 'orders/:orderId', element: <OrderDetailPage /> },
      // '*' matches any URL no other route matched. React Router ranks routes by how specific
      // they are, not by their order, so this catch-all never hides a real page.
      { path: '*', element: <NotFoundPage /> },
    ],
  },
];
