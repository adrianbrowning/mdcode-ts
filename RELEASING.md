# Releasing

`mdcode-ts` is released by [bumpy](https://bumpy.varlock.dev) from `.github/workflows/bumpy-release.yml`. That workflow is the only way a version reaches npm. It runs on every push to `main` and on nothing else, so pull requests and other branches can never publish.

## How a release happens

1. Each pull request that changes the package adds a bump file in `.bumpy/` (`pnpm bump`). The Bumpy Check workflow fails a PR without one, unless it has the `no-bump` label.
2. When that PR merges, the release workflow runs `bumpy ci plan`. With bump files pending, the mode is `version-pr`: the release gates run, then bumpy opens or updates the **Version Packages** PR, which bumps `packages/mdcode/package.json` and writes the changelog.
3. Merging the Version Packages PR pushes to `main` again. With no bump files left and a version that npm does not have yet, the mode is `publish`: the release gates run again, then the `publish` job publishes to npm with provenance and creates the git tag and GitHub release.

A push with no bump files and nothing unpublished does nothing.

## Release gates

The `gates` job runs before both the `version-pr` and `publish` jobs, and both of them need it to pass. If a gate fails in `version-pr` mode, the Version Packages PR is not opened or updated; in `publish` mode, nothing is published to npm.

| Step | Command | Fails when |
|------|---------|------------|
| Gate: type check | `pnpm lint:ts` | `tsc` reports an error |
| Gate: lint | `pnpm lint:esl && pnpm lint:s` | ESLint reports an error or warning |
| Gate: build | `pnpm build` | `zshy` cannot build `dist/` |
| Gate: tests | `pnpm test` | a unit or usage test fails |
| Gate: docs in sync | `pnpm docs:check` | a code block has drifted from its `file=`, or a `file=` cannot be read |
| Gate: runnable examples | `pnpm docs:examples` | a `runnable=true` block in `README.md` or `packages/mdcode/README.md` fails under Node |

`docs:check` runs [`examples/ci/check-docs-sync.mjs`](examples/ci/check-docs-sync.mjs) over every Markdown file the package ships or links to. `docs:examples` runs [`examples/ci/validate-snippets.mjs`](examples/ci/validate-snippets.mjs), which extracts the `runnable=true` blocks into `packages/mdcode/.mdcode-tmp/`. There, `import … from 'mdcode-ts'` resolves to the freshly built `dist/`. The gates job has a read-only token and no `id-token`, because it executes code from the Markdown.

`pnpm check`, the pre-push hook and the CI workflow run the same checks, so drift normally fails the PR that caused it rather than the release.

## One-time setup

These are account settings. The workflow cannot create them.

- **npm trusted publishing.** On npmjs.com, open the `mdcode-ts` package settings and add a trusted publisher: GitHub Actions, repository `adrianbrowning/mdcode-ts`, workflow `bumpy-release.yml`, environment `publish`. The `publish` job then authenticates through OIDC (`id-token: write`), so no npm token is stored. Trusted publishing needs a recent npm, so the job installs the latest npm first.
- **`publish` environment.** The `publish` job deploys to the `publish` environment, which has a deployment branch policy. Keep that policy limited to `main`. To approve each publication by hand, add yourself as a required reviewer there.
- **`BUMPY_GH_TOKEN` secret.** A token that can push branches and open pull requests in this repository. Bumpy uses it to push the Version Packages branch, so that PR's checks run (GitHub does not start workflows for pushes made with the default `GITHUB_TOKEN`). Without it, the workflow falls back to `github.token`.

The package name is `mdcode-ts` until #3 settles the canonical name. If it changes, update the trusted publisher on npm to the new package.

## When a gate fails

1. Open the failed run under **Actions → Bumpy Release**. The job summary and the error annotation name the failed gate, and that step's log has the details. `docs in sync` lists each drifted block by line; `runnable examples` names the block and the extracted file that failed.
2. Reproduce it locally with the command from the table, after `pnpm build`.
3. Fix it on a pull request to `main`. Docs drift is usually fixed with `mdcode update --apply <file>`; a failing example needs the Markdown changed until it runs.
4. Merge the fix. The push re-runs the workflow. If the fix carries an empty bump file (`pnpm bumpy add --empty`) or the `no-bump` label, the plan stays in `publish` mode and the pending version is published. If it carries a real bump file, bumpy updates the Version Packages PR instead, and merging that publishes the combined version.

For a flaky failure with no code change needed, use **Re-run failed jobs** on the same run.

If `publish` itself fails after the gates passed (for example a misconfigured trusted publisher), fix the setting and re-run the failed job. Bumpy publishes only the versions npm does not have yet, so a re-run never publishes a version twice.
