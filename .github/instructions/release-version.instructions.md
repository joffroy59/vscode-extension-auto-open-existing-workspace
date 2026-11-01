---
description: Set the next development version after publishing a release.
applyTo: "**"
---

# Post-release version bump

- After the GitHub Release has been successfully created from its version-matched tag, make a separate commit to set the version for future development.
- Increment the patch component for the next development version unless the planned next release requires a minor or major version increment.
- Update the version consistently in `package.json` and `package-lock.json`.
- Keep this bump commit after the published release tag; do not amend or move the release tag.
- Use a clear commit message, such as `chore: bump version to 1.0.4 for development`.