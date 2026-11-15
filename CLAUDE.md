# Gigawolf Extreme: repo rules

## Versioning (mandatory)
Every change that gets committed MUST bump the app version, so cached clients are detectable in live games
(the version shows in the page footer).

- Bump the semver in all three places, to the same value: `APP_VERSION` in `js/config.js`, `version` in
  `package.json`, and `data-html-version` on `<footer id="version">` in `index.html`.
  `tests/version.test.js` fails if they differ.
- Patch (x.y.Z) for fixes and copy tweaks, minor (x.Y.0) for features, roles and settings, major (X.0.0) for
  breaking changes such as a `PROTOCOL_VERSION` bump.
- Never commit without a bump. The only exception is a change that touches nothing served to players
  (for example this file, or README/DECISIONS).
- The footer shows a warning if `index.html` and the JS disagree (a half-cached load).

## Tests
`npm test` must pass before committing.
