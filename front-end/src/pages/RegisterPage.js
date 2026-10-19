// The Register page (at /register): a form to create an account. Registering also signs the
// customer in (the API sets the session cookie), and then they're taken to the Products page.
//
// It's a "controlled" form: React state holds what's typed in each field, and each input
// displays that state. So React always knows the current values, ready to send.

// useState is a React "hook" (a function starting with `use` that a component calls to use a
// React feature). It gives the component a value that survives re-draws, plus a function to
// change it; changing it makes React re-draw the component with the new value.
import { useState } from 'react';
// Link: a link that changes page without reloading. useNavigate: a hook that returns a
// function for changing page from code (e.g. after a successful registration).
import { Link, useNavigate } from 'react-router';
// register(details): sends the details to the API (see ../api/auth.js).
import { register } from '../api/auth';

// The form's starting values: every field empty. Each key matches an input's `name`.
const EMPTY_FORM = {
  first_name: '',
  last_name: '',
  email: '',
  password: '',
  confirm_password: '',
};

// A component is a function returning JSX; `export default` makes it this file's main export.
export default function RegisterPage() {
  // `const [value, setValue] = useState(start)` is array destructuring: useState returns a
  // pair, and this names the two parts.
  // form: what's typed in each field.
  const [form, setForm] = useState(EMPTY_FORM);
  // error: the message to show (a string), or null when there's nothing to show.
  const [error, setError] = useState(null);
  // submitting: true while waiting for the API, so the button can be disabled.
  const [submitting, setSubmitting] = useState(false);
  // navigate('/some/url') changes page from code.
  const navigate = useNavigate();

  // Runs on every keystroke in any field. `event.target` is the input that changed.
  function handleChange(event) {
    // Destructuring: take the input's name (e.g. 'email') and its new value.
    const { name, value } = event.target;
    // Passing a function to setForm gives it the latest form state (`current`), which is
    // safest when updates happen quickly. `{ ...current, [name]: value }` copies every field,
    // then overwrites just the one that changed. `[name]` is a "computed key": it uses the
    // VALUE of name ('email') as the key, rather than the word "name".
    setForm((current) => ({ ...current, [name]: value }));
  }

  // Runs when the form is submitted (the Register button, or Enter in a field).
  async function handleSubmit(event) {
    // Stop the browser's normal form submission, which would reload the whole page.
    event.preventDefault();

    // check the passwords match, then register the customer.
    if (form.password !== form.confirm_password) {
      setError('Passwords do not match');
      return;
    }

    // "busy" state
    setError(null); // clears an old error message
    // disables the submit button and shows "Creating account…" so the user knows something is
    // happening
    setSubmitting(true);

    try {
      // take confirm_password out of form, then save the rest in a new object called 'details'
      const { confirm_password, ...details } = form;
      await register(details);
      // registering also logs the user in, so they go straight to the products page
      navigate('/');
    } catch (err) {
      setError(err.message); // show error and stop
      setSubmitting(false); // resets the submit button so the user can try again
    }
  }

  return (
    <section>
      <h1>Register</h1>

      {/* onSubmit={handleSubmit} passes the function itself (no brackets), so React calls it
          when the form is submitted. className="form" applies the form styles in App.css. */}
      <form onSubmit={handleSubmit} className="form">
        {/* htmlFor (JSX's name for HTML's `for`) links a label to the input with that id.
            Clicking the label focuses the input, and screen readers read the label aloud. */}
        <label htmlFor="first_name">First name</label>
        {/* value={form.first_name} makes the input show the state; onChange keeps the state
            up to date. `required` stops the browser submitting an empty field.
            autoComplete hints let browsers and password managers fill the field in. */}
        <input
          id="first_name"
          name="first_name"
          value={form.first_name}
          onChange={handleChange}
          autoComplete="given-name"
          required
        />

        <label htmlFor="last_name">Last name</label>
        <input
          id="last_name"
          name="last_name"
          value={form.last_name}
          onChange={handleChange}
          autoComplete="family-name"
          required
        />

        <label htmlFor="email">Email</label>
        {/* type="email" makes the browser check it looks like an email address, and shows an
            email keyboard on phones. */}
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
        {/* type="password" hides what's typed. minLength={8} matches the API's rule, so the
            browser can catch a short password before sending. "new-password" tells password
            managers to suggest a new strong password, not fill in a saved one. */}
        <input
          id="password"
          name="password"
          type="password"
          value={form.password}
          onChange={handleChange}
          autoComplete="new-password"
          minLength={8}
          required
        />

        <label htmlFor="confirm_password">Confirm password</label>
        <input
          id="confirm_password"
          name="confirm_password"
          type="password"
          value={form.confirm_password}
          onChange={handleChange}
          autoComplete="new-password"
          minLength={8}
          required
        />

        {/* `error && <p>...</p>`: if error is null, nothing is drawn; if it's a message, the
            paragraph is. role="alert" makes screen readers announce it straight away. */}
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}

        {/* disabled={submitting} stops a second click while the first request is in flight.
            `condition ? a : b` (the "ternary" operator) picks a if condition is true, else b. */}
        <button type="submit" disabled={submitting}>
          {submitting ? 'Creating account…' : 'Register'}
        </button>
      </form>

      {/* For people who already have an account. The space before <Link> is kept because
          the text and the link are on the same line. */}
      <p>
        Already have an account? <Link to="/login">Log in</Link>
      </p>
    </section>
  );
}
