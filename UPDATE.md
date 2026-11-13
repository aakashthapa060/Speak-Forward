# Speak Forward 1.1 update

Find Helpers now keeps signed-in users in the dashboard layout. The practice room now has WebRTC media sharing instead of a local-only camera preview.

## Update your existing project on Windows

1. Stop the app with Ctrl+C and back up the whole project folder.
2. Extract this ZIP. Copy the contents of its `speak-forward` folder into your existing project folder, allowing source files to be replaced. If you have your own code changes, merge them from your backup.
3. Keep your existing `.env`, uploaded pictures and database. They are not included in this update. Do not delete Docker volumes or run the seed again just to update.
4. In the existing project folder run:

```powershell
npm.cmd install
npm.cmd run dev
```

5. Hard-refresh both browsers with Ctrl+Shift+R. Sign in as two different accounts, accept and confirm the same session, and open its practice room on both sides. Turn on each camera and microphone separately and allow access.

No Docker reinstall is required. Your MongoDB still needs to be running, whether it is local Docker MongoDB or Atlas.

For two-device tests use HTTPS. For different networks configure a TURN relay if direct connectivity fails; see README and `.env.example`. Docker alone does not connect the cameras.

Validation: syntax and EJS checks passed; 24 reported automated tests passed, one native media test skipped due to environment limitations. Actual two-device camera/audio playback still requires testing on your devices. `npm.cmd run test:browser` provides a separate synthetic media check at http://localhost:3090.
