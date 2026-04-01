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
const requestedBoard = readFlag('--board');
const consolePort = readFlag('--console-port');
const timeoutValue = readFlag('--timeout-ms');
const timeoutMs = timeoutValue ? Number.parseInt(timeoutValue, 10) : undefined;

if (!targetDrive) {
  process.stderr.write(
    'Usage: npm run deploy:firmware-bootstrap -- --drive <LETTER:|path> [--board pico|pico_w|pico2|pico2_w] [--console-port COMx] [--timeout-ms 180000]\n',
  );
  process.exitCode = 1;
} else {
  const workspaceRoot = getWorkspaceRoot();
  const artifact = buildFirmwareBootstrapArtifact({ workspaceRoot });
  const result = await deployFirmwareBootstrap({
    artifactDir: artifact.artifactDir,
    targetDir: targetDrive,
    board: requestedBoard,
    consolePort,
    timeoutMs,
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
          circuitPythonBoard: result.circuitPythonBoard,
          copiedFiles: result.managedPaths.length,
          message: result.message,
        },
        null,
        2,
      )}\n`,
    );
  }
}
