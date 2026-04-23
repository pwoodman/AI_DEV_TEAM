Add a `GET /health` endpoint to `src/router.ts`. It must respond with HTTP 200
and a JSON body `{"ok": true}`. Do not regress any existing routes.
The tests under `tests/` will execute the router and check the response.
