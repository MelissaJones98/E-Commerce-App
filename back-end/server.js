// Entry point: starts the Express app listening for requests.
import app from './app.js';

// Use the PORT environment variable if one is set (hosting platforms such as
// Render or Heroku set it for you), otherwise fall back to 3000 for local dev.
const port = process.env.PORT || 3000;

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
