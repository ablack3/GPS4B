# GPS4B repository export

Two things are in this archive:

- `source/` — the current source tree (working branch state), ready to browse
  or copy. No git history.
- `gps4b-full-history.bundle` — the complete git repository: every commit on
  all three branches (`main`, `claude/gps4b-mobile-app-tb80v2`, `gh-pages`).

## Push everything to a new GitHub repo (e.g. ablack3003/GPS4B)

1. Create an empty repository on GitHub (no README).
2. On a machine with git:

   ```bash
   git clone gps4b-full-history.bundle GPS4B
   cd GPS4B
   git remote set-url origin https://github.com/ablack3003/GPS4B.git
   git push origin --all        # pushes main, the working branch, and gh-pages
   ```

3. On the new repo: Settings → Pages → Deploy from a branch → `gh-pages` to
   serve the web app at https://<account>.github.io/GPS4B/.

See `source/README.md` ("Start using GPS4B") and `source/DEPLOYMENT.md` for
everything else (Render backend, mobile builds).
