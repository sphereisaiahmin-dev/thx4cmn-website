import { buildFirmwareBootstrapArtifact, getWorkspaceRoot } from './firmware-bootstrap-utils.mjs';

const workspaceRoot = getWorkspaceRoot();
const result = buildFirmwareBootstrapArtifact({ workspaceRoot });

process.stdout.write(
  `${JSON.stringify(
    {
      firmwareVersion: result.version,
      artifactDir: result.artifactDir,
      manifestPath: result.manifestPath,
      managedPaths: result.manifest.managedPaths,
    },
    null,
    2,
  )}\n`,
);
