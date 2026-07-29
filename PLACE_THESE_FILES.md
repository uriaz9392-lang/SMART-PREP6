# What changed in this update

1. **Notes** — no longer "coming soon." Admin can add notes (Program → Subject →
   Title/Content) from the Admin Panel; students browse and read them from the
   Notes tab.
2. **Notifications** — no longer "coming soon." Admin can send notifications
   from the Admin Panel; students see them by tapping the bell icon, with an
   unread-count badge.
3. **Search** — tapping the search icon now opens a live search across
   questions and notes.
4. **Signup now asks for Name, Email, Password, and Course.** The Course
   selector shows MDCAT, KMU CAT, BSN, and MBBS — the student picks one.
5. **Course-locking** — whichever course a student picks at signup is the
   only one they ever see afterwards. The Home screen, Past Papers, Mock
   Exam, and Notes are all filtered to that single course. (Students who
   signed up before this update, and the `?admin=` entry point, still see
   every course — that's expected.)

## ⚠️ Required: add two columns in Supabase (do this first)

Notes and Notifications are stored in your existing `app_data` table. Before
these features will save anything:

1. Go to your Supabase project → **Table Editor** → `app_data` table.
2. Add a column named **`notes`**, type **`jsonb`**, default value `[]`.
3. Add a column named **`notifications`**, type **`jsonb`**, default value `[]`.

If you skip this step, the app still works fine — Notes/Notifications will
just stay empty (they fail silently) until the columns exist.

No other database changes are needed. The student's **Name** and **Course**
are stored automatically on their Supabase Auth account (as user metadata) —
no new table required for that part.

## Where each file goes in your project folder

- `App.jsx` → put inside the **`src`** folder (replace the old one)
- `supabase.js` → put inside the **`src`** folder (replace the old one)

`index.html` and `manifest.json` are unchanged from the last update — no need
to replace them again.

Then in GitHub Desktop: Changes tab → write a summary → Commit to main → Push origin.

## Notes on the admin side

- The Admin Panel (`?admin=` in the URL) is unaffected by course-locking — it
  still shows and manages all four programs, including the new **Notes** and
  **Notifications** tabs.
- The default admin passcode is unchanged (`mdcat2026`) — change it from the
  Settings tab in the Admin Panel if you haven't already.
