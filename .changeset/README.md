# Release changes

Run `pnpm changeset` for a change that should ship to npm. Choose patch, minor or major
and describe the user-visible change. Commit the generated Markdown with your change.
Both packages are one fixed release group; a change to either versions both together.

The release bot opens/updates a version PR on main pushes. Merge that PR after its checks
pass to publish the committed versions. Do not manually bump versions or edit the generated
`release-plan.json`. See [releasing](../docs/RELEASING.md) for retries and recovery.
