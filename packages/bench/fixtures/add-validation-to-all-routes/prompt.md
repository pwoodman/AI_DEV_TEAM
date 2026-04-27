Add Zod input validation to all five routes in `src/router.ts`.

For each route, validate the request body/params using Zod. Return `{ status: 400, body: { error: string } }` if validation fails.

Route schemas to add:
- `POST /users` — body must have `{ name: string (min 1), email: string (includes "@") }`
- `POST /posts` — body must have `{ title: string (min 1), userId: number (positive int) }`
- `PUT /posts/:id` — params must have `id` as positive integer; body must have `{ title: string (min 1) }`
- `DELETE /users/:id` — params must have `id` as positive integer
- `POST /comments` — body must have `{ postId: number (positive int), text: string (min 1) }`

Install zod as a dependency. Return the existing success response unchanged for valid input.
