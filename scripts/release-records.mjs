import { packages, stableVersion } from './release-plan.mjs';

async function tagCommit(github, ref) {
  let object = ref?.object;
  for (let depth = 0; object?.type === 'tag' && depth < 8; depth++) {
    object = (await github('GET', `git/tags/${object.sha}`))?.object;
  }
  if (object?.type !== 'commit') throw new Error('Release tag does not resolve to a commit');
  return object.sha;
}

/** Verify both npm packages before creating any tags; existing records are never retargeted. */
export async function createReleaseRecords({ manifest, expectedCommit, github, lookup }) {
  if (!/^[a-f0-9]{40}$/.test(expectedCommit) || manifest?.commit !== expectedCommit ||
      manifest.registry !== 'https://registry.npmjs.org' || !Array.isArray(manifest.packages) ||
      manifest.packages.length !== packages.length) throw new Error('Release manifest commit or registry mismatch');
  const records = [];
  for (const [index, pkg] of manifest.packages.entries()) {
    if (pkg.name !== packages[index].name || !stableVersion(pkg.version) ||
        !/^sha512-[A-Za-z0-9+/]+={0,2}$/.test(pkg.integrity ?? '')) throw new Error('Invalid release package identity');
    if (await lookup(pkg) !== pkg.integrity) throw new Error(`Registry integrity mismatch or missing version: ${pkg.name}@${pkg.version}`);
    const tag = `${pkg.name}@${pkg.version}`;
    const refPath = `git/ref/tags/${encodeURIComponent(tag)}`;
    const releasePath = `releases/tags/${encodeURIComponent(tag)}`;
    const ref = await github('GET', refPath);
    if (ref && await tagCommit(github, ref) !== expectedCommit) throw new Error(`Refusing to move existing release tag ${tag}`);
    const release = await github('GET', releasePath);
    if (release && (!ref || release.draft || release.tag_name !== tag)) throw new Error(`Conflicting GitHub Release ${tag}`);
    records.push({ pkg, tag, refPath, releasePath, ref, release });
  }
  for (const record of records) {
    if (!record.ref) {
      try {
        await github('POST', 'git/refs', { ref: `refs/tags/${record.tag}`, sha: expectedCommit });
      } catch (error) {
        if (error.status !== 422) throw error;
        const ref = await github('GET', record.refPath);
        if (!ref || await tagCommit(github, ref) !== expectedCommit) throw error;
      }
    }
    if (!record.release) {
      const body = [
        `Published **${record.tag}** to [npm](https://www.npmjs.com/package/${record.pkg.name}/v/${record.pkg.version}).`,
        `Source commit: \`${expectedCommit}\`.`,
        `Verified npm archive integrity: \`${record.pkg.integrity}\`.`,
        'See CHANGELOG.md in the tagged package directory for release notes. Published npm versions are immutable.',
      ].join('\n\n');
      try {
        await github('POST', 'releases', {
          tag_name: record.tag, target_commitish: expectedCommit, name: record.tag,
          body, draft: false, prerelease: false, make_latest: 'false',
        });
      } catch (error) {
        if (error.status !== 422) throw error;
        const release = await github('GET', record.releasePath);
        const ref = await github('GET', record.refPath);
        if (!release || release.draft || release.tag_name !== record.tag ||
            !ref || await tagCommit(github, ref) !== expectedCommit) throw error;
      }
    }
  }
  return records.map(({ tag }) => tag);
}
