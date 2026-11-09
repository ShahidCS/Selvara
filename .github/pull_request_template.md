## Summary

<!-- What changes and why. Link the issue or decision (docs/DECISIONS.md) if there is one. -->

## Checklist

- [ ] `npm run ci` and `npm run test:e2e` pass locally (the same gates run in CI)
- [ ] New or changed mutations go through the service layer, are deny-by-default, and write an audit entry
- [ ] Segregation of duties preserved: nobody approves their own request (docs/SOD_MATRIX.md)
- [ ] No secrets, tokens, real personal data or customer information (synthetic data only)
- [ ] Any new dependency is justified, licence-compatible with a proprietary product, and has no High/Critical advisory
- [ ] Any new GitHub Action is pinned to a full commit SHA (`.github/scripts/verify-pins.sh` passes)
- [ ] Docs updated (README, docs/*, per-module checklist) where behaviour changed

## Security impact

<!-- None / describe: new input, new permission, new external call, change to headers or CSP, change to a gate. -->
