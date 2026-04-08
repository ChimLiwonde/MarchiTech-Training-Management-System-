# XAMPP API Scaffold

This folder is the next migration slice for moving the current Supabase backend to XAMPP.

## What it gives you now

- A PHP JSON API entrypoint at `index.php`
- Token auth endpoints
- Training program endpoints
- Enrollment endpoints for trainees, trainers, and admins
- Session scheduling and deletion endpoints
- Attendance roster, status, and self check-in endpoints
- A dashboard overview endpoint for quick stats, charts, recent activity, and progress
- Profile, progress, feedback, user management, and notification endpoints
- PayChangu checkout initiation, return verification, and webhook endpoints
- Resource listing, upload, and deletion endpoints with local file storage
- A reports overview endpoint for admin analytics and CSV export support
- Assessment, question, and quiz attempt endpoints
- Certificate listing, issuing, and public verification endpoints
- A MySQL schema that mirrors the current app tables closely enough to keep migrating the React frontend

## Endpoints included

- `GET /health`
- `GET /settings/public`
- `GET /dashboard`
- `GET /reports`
- `GET /progress`
- `GET /profile`
- `PATCH /profile`
- `GET /feedback`
- `POST /feedback`
- `PATCH /feedback/{id}`
- `DELETE /feedback/{id}`
- `GET /users`
- `PATCH /users/{id}/role`
- `GET /notifications`
- `PATCH /notifications/read-all`
- `PATCH /notifications/{id}/read`
- `DELETE /notifications/{id}`
- `GET /payments/my`
- `POST /payments/checkout`
- `POST /payments/verify`
- `POST /payments/paychangu/webhook`
- `GET /assessments`
- `POST /assessments`
- `PATCH /assessments/{id}/publish`
- `DELETE /assessments/{id}`
- `GET /assessments/{id}/questions`
- `POST /assessments/{id}/questions`
- `DELETE /assessment-questions/{id}`
- `POST /assessments/{id}/attempts`
- `POST /auth/register`
- `POST /auth/login`
- `GET /auth/me`
- `POST /auth/logout`
- `GET /certificates`
- `POST /certificates`
- `GET /certificates/verify?certificate_number=...`
- `GET /training-programs`
- `POST /training-programs`
- `PATCH /training-programs/{id}/status`
- `GET /resources`
- `POST /resources`
- `DELETE /resources/{id}`
- `GET /sessions`
- `POST /sessions`
- `DELETE /sessions/{id}`
- `GET /sessions/{id}/attendance`
- `POST /sessions/{id}/attendance/initialize`
- `PATCH /attendance/{id}`
- `POST /attendance/{id}/check-in`
- `POST /training-programs/{id}/enroll`
- `GET /enrollments/my`
- `GET /training-programs/{id}/enrollments`
- `PATCH /enrollments/{id}/status`

## Quick setup in XAMPP

1. Copy the `xampp-api` folder into `htdocs`, for example:

   `C:\xampp\htdocs\marchitech-api`

2. Create a MySQL database by importing:

   `xampp-api/database/schema.sql`

3. Set these environment variables for Apache/PHP or adapt `config.php` defaults:

   - `MARCHITECH_DB_HOST`
   - `MARCHITECH_DB_PORT`
   - `MARCHITECH_DB_NAME`
   - `MARCHITECH_DB_USER`
   - `MARCHITECH_DB_PASSWORD`
   - `MARCHITECH_ALLOWED_ORIGINS`
   - `MARCHITECH_PAYMENTS_ENABLED`
   - `MARCHITECH_PAYCHANGU_SECRET_KEY`
   - `MARCHITECH_PAYCHANGU_WEBHOOK_SECRET`
   - `MARCHITECH_PAYCHANGU_CALLBACK_URL`

4. Optional and easier on XAMPP: copy `xampp-api/config.local.example.php` to `xampp-api/config.local.php` and edit that one file instead of Apache env vars.

5. Start Apache and MySQL from XAMPP.

6. Test the API:

   `http://localhost/marchitech-api/health`

## Frontend XAMPP mode

To point the React app at the PHP API, set these frontend env vars:

- `VITE_BACKEND_MODE=xampp`
- `VITE_API_BASE_URL=http://localhost/marchitech-api`
- `VITE_ENABLE_PAYMENTS=false` for Supabase/local offline mode

In XAMPP mode, payment visibility is now controlled by the PHP API config instead of the Vite build flag. That means you can switch payments on later by editing `xampp-api/config.local.php` without rebuilding the frontend.

The current frontend migration slice already uses the XAMPP API for:

- auth
- assessments, questions, and quiz attempts
- certificate listing, issuing, preview support, and public verification
- dashboard summaries and charts
- profile updates
- trainee progress tracking
- program feedback and reviews
- admin user management
- notification polling, marking read, and deletion
- trainee payment status, PayChangu checkout, and return-based payment verification
- admin reports and analytics
- training program listing, creation, and status updates
- trainee enrollment requests
- trainer/admin enrollment approvals
- resource listing, uploads, downloads, and deletion
- session listing, creation, and deletion
- attendance roster initialization
- trainer/admin attendance updates
- trainee self check-in

## Important note

Uploaded files are stored under `xampp-api/uploads/training-materials` and served directly by Apache.

This is close to the full migration. Notification delivery is currently polling-based rather than realtime, and PayChangu webhooks need a publicly reachable callback URL if you want server-to-server updates outside the browser return flow.

## Payment note for localhost

If you run the app on `http://localhost`, PayChangu cannot call your webhook directly unless you expose XAMPP through a public tunnel or deploy it on a reachable server.

The current XAMPP implementation includes a browser return verification path, so local testing can still work like this:

1. Edit `xampp-api/config.local.php`
2. Set `'enabled' => true`
3. Paste your PayChangu secret key into `'secret_key'`
4. Let PayChangu return the user to `/trainings`
5. The app verifies the `tx_ref` with the PHP API and updates the enrollment/payment status

For production or a shared hosted XAMPP server, set `MARCHITECH_PAYCHANGU_CALLBACK_URL` to a public URL such as:

`https://your-domain.example/marchitech-api/payments/paychangu/webhook`
