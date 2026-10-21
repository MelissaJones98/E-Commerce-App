// The app's route table: which component to show for each URL.
// It's a plain array, shared by the real app (App.js, browser router) and the tests
// (routes.test.js, memory router), so the tests check exactly what users get.

// Default imports (no braces): each file's main export.
import Layout from './components/Layout';
// `{ AuthProvider }`: a named import. It shares "who's logged in" with every page.
import { AuthProvider } from './auth/AuthContext';
// CartProvider shares the cart's item count (the nav badge) and addToCart() with every page.
import { CartProvider } from './cart/CartContext';
// Guards: RequireAuth for pages that need you logged in, GuestOnly for logged-out-only pages.
import RequireAuth from './auth/RequireAuth';
import GuestOnly from './auth/GuestOnly';
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
    // `element` is what to draw: the Layout component, inside AuthProvider so the nav and every
    // page below can find out who's logged in (with useAuth()), and inside CartProvider so they
    // can use the cart count (with useCart()). CartProvider goes INSIDE AuthProvider because it
    // needs to know who's logged in. Both sit inside the router, so their children can still use
    // React Router's hooks.
    element: (
      <AuthProvider>
        <CartProvider>
          <Layout />
        </CartProvider>
      </AuthProvider>
    ),
    // Child paths have no leading '/': they're relative to the parent ('cart' means '/cart').
    children: [
      // `index: true` means "the child for exactly '/'", i.e. the home page.
      { index: true, element: <ProductsPage /> },
      // ':productId' is a URL parameter: it matches any one segment (e.g. '42') and the page
      // reads it with useParams(). The name must match what the page reads.
      { path: 'products/:productId', element: <ProductDetailPage /> },
      // A route with an element but no path is a "layout route": it adds nothing to the URL,
      // but draws its element around its children. Here the element is a guard, which shows the
      // child page (through its <Outlet />) or sends the visitor somewhere else.
      {
        // Only for logged-out visitors.
        element: <GuestOnly />,
        children: [
          { path: 'register', element: <RegisterPage /> },
          { path: 'login', element: <LoginPage /> },
        ],
      },
      {
        // Only for logged-in customers.
        element: <RequireAuth />,
        children: [
          { path: 'account', element: <AccountPage /> },
          { path: 'cart', element: <CartPage /> },
          { path: 'checkout', element: <CheckoutPage /> },
          { path: 'orders', element: <OrdersPage /> },
          { path: 'orders/:orderId', element: <OrderDetailPage /> },
        ],
      },
      // '*' matches any URL no other route matched. React Router ranks routes by how specific
      // they are, not by their order, so this catch-all never hides a real page.
      { path: '*', element: <NotFoundPage /> },
    ],
  },
];
