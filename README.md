# M'archiTech Training Management System

## Project info

Web application for managing training programs, payments, attendance, assessments, resources, progress, and certificates.

## How can I edit this code?

There are several ways of editing your application.

**Use your preferred IDE**

If you want to work locally using your own IDE, clone this repository and run it locally.

The only requirement is having Node.js & npm installed - [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating)

Follow these steps:

```sh
# Step 1: Clone the repository using the project's Git URL.
git clone <YOUR_GIT_URL>

# Step 2: Navigate to the project directory.
cd <YOUR_PROJECT_NAME>

# Step 3: Install the necessary dependencies.
npm i

# Step 4: Start the development server with auto-reloading and an instant preview.
npm run dev
```

**Edit a file directly in GitHub**

- Navigate to the desired file(s).
- Click the "Edit" button (pencil icon) at the top right of the file view.
- Make your changes and commit the changes.

**Use GitHub Codespaces**

- Navigate to the main page of your repository.
- Click on the "Code" button (green button) near the top right.
- Select the "Codespaces" tab.
- Click on "New codespace" to launch a new Codespace environment.
- Edit files directly within the Codespace and commit and push your changes once you're done.

## What technologies are used for this project?

This project is built with:

- Vite
- TypeScript
- React
- shadcn-ui
- Tailwind CSS

## How can I deploy this project?

You can deploy this frontend using any static hosting platform (for example Vercel, Netlify, or Supabase Hosting), and keep Supabase as the backend.

## Run Offline With Local Supabase

This project already uses Supabase heavily for database, auth, storage, and realtime. The easiest offline setup is to run a local Supabase stack instead of replacing the backend with XAMPP/MySQL.

### 1. Start local Supabase

Install Docker Desktop and the Supabase CLI, then start the local stack from the project root:

```sh
supabase start
supabase db reset
```

`supabase db reset` applies the migrations in [supabase/migrations](/d:/MyProjects/Others/MarchiTech-Training-Management-System-/supabase/migrations), including the new public certificate verification RPC used for offline mode.

### 2. Point the frontend to local Supabase

Copy `.env.local.example` to `.env.local`, then replace `VITE_SUPABASE_PUBLISHABLE_KEY` with the local anon key shown by:

```sh
supabase status
```

Default local API URL:

```env
VITE_SUPABASE_URL=http://127.0.0.1:54321
```

For offline/local use, this project now supports:

```env
VITE_ENABLE_PAYMENTS=false
```

That disables the PayChangu checkout dependency and turns trainee enrollment into a normal approval request flow.

### 3. Run the app

```sh
npm install
npm run dev
```

### 4. Optional: serve the built app with XAMPP

If you want Apache/XAMPP to serve the frontend instead of the Vite dev server:

```sh
npm run build
```

Then copy the contents of `dist` into your XAMPP `htdocs` web root. A [public/.htaccess](/d:/MyProjects/Others/MarchiTech-Training-Management-System-/public/.htaccess) file is included so browser refreshes on React routes keep working under Apache.

If you host the app in a subfolder such as `http://localhost/marchitech/`, set this before building:

```env
VITE_APP_BASENAME=/marchitech
```
