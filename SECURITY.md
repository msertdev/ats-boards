# Security policy

## Supported versions

Security fixes are made on the latest release and the `main` branch.

## Report a vulnerability

Please do not open a public issue for a vulnerability. Use
[GitHub's private vulnerability report](https://github.com/msertdev/ats-boards/security/advisories/new)
and include:

- the affected provider or function;
- a minimal reproduction;
- the impact you observed; and
- any suggested mitigation.

You should receive an acknowledgement within seven days. Avoid testing against
employer systems in a way that creates load, bypasses authentication or accesses
non-public data.

This package reads only public, keyless job-board endpoints. A provider exposing
data it should not expose is also an issue for that provider and should be
reported through its security channel.
