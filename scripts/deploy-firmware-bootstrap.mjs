import {
  buildFirmwareBootstrapArtifact,
  deployFirmwareBootstrap,
  getWorkspaceRoot,
} from './firmware-bootstrap-utils.mjs';

const readFlag = (flagName) => {
  const argv = process.argv.slice(2);
  const index = argv.indexOf(flagName);
  if (index < 0 || !argv[index + 1]) {
    return '';
  }

  return argv[index + 1];
};

const targetDrive = readFlag('--drive');
if (!targetDrive) {
  process.stderr.write('Usage: npm run deploy:firmware-bootstrap -- --drive <LETTER:|path>\n');
  process.exitCode = 1;
} else {
  const workspaceRoot = getWorkspaceRoot();
  const artifact = buildFirmwareBootstrapArtifact({ workspaceRoot });
  const result = deployFirmwareBootstrap({
    artifactDir: artifact.artifactDir,
    targetDir: targetDrive,
  });

  if (!result.ok) {
    process.stderr.write(`${result.message}\n`);
    process.exitCode = 1;
  } else {
    process.stdout.write(
      `${JSON.stringify(
        {
          firmwareVersion: result.version,
          artifactDir: result.artifactDir,
          targetDir: result.targetDir,
          boardFamily: result.boardFamily,
          copiedFiles: result.managedPaths.length,
          message: result.message,
        },
        null,
        2,
      )}\n`,
    );
  }
}
