# Google Drive

QUANTA saves locally first. Sync contacts Google's real authenticated API; `navigator.onLine` alone is not treated as proof of a working connection. Failed attempts keep local files and queued exports intact. There are no QUANTA server accounts.

## One-time desktop setup

Google requires a registered application client even when an app is only used personally.

1. Open Google Cloud Console and create or choose a project for QUANTA.
2. Enable **Google Drive API**.
3. Configure the OAuth consent screen. Choose the account audience appropriate to your own Google account. QUANTA requests `drive.file`, `openid`, and `email`.
4. Create an OAuth client with the application type **Desktop app**. Download its JSON.
5. In QUANTA, open **Settings → Google Drive → One-time Google client setup → Import credentials JSON**.
6. Select **Connect Google account**. Choose the intended account in your system browser and authorize it.

The desktop flow uses a random localhost callback port, PKCE, OAuth state verification, offline access, and the system credential store. Refresh tokens are stored in macOS Keychain or Windows Credential Manager. They are not written into notebooks, JavaScript, or GitHub.

Use a production consent-screen configuration for persistent personal use. External applications in Google's testing mode can receive refresh tokens that expire after seven days for Drive scopes. Google's policies and consent requirements still apply to a personal app. QUANTA cannot remove Google's application-registration step.

## Browser setup

In the **same Google Cloud project**, create a second OAuth client with the type **Web application**. Add the deployed GitHub Pages origin to its authorized JavaScript origins. An origin includes the scheme and hostname, without a repository path. Add the localhost origin separately for development if required.

Enter that Web client ID in the web app's Google Drive settings. A browser client does not use a client secret. QUANTA uses Google Identity Services' browser token flow and keeps the access token in memory. Google may require another authorization after page reload, token expiry, or account-policy changes. A static GitHub Pages app has no private server to hold a long-lived browser refresh token.

Changing the selected Google account resets the account-specific sync index and syncs local notebooks into the selected account. Confirm the account displayed in settings before syncing.

## Drive structure

```text
QUANTA/
  Notebooks/   immutable .quanta revisions and recoverable deletion markers
  Exports/     PDF, PNG, SVG, Markdown, HTML, text, or TeX results
```

Notebook revisions are immutable: simultaneous writes cannot overwrite each other's bytes. Each revision records its parent hash. Concurrent leaf revisions are kept as conflict copies. Cloud history is retained; QUANTA does not permanently purge it automatically.

Exports are separate from editable notes. **Export in Drive** updates an existing named export; **Export in Drive as…** makes a separate result. Export jobs remain queued across restarts, and upload job IDs prevent repeated creations after uncertain responses.

The timer runs every 15 minutes while the app or browser workspace is open and unlocked. Closing a desktop application or browser tab stops its timer. The web browser may throttle background tabs. Pending changes retry on the next available session and successful authorization.

## Troubleshooting

- `redirect_uri_mismatch`: use a Desktop app client in the desktop app and a Web client in the browser. Do not interchange them.
- Access refused: verify the Drive API is enabled and the account can authorize the consent screen.
- Sign-in popup blocked: allow the Google sign-in popup and reconnect from settings.
- Authorization expired: reconnect the same Google account. Local files remain intact.
- Wrong account: disconnect, choose the intended account, and check the displayed account before sync.
- A damaged cloud revision: QUANTA refuses to replace healthy local content with it.
