# Contributing to ats-boards

Thanks for helping keep public employer boards useful and predictable.

## Set up

Use Node 22 or 24.

```bash
npm ci
npm run check
```

The test suite is offline. CI must not depend on a live employer or provider
endpoint: those change, rate-limit and disappear independently of this package.

## Add or update a provider

1. Add its career-page discovery pattern in `src/discover.ts`.
2. Add or update the reader in `src/readers.ts`.
3. Record at least one real employer used for manual verification in the
   provider comment and the README table.
4. Add a small, anonymised fixture or contract test that covers the response
   fields the reader consumes. Include a German and a non-German posting when
   location filtering is involved.
5. Run `npm run check` and manually try the CLI against the documented employer.

Readers must use public, keyless endpoints, keep the existing timeout and
pagination bounds, and return missing data as missing. Do not infer descriptions,
dates or locations that the provider did not return.

## Pull-request checklist

- [ ] Build and offline tests pass on Node 22 or 24.
- [ ] New behaviour has a fixture or contract test.
- [ ] The README and provider comment identify what was verified.
- [ ] No credentials, personal applicant data or private endpoints are included.
- [ ] The change preserves the original API or clearly documents a migration.

Small fixes and new provider requests are welcome through
[GitHub Issues](https://github.com/msertdev/ats-boards/issues).
