# Contributing

## Ground rules
- Work on a branch and open a pull request. `main` is changed through pull requests only, squash-merged so GitHub signs the commit.
- Use **synthetic data only**. Never commit real personal data, customer data, credentials, tokens or keys.
- Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `docs:`, `chore:`, `ci:`).
- Sign your commits (SSH or GPG) as described in [docs/security/PIPELINE.md](docs/security/PIPELINE.md), "Commit signing".
- Read [docs/architecture/PORTING_GUIDE.md](docs/architecture/PORTING_GUIDE.md) and [docs/security/SOD_MATRIX.md](docs/security/SOD_MATRIX.md) before changing a module. Mutations go through the service layer, are deny-by-default and write an audit entry.

## Local setup
```bash
cd front-end
npm ci --ignore-scripts
npm run dev
```

## Checks to pass before a pull request
```bash
cd front-end
npm run lint        # ESLint; warnings are capped, new violations fail
npm run ci          # typecheck, unit tests, production build
npm run test:e2e    # Playwright
```
CI runs the same gates plus security scanning. Any new GitHub Action must be pinned to a full commit SHA (`.github/scripts/verify-pins.sh`).

## Keeping the stack doc current
`docs/architecture/STACK.md` (every package and version) is generated. After changing dependencies, `tsconfig.json`, the CI Node version or `dependabot.yml`, run this from the repository root and commit the result:
```bash
node .github/scripts/generate-stack.mjs
```
`node .github/scripts/generate-stack.mjs --check` fails if the file is out of date or a package has no description (add it to `ROLES` in the script).

## Where things go
See [docs/ORGANIZATION.md](docs/ORGANIZATION.md).

## Blame
After a bulk move or format commit, add its hash to `.git-blame-ignore-revs`. To use it locally:
```bash
git config blame.ignoreRevsFile .git-blame-ignore-revs
```

## Reporting security issues
Do not open a public issue. See [SECURITY.md](SECURITY.md).
