# Supabase — TRIBOS

`migrations/` contains additive database changes for the persistent world and Editor 3D ADM.

The browser may use only `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` from an untracked `.env.local`. Service-role and personal access tokens are server/CLI secrets and must not be committed or exposed to the client.

Apply migrations through the Supabase CLI or the project database migration workflow. The first authenticated user is created with the `player` role; grant `admin` manually from a trusted server-side session after verifying that user's Auth UUID.
