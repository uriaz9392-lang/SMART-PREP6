# What changed

1. **Bottom nav** is now: Home, Past Papers, Mock Exam, Notes, Saved
   (Library/Tests/Community/Profile removed from the bottom bar)
2. **Saved** now lives in the bottom nav (removed the duplicate tile from Quick Access)
3. **Profile** moved — tap the ☰ menu icon (top-left) to open it
4. **App icon/logo** replaced with your SMART PREP logo image

## Where each file goes in your project folder

- `App.jsx` → put inside the **`src`** folder (replace the old one)
- `index.html` → put in the **project root** (same level as `package.json` —
  replace the old one)
- `public/icon.png` → put inside your project's **`public`** folder
- `public/manifest.json` → put inside your project's **`public`** folder
  (replace the old one)
- `supabase.js` → put inside the **`src`** folder (only needed if you haven't
  already replaced it from the previous update)

You can safely delete the old `icon.svg` from `public` — it's no longer used.

Then in GitHub Desktop: Changes tab → write a summary → Commit to main → Push origin.
