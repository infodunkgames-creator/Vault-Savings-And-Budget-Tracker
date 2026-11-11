// Phase 1 screen: proves the server, database and starter categories work.
// The real dashboard replaces this in later phases.
import { useEffect, useState } from 'react';
import { api } from './api.js';
import { BUCKETS } from './buckets.js';
import { currentMonth, monthLabel } from './dates.js';

export default function App() {
  const [categories, setCategories] = useState([]);
  const [error, setError] = useState('');

  // Load the categories once, when the page opens.
  useEffect(() => {
    api('/categories').then(setCategories).catch((e) => setError(e.message));
  }, []);

  return (
    <main className="page">
      <header className="page-header">
        <h1>{monthLabel(currentMonth())}</h1>
      </header>

      {error && <p className="error">{error}</p>}

      <p className="hint">
        Phase 1: the server and database are running. These starter categories came from your
        database file.
      </p>

      <div className="bucket-grid">
        {BUCKETS.map((bucket) => {
          const inBucket = categories.filter((c) => c.bucket === bucket.key && !c.archived);
          return (
            <section key={bucket.key} className="card">
              <h2>{bucket.label}</h2>
              {inBucket.length === 0 ? (
                <p className="muted">No categories yet</p>
              ) : (
                <ul className="plain-list">
                  {inBucket.map((c) => (
                    <li key={c.id}>{c.name}</li>
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>
    </main>
  );
}
