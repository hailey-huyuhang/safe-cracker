# Safe Cracker frontend

Angular 21 app for the safe-cracker API. See the [project README](../README.md) for the
full picture; the short version:

```bash
npm install
npm start        # dev server on http://localhost:4200, /api proxied to Flask on :8000
npm run build    # production build into dist/, served by Flask at http://localhost:8000
npm test         # unit tests (vitest)
```

Source files: `src/app/app.ts` (page component), `app.html` / `app.css` (template and
styles), `crack-safe.service.ts` (API calls).
