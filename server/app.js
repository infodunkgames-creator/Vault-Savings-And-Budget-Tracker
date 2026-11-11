// Builds the Express app: a safety check, the JSON API, and the built web page.
// It is separate from index.js so the tests can create an app without
// starting the real server.
import express from 'express';
import { createRoutes } from './routes.js';

// Only these names may be used to reach the app.
const LOCAL_NAMES = ['127.0.0.1', 'localhost'];

// "localhost:4000" -> "localhost"
function hostnameOf(hostHeader = '') {
  return hostHeader.split(':')[0];
}

export function createApp(db, { staticDir } = {}) {
  const app = express();

  // Safety check. The server already listens on 127.0.0.1 only, so other
  // computers cannot connect. This also stops a malicious website that is
  // open in your own browser from quietly talking to the app:
  //  - "Host" must be localhost / 127.0.0.1
  //  - "Origin" (sent by browsers when another site makes the request) must be too
  app.use((req, res, next) => {
    const hostOk = LOCAL_NAMES.includes(hostnameOf(req.headers.host));
    let originOk = true;
    if (req.headers.origin) {
      try {
        originOk = LOCAL_NAMES.includes(new URL(req.headers.origin).hostname);
      } catch {
        originOk = false;
      }
    }
    if (!hostOk || !originOk) return res.status(403).json({ error: 'Local access only.' });
    next();
  });

  // Parse JSON request bodies (import files can be a few MB).
  app.use(express.json({ limit: '20mb' }));
  // Requests without a body get an empty object, so routes can always read req.body.
  app.use((req, res, next) => {
    if (req.body === undefined) req.body = {};
    next();
  });

  app.use('/api', createRoutes(db));

  // Any other /api address does not exist.
  app.use('/api', (req, res) => res.status(404).json({ error: 'Not found.' }));

  // The built React app (created by "vite build" into dist/).
  if (staticDir) app.use(express.static(staticDir));

  // Last resort: something threw an error. Bad JSON gets a 400, the rest a 500.
  app.use((err, req, res, next) => {
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'That was not valid JSON.' });
    console.error(err);
    res.status(500).json({ error: 'Something went wrong on the server.' });
  });

  return app;
}
