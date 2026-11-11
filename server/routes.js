// Every /api route lives in this file.
// Each route: check the input, run one or two SQL statements, send JSON back.
import express from 'express';
import {
  BUCKETS, isMonth, isDate, isCents, isBucket, cleanName, cleanNote, previousMonth,
} from './validate.js';

// Send a 400 "bad request" with a message the UI can show.
function bad(res, message) {
  return res.status(400).json({ error: message });
}

export function createRoutes(db) {
  const router = express.Router();

  // ---------------------------------------------------------------- categories

  // All categories, including archived ones (the UI decides what to show).
  router.get('/categories', (req, res) => {
    res.json(db.prepare('SELECT id, name, bucket, archived FROM categories ORDER BY id').all());
  });

  // The most-used categories of the last 90 days, for the quick-add chips.
  // With no history yet, expense categories come first.
  // Also returns the category of the newest transaction, to preselect it.
  router.get('/categories/top', (req, res) => {
    const top = db.prepare(`
      SELECT c.id, c.name, c.bucket, COUNT(t.id) AS uses
      FROM categories c
      LEFT JOIN transactions t
        ON t.category_id = c.id AND t.date >= date('now', '-90 days')
      WHERE c.archived = 0
      GROUP BY c.id
      ORDER BY uses DESC, (c.bucket = 'expense') DESC, c.id
      LIMIT 6
    `).all();
    const last = db.prepare(`
      SELECT t.category_id FROM transactions t
      JOIN categories c ON c.id = t.category_id
      WHERE c.archived = 0
      ORDER BY t.id DESC LIMIT 1
    `).get();
    res.json({ top, last_category_id: last ? last.category_id : null });
  });

  // True if another category in the same bucket already has this name.
  function nameTaken(name, bucket, exceptId = 0) {
    return !!db.prepare(`
      SELECT 1 FROM categories
      WHERE bucket = ? AND lower(name) = lower(?) AND id <> ?
    `).get(bucket, name, exceptId);
  }

  // Add a category: { name, bucket }
  router.post('/categories', (req, res) => {
    const name = cleanName(req.body.name);
    const { bucket } = req.body;
    if (!name) return bad(res, 'Name is required (up to 60 characters).');
    if (!isBucket(bucket)) return bad(res, `Bucket must be one of: ${BUCKETS.join(', ')}.`);
    if (nameTaken(name, bucket)) return bad(res, `"${name}" already exists in that bucket.`);

    const info = db.prepare('INSERT INTO categories (name, bucket) VALUES (?, ?)').run(name, bucket);
    res.status(201).json({ id: info.lastInsertRowid, name, bucket, archived: 0 });
  });

  // Change a category. Send only what changes: { name?, bucket?, archived? }
  router.patch('/categories/:id', (req, res) => {
    const current = db.prepare('SELECT * FROM categories WHERE id = ?').get(req.params.id);
    if (!current) return res.status(404).json({ error: 'Category not found.' });

    // Start from the current values and overwrite whichever fields were sent.
    const next = { ...current };
    if ('name' in req.body) {
      next.name = cleanName(req.body.name);
      if (!next.name) return bad(res, 'Name is required (up to 60 characters).');
    }
    if ('bucket' in req.body) {
      if (!isBucket(req.body.bucket)) return bad(res, `Bucket must be one of: ${BUCKETS.join(', ')}.`);
      next.bucket = req.body.bucket;
    }
    if ('archived' in req.body) {
      if (typeof req.body.archived !== 'boolean') return bad(res, 'archived must be true or false.');
      next.archived = req.body.archived ? 1 : 0;
    }
    if (nameTaken(next.name, next.bucket, current.id)) {
      return bad(res, `"${next.name}" already exists in that bucket.`);
    }

    db.prepare('UPDATE categories SET name = ?, bucket = ?, archived = ? WHERE id = ?')
      .run(next.name, next.bucket, next.archived, current.id);
    res.json({ id: current.id, name: next.name, bucket: next.bucket, archived: next.archived });
  });

  // -------------------------------------------------------------- transactions

  // All transactions in one month, newest first: /api/transactions?month=2026-11
  router.get('/transactions', (req, res) => {
    const { month } = req.query;
    if (!isMonth(month)) return bad(res, 'month must look like 2026-11.');
    // Dates are text like '2026-11-05', so comparing them as text works:
    // everything from '2026-11-01' to '2026-11-31' is in November.
    const rows = db.prepare(`
      SELECT t.id, t.date, t.amount_cents, t.category_id, t.note, t.created_at,
             c.name AS category_name, c.bucket
      FROM transactions t
      JOIN categories c ON c.id = t.category_id
      WHERE t.date BETWEEN ? AND ?
      ORDER BY t.date DESC, t.id DESC
    `).all(`${month}-01`, `${month}-31`);
    res.json(rows);
  });

  // Check a transaction's fields. Returns an error message, or null if fine.
  function transactionProblem(t) {
    if (!isDate(t.date)) return 'date must be a real date like 2026-11-05.';
    if (!isCents(t.amount_cents) || t.amount_cents === 0) {
      return 'amount_cents must be a whole number of cents and not zero.';
    }
    if (t.note === null) return 'note must be text (up to 200 characters).';
    const category = db.prepare('SELECT id FROM categories WHERE id = ?').get(t.category_id);
    if (!category) return 'Pick a category.';
    return null;
  }

  // Add a transaction: { date, amount_cents, category_id, note? }
  router.post('/transactions', (req, res) => {
    const t = {
      date: req.body.date,
      amount_cents: req.body.amount_cents,
      category_id: req.body.category_id,
      note: cleanNote(req.body.note),
    };
    const problem = transactionProblem(t);
    if (problem) return bad(res, problem);

    const info = db.prepare(`
      INSERT INTO transactions (date, amount_cents, category_id, note) VALUES (?, ?, ?, ?)
    `).run(t.date, t.amount_cents, t.category_id, t.note);
    res.status(201).json(db.prepare('SELECT * FROM transactions WHERE id = ?').get(info.lastInsertRowid));
  });

  // Edit a transaction. Send only what changes.
  router.patch('/transactions/:id', (req, res) => {
    const current = db.prepare('SELECT * FROM transactions WHERE id = ?').get(req.params.id);
    if (!current) return res.status(404).json({ error: 'Transaction not found.' });

    const t = {
      date: 'date' in req.body ? req.body.date : current.date,
      amount_cents: 'amount_cents' in req.body ? req.body.amount_cents : current.amount_cents,
      category_id: 'category_id' in req.body ? req.body.category_id : current.category_id,
      note: 'note' in req.body ? cleanNote(req.body.note) : current.note,
    };
    const problem = transactionProblem(t);
    if (problem) return bad(res, problem);

    db.prepare(`
      UPDATE transactions SET date = ?, amount_cents = ?, category_id = ?, note = ? WHERE id = ?
    `).run(t.date, t.amount_cents, t.category_id, t.note, current.id);
    res.json(db.prepare('SELECT * FROM transactions WHERE id = ?').get(current.id));
  });

  router.delete('/transactions/:id', (req, res) => {
    const info = db.prepare('DELETE FROM transactions WHERE id = ?').run(req.params.id);
    if (info.changes === 0) return res.status(404).json({ error: 'Transaction not found.' });
    res.json({ ok: true });
  });

  // -------------------------------------------------------------------- months

  // Everything the dashboard needs for one month.
  router.get('/months/:month', (req, res) => {
    const { month } = req.params;
    if (!isMonth(month)) return bad(res, 'month must look like 2026-11.');

    // One row per category with its planned amount and its actual total.
    // Archived categories only appear if they have a plan or transactions
    // in this month, so old months keep showing their real history.
    const categories = db.prepare(`
      SELECT c.id, c.name, c.bucket, c.archived,
             COALESCE(p.planned_cents, 0) AS planned_cents,
             COALESCE(a.actual_cents, 0)  AS actual_cents
      FROM categories c
      LEFT JOIN month_plans p
        ON p.category_id = c.id AND p.month = @month
      LEFT JOIN (
        SELECT category_id, SUM(amount_cents) AS actual_cents
        FROM transactions
        WHERE date BETWEEN @first AND @last
        GROUP BY category_id
      ) a ON a.category_id = c.id
      WHERE c.archived = 0 OR p.category_id IS NOT NULL OR a.category_id IS NOT NULL
      ORDER BY c.id
    `).all({ month, first: `${month}-01`, last: `${month}-31` });

    // Add up planned and actual per bucket.
    const totals = {};
    for (const bucket of BUCKETS) totals[bucket] = { planned_cents: 0, actual_cents: 0 };
    for (const c of categories) {
      totals[c.bucket].planned_cents += c.planned_cents;
      totals[c.bucket].actual_cents += c.actual_cents;
    }

    // Left to spend = income - (expenses + bills + savings + debt)
    const left = (key) =>
      totals.income[key] - (totals.expense[key] + totals.bill[key] + totals.savings[key] + totals.debt[key]);

    res.json({
      month,
      categories,
      totals,
      left_planned_cents: left('planned_cents'),
      left_actual_cents: left('actual_cents'),
      // False for a brand-new month, which is when "Copy last month's plan" is offered.
      has_plan: categories.some((c) => c.planned_cents !== 0),
    });
  });

  // Set one planned amount: PUT /api/months/2026-11/plans/5  { planned_cents }
  router.put('/months/:month/plans/:categoryId', (req, res) => {
    const { month, categoryId } = req.params;
    const { planned_cents } = req.body;
    if (!isMonth(month)) return bad(res, 'month must look like 2026-11.');
    if (!isCents(planned_cents) || planned_cents < 0) {
      return bad(res, 'planned_cents must be a whole number of cents, zero or more.');
    }
    const category = db.prepare('SELECT id FROM categories WHERE id = ?').get(categoryId);
    if (!category) return res.status(404).json({ error: 'Category not found.' });

    if (planned_cents === 0) {
      // A plan of zero is the same as no plan, so remove the row.
      db.prepare('DELETE FROM month_plans WHERE month = ? AND category_id = ?').run(month, category.id);
    } else {
      // Insert, or update the existing row for this month + category.
      db.prepare(`
        INSERT INTO month_plans (month, category_id, planned_cents) VALUES (?, ?, ?)
        ON CONFLICT (month, category_id) DO UPDATE SET planned_cents = excluded.planned_cents
      `).run(month, category.id, planned_cents);
    }
    res.json({ month, category_id: category.id, planned_cents });
  });

  // Copy the previous month's planned amounts into this month.
  // Amounts already set in this month are kept (INSERT OR IGNORE skips them).
  router.post('/months/:month/copy-previous', (req, res) => {
    const { month } = req.params;
    if (!isMonth(month)) return bad(res, 'month must look like 2026-11.');
    const from = previousMonth(month);

    const info = db.prepare(`
      INSERT OR IGNORE INTO month_plans (month, category_id, planned_cents)
      SELECT ?, p.category_id, p.planned_cents
      FROM month_plans p
      JOIN categories c ON c.id = p.category_id
      WHERE p.month = ? AND c.archived = 0
    `).run(month, from);
    res.json({ copied: info.changes, from });
  });

  return router;
}
