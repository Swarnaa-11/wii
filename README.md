# MotionPlay setup (no Node, no npm)
1. supabase.com > New project. Project Settings > API: copy **Project URL** and **anon public** key into `config.js`. Never use the service_role key.
2. Realtime needs no tables. Broadcast and Presence work on public channels by default (Realtime settings: leave "Allow public access" on).
3. Deploy the folder to GitHub Pages or Netlify (drag the folder onto app.netlify.com/drop). Both serve HTTPS, which phone motion sensors require.
4. Open the site on a laptop, pick Multiplayer, scan the QR with phones.
