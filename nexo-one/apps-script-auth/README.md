# NEXO ONE — Google Apps Script Auth Broker

This directory is the server-side authentication broker used by the GitHub Pages frontend. The repository contains no PIN, PIN hash, or session secret.

## Deploy

1. Create a new standalone Google Apps Script project.
2. Copy `Code.gs`, `Index.html`, and `appsscript.json` from this directory into that project.
3. In the Apps Script editor, run `setupNexoAuth(pin, allowedOrigin)` interactively once, using your chosen numeric PIN and the exact allowed origin `https://bydenoso.github.io`.
4. Authorize the script when Google requests permission. The setup helper stores only `NEXO_PIN_HASH`, `NEXO_SESSION_SECRET`, and `NEXO_ALLOWED_ORIGIN` in Script Properties.
5. Deploy the project as a Web App. Execute as the project owner and allow access to the audience that must reach the NEXO login bridge. Record the deployed `/exec` URL.
6. In the Pantheon GitHub repository, configure the non-secret Actions/Pages variable `VITE_NEXO_AUTH_BRIDGE_URL` with that `/exec` URL.
7. Re-run the `NEXO ONE GitHub Pages` workflow or push the merged change to `main`.
8. Validate the public Pages URL. Opening private access must show the local PIN modal; a valid PIN must change the cockpit to `PRIVATE`; logout must return it to `PUBLIC`.

## Security invariants

Never put the PIN, `NEXO_PIN_HASH`, or `NEXO_SESSION_SECRET` in GitHub variables, GitHub secrets, source files, query strings, issue comments, CI logs, or chat messages. Only the Apps Script `/exec` URL belongs in `VITE_NEXO_AUTH_BRIDGE_URL`.

The browser stores only the opaque session token in `sessionStorage`. Sessions expire after 8 hours. Login failures are rate-limited server-side. The bridge validates the configured Pages origin and uses a versioned `postMessage` protocol without wildcard targets.
