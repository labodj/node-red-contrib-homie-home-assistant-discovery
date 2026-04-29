#!/usr/bin/env node
import { execFile } from "node:child_process";
import { access, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const npmBin = process.platform === "win32" ? "npm.cmd" : "npm";
const coreRootCandidates = [resolve(root, "../homie-home-assistant-discovery")];

const run = async (command, args, options = {}) => {
  try {
    return await execFileAsync(command, args, {
      cwd: root,
      maxBuffer: 1024 * 1024 * 16,
      ...options,
    });
  } catch (error) {
    const stderr = error.stderr ? `\n${error.stderr}` : "";
    const stdout = error.stdout ? `\n${error.stdout}` : "";
    throw new Error(`${command} ${args.join(" ")} failed.${stdout}${stderr}`, { cause: error });
  }
};

const findCoreRoot = async () => {
  for (const candidate of coreRootCandidates) {
    try {
      await access(join(candidate, "package.json"));
      return candidate;
    } catch {
      continue;
    }
  }
  throw new Error(
    `Missing sibling homie-home-assistant-discovery repository. Checked: ${coreRootCandidates.join(
      ", ",
    )}`,
  );
};

const ensureBuildExists = async (coreRoot) => {
  await access(join(root, "dist", "homie-ha-discovery.js"));
  await access(join(root, "dist", "homie-ha-discovery.html"));
  await access(join(coreRoot, "dist", "index.js"));
};

const pack = async (cwd, destination) => {
  const { stdout } = await run(npmBin, ["pack", "--json", "--pack-destination", destination], {
    cwd,
  });
  const [entry] = JSON.parse(stdout);
  return join(destination, entry.filename);
};

const main = async () => {
  const coreRoot = await findCoreRoot();
  await ensureBuildExists(coreRoot);
  const tempRoot = await mkdtemp(join(tmpdir(), "node-red-homie-ha-discovery-package-"));
  try {
    const packagesDir = join(tempRoot, "packages");
    const consumerDir = join(tempRoot, "consumer");
    await mkdir(packagesDir);
    await mkdir(consumerDir);

    const coreTarball = await pack(coreRoot, packagesDir);
    const wrapperTarball = await pack(root, packagesDir);

    await writeFile(join(consumerDir, "package.json"), JSON.stringify({ private: true }, null, 2));
    await run(
      npmBin,
      ["install", "--ignore-scripts", "--no-audit", "--no-fund", coreTarball, wrapperTarball],
      {
        cwd: consumerDir,
      },
    );

    await access(
      join(
        consumerDir,
        "node_modules",
        "node-red-contrib-homie-home-assistant-discovery",
        "dist",
        "homie-ha-discovery.html",
      ),
    );
    await run(
      process.execPath,
      [
        "--eval",
        `
          const register = require("node-red-contrib-homie-home-assistant-discovery");
          if (typeof register !== "function") throw new Error("missing Node-RED register export");
          if (typeof register.HomieHaDiscoveryNode !== "function") throw new Error("missing runtime export");
        `,
      ],
      { cwd: consumerDir },
    );

    console.log(`Verified local Node-RED package install from ${wrapperTarball}`);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
