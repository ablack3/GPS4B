# GPS4B mobile app

Expo (React Native) app, one codebase for iOS and Android. See
[App.tsx](App.tsx) and [src/](src) for the app itself.

## Installing GPS4B on your phone

No app store needed — download the build from GitHub and install it
directly.

### Android

1. On your phone, open this repo's **Releases** page:
   `https://github.com/ablack3/GPS4B/releases/latest`
2. Tap the file ending in **`.apk`** (e.g. `gps4b-android.apk`) to download it.
3. Tap the downloaded file to open it.
4. Android will warn "install blocked" the first time — tap **Settings**,
   then turn on **Allow from this source**, then go back and tap **Install**.
5. Open the GPS4B app and allow location access when asked.

### iPhone

Apple requires every iPhone to be individually registered before an app
built outside the App Store can be installed on it (this is called
"ad-hoc" distribution). **This is a one-time step per device**, and only
GPS4B's maintainer can do it — if your iPhone isn't registered yet, send
your Apple ID email and ask to be added, or ask for the registration link
described in "Releasing a build" below.

Once your iPhone is registered and a build has been made after that:

1. On a Mac, plug your iPhone in with a cable (or use AirDrop — see step 4).
2. Download the file ending in **`.ipa`** (e.g. `gps4b-ios.ipa`) from the
   repo's **Releases** page onto the Mac.
3. Open **Finder**, click your iPhone in the sidebar, then drag the
   `.ipa` file onto the Finder window. Finder installs it like syncing a
   song — no Xcode needed.
4. No Mac handy? AirDrop the `.ipa` file from another Apple device (or
   from iCloud Drive) straight to the iPhone; it will offer to install itself.
5. On the iPhone, open **Settings → General → VPN & Device Management**,
   tap the GPS4B developer profile, and tap **Trust** — iOS blocks
   non-App-Store apps from opening until you do this once.
6. Open GPS4B from the Home Screen and allow location access when asked.

## Releasing a build (maintainer only)

Builds are produced in the cloud by [EAS Build](https://docs.expo.dev/build/introduction/)
and published automatically to GitHub Releases by
[.github/workflows/mobile-release.yml](../.github/workflows/mobile-release.yml).

### One-time setup

1. Create a free account at [expo.dev](https://expo.dev) (or sign in with
   the project's Apple ID, `ablack3@gmail.com`, if one already exists).
2. Locally, from the `mobile/` folder:
   ```bash
   npx eas-cli login
   npx eas-cli init
   ```
3. Link the Apple Developer account (`ablack3@gmail.com`) so EAS can create
   signing certificates and provisioning profiles automatically:
   ```bash
   npx eas-cli credentials
   ```
   Choose iOS → let EAS manage credentials → sign in with the Apple ID
   when prompted.
4. Register every iPhone that should be able to install the app:
   ```bash
   npx eas-cli device:create
   ```
   This prints a link — open it on the iPhone, install the tiny profile it
   offers, and the phone's UDID is captured. Repeat for each iPhone.
5. Create a GitHub Actions secret so CI can drive EAS:
   ```bash
   npx eas-cli whoami --json   # confirm you're logged in
   npx eas-cli account:view    # then, in expo.dev -> Account settings ->
                                # Access tokens, create a token
   ```
   In the GitHub repo: **Settings → Secrets and variables → Actions → New
   repository secret**, name it `EXPO_TOKEN`, paste the token.

### Cutting a release

```bash
git tag mobile-v1.0.0
git push origin mobile-v1.0.0
```

Pushing a tag matching `mobile-v*` triggers the workflow. It builds both
platforms on Expo's servers (takes ~10-20 minutes), downloads the finished
`.apk` and `.ipa`, and attaches them to a new GitHub Release named after the
tag. You can also trigger it manually from the **Actions** tab
("Mobile Release" → "Run workflow") without pushing a tag.

If you add a new iPhone later, register it with `eas device:create` and
cut a new release tag — ad-hoc builds only work on devices registered
*before* the build was made.

## Submitting to the app stores

This is separate from the ad-hoc releases above — an app-store build goes
through Apple/Google review before the public can install it from the App
Store or Play Store.

### iOS App Store

One-time setup, from `mobile/`:

```bash
npx eas-cli credentials
```

Choose iOS → let EAS manage credentials → this generates a **distribution**
(not ad-hoc) certificate. You also need an app record in
[App Store Connect](https://appstoreconnect.apple.com) (sign in with
`ablack3@gmail.com`) — create one under **My Apps → +** using bundle ID
`org.gps4b.app`, matching [app.json](app.json).

Build and submit:

```bash
npx eas-cli build --platform ios --profile production
npx eas-cli submit --platform ios --latest
```

`eas submit` uploads the build to App Store Connect. From there, open the
build in App Store Connect, fill in screenshots/description/privacy info,
and submit it for Apple's review (typically 1-3 days).

### Google Play Store

One-time setup:

1. Create an app in the [Google Play Console](https://play.google.com/console)
   (costs a one-time $25 registration fee for the developer account) with
   package name `org.gps4b.app`.
2. Create a Google Cloud service account with the **Service Account User**
   role, link it to the Play Console under **Setup → API access**, and
   download its JSON key.
3. Save the key as `mobile/play-store-service-account.json` (this file is
   git-ignored — never commit it) and point `eas.json`'s `submit.production`
   at it:
   ```json
   "submit": {
     "production": {
       "android": {
         "serviceAccountKeyPath": "./play-store-service-account.json"
       }
     }
   }
   ```
4. Upload one build manually through the Play Console the first time
   (Google requires this before `eas submit` can use the API) — download the
   `.apk`/`.aab` from a GitHub Release or an EAS build and upload it under
   **Testing → Internal testing**.

Build and submit subsequent releases:

```bash
npx eas-cli build --platform android --profile production
npx eas-cli submit --platform android --latest
```

Promote the release from **Internal testing** to **Production** inside the
Play Console when ready; Google reviews new apps before the first
production release goes live (typically a few hours to a few days).

## Local development

```bash
npm install
npm run ios      # or: npm run android / npm run web
npm run typecheck
```
