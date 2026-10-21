// The Log in page (at /login). Customers log in with their email and password, or with
// Google or Facebook. Either way the API starts a session (sets the cookie), and they're taken
// to the Products page.
//
// The email form is a "controlled" form, like the Register page: React state holds what's
// typed in each field, and each input displays that state.

// useState: a value that survives re-draws (see RegisterPage.js).
// useEffect: runs code AFTER the page has been drawn, e.g. to fetch data when it first appears.
import { useEffect, useState } from 'react';
// Link: a link that changes page without reloading.
// useSearchParams: reads the ?name=value part of the address, e.g. ?error=cancelled.
// useLocation: the current address, plus any `state` passed when navigating here.
import { Link, useLocation, useSearchParams } from 'react-router';
// getProviders(): which "Sign in with..." providers are on. login(): sends the email and
// password to the API (see ../api/auth.js). NO_PROVIDERS: "none are on".
import { getProviders, login, NO_PROVIDERS } from '../api/auth';
// useAuth(): the app-wide record of who's logged in (see ../auth/AuthContext.js).
import { useAuth } from '../auth/AuthContext';

// The display names for each provider, used in messages and on the buttons.
const PROVIDER_NAMES = { google: 'Google', facebook: 'Facebook' };

// The fallback message for any sign-in problem we don't have a specific message for.
const GENERAL_SIGN_IN_ERROR = 'Something went wrong signing you in. Please try again.';

// When Google or Facebook sign-in doesn't work, the API sends the browser back here with
// ?error=<code>&provider=<provider>. This turns that into a message for the customer.
// Returns null when there's no error.
// The code is never shown itself: anyone can type any ?error= into the address bar, so only
// known codes get their own message, and everything else gets the general one.
// `export` so it could be reused or tested on its own.
export function oauthErrorMessage(code, provider) {
  if (!code) return null;
  if (code === 'cancelled') return 'Sign-in was cancelled.';

  // The provider's display name, or undefined if `provider` isn't one we know.
  // Object.hasOwn checks the key really belongs to PROVIDER_NAMES (so e.g. "toString",
  // which every object inherits, doesn't count).
  const name = Object.hasOwn(PROVIDER_NAMES, provider) ? PROVIDER_NAMES[provider] : undefined;
  // The two messages below name the provider, so without a known one, use the general message.
  if (!name) return GENERAL_SIGN_IN_ERROR;

  if (code === 'no_email') {
    // `...${name}...` is a "template literal": ${} inserts the value into the text.
    return `${name} didn't share your email address, so we couldn't sign you in. Please allow email access or use another way to log in.`;
  }
  if (code === 'email_unverified') {
    return `Your ${name} email address isn't verified, so we couldn't sign you in.`;
  }
  return GENERAL_SIGN_IN_ERROR;
}

// A component is a function returning JSX; `export default` makes it this file's main export.
export default function LoginPage() {
  // searchParams.get('error') reads ?error=... from the address (null if it isn't there).
  // The `[searchParams]` destructuring ignores the hook's second value (a setter we don't need).
  const [searchParams] = useSearchParams();
  // location.state may hold { from: the page they wanted } (from RequireAuth or Add to cart).
  // The Register link below passes it on, so it isn't lost if they register instead.
  const location = useLocation();

  // form: what's typed in each field. Its keys match the API's login fields exactly.
  const [form, setForm] = useState({ email: '', password: '' });
  // error: the message to show, or null. Passing a FUNCTION to useState runs it only once,
  // when the page first appears ("lazy initial state"), so a Google or Facebook sign-in error
  // in the address is shown straight away, and a later form error can replace it.
  const [error, setError] = useState(() =>
    oauthErrorMessage(searchParams.get('error'), searchParams.get('provider')),
  );
  // submitting: true while waiting for the API, so the button can be disabled.
  const [submitting, setSubmitting] = useState(false);
  // providers: which "Sign in with..." links to show. Starts as "none" until the API answers.
  const [providers, setProviders] = useState(NO_PROVIDERS);
  // setCustomer(customer) tells the whole app who's now logged in (the nav updates straight away).
  const { setCustomer } = useAuth();

  // Ask the API which providers are on, once, when the page first appears.
  // The empty array `[]` at the end means "run this only once", not after every re-draw.
  // getProviders() never fails (it gives NO_PROVIDERS instead), so no catch is needed.
  useEffect(() => {
    getProviders().then(setProviders);
  }, []);

  // Runs on every keystroke in either field (the same as on the Register page).
  function handleChange(event) {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  }

  // Runs when the form is submitted (the Log in button, or Enter in a field).
  async function handleSubmit(event) {
    // Stop the browser's normal form submission, which would reload the whole page.
    event.preventDefault();

    // Log the customer in with the email and password in `form`.
    // On success, record who's logged in; on failure, show the error and let them retry.

    // "busy" state
    setError(null); // clears an old error message (including one from Google or Facebook)
    // disables the submit button and shows "Logging in…" so the user knows something is
    // happening
    setSubmitting(true);

    try {
      // send the email and password to the API; this logs the customer in (sets the cookie).
      // `form` already holds exactly those two fields, so it can be sent as it is.
      // login() gives back the logged-in customer; record them for the whole app.
      // There's no navigate() here: the login page sits inside GuestOnly (../auth/GuestOnly.js),
      // which sees someone is now logged in and sends them on: to the page they wanted, or
      // Products. One place doing the redirect means two redirects can't race each other.
      setCustomer(await login(form));
    } catch (err) {
      setError(err.message); // show error and stop
      setSubmitting(false); // resets the submit button so the user can try again
    }
  }

  // The providers that are switched on, in the order the buttons appear.
  // Object.keys() gives ['google', 'facebook']; .filter() keeps those that are true.
  const enabled = Object.keys(PROVIDER_NAMES).filter((provider) => providers[provider]);

  return (
    // className="auth-page" centres the heading and the form on the page (see App.css).
    <section className="auth-page">
      <h1>Log in</h1>

      <form onSubmit={handleSubmit} className="form">
        {/* htmlFor links each label to its input, for clicks and screen readers. */}
        <label htmlFor="email">Email</label>
        {/* autoComplete="email" lets browsers and password managers fill in the email. */}
        <input
          id="email"
          name="email"
          type="email"
          value={form.email}
          onChange={handleChange}
          autoComplete="email"
          required
        />

        <label htmlFor="password">Password</label>
        {/* "current-password" tells password managers to fill in the SAVED password (the
            Register page uses "new-password" to suggest a new one instead). */}
        <input
          id="password"
          name="password"
          type="password"
          value={form.password}
          onChange={handleChange}
          autoComplete="current-password"
          required
        />

        {/* Shown only when there's an error. role="alert" makes screen readers announce it. */}
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}

        {/* disabled={submitting} stops a second click while the first request is in flight. */}
        <button type="submit" disabled={submitting}>
          {submitting ? 'Logging in…' : 'Log in'}
        </button>
      </form>

      {/* The "Sign in with..." buttons, only if at least one provider is on.
          `enabled.length > 0 && (...)` draws nothing when the list is empty. */}
      {enabled.length > 0 && (
        <>
          <p className="divider">or</p>
          {/* These are plain <a> links, not React Router <Link>s, because they must leave the
              React app: the browser really visits /auth/google, and the API redirects it to
              Google. (setupProxy.js passes that visit on to the API in development.) */}
          {enabled.map((provider) => (
            <a key={provider} href={`/auth/${provider}`} className={`provider-button ${provider}`}>
              Sign in with {PROVIDER_NAMES[provider]}
            </a>
          ))}
        </>
      )}

      {/* For people who don't have an account yet. state={location.state} passes the note
          saying which page they wanted on to Register, so registering takes them there too.
          (A <Link> without `state` starts with none, which would lose it.) */}
      <p>
        Don't have an account?{' '}
        <Link to="/register" state={location.state}>
          Register
        </Link>
      </p>
    </section>
  );
}
