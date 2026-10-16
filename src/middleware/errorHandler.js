export function notFound(req, res) {
  res.status(404).json({ error: `Route not found: ${req.method} ${req.originalUrl}` });
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  console.error(err);
  let status = err.status || 500;
  let message = err.message;

  // Common Postgres / Supabase error codes
  if (err.code === '23505') { status = 409; message = 'Already exists (duplicate value)'; }
  else if (err.code === '22P02') { status = 400; message = 'Invalid id or value format'; }
  else if (err.code === '23503') { status = 400; message = 'Referenced record does not exist'; }

  res.status(status).json({ error: status === 500 ? 'Internal server error' : message });
}
