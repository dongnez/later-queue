import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = import.meta.dir;

function run(cmd: string) {
	console.log(`\n▶ ${cmd}`);
	const result = Bun.spawnSync(["sh", "-c", cmd], {
		cwd: root,
		stdio: ["inherit", "inherit", "inherit"],
	});
	if (result.exitCode !== 0) {
		console.error(`✗ Command failed: ${cmd}`);
		process.exit(result.exitCode ?? 1);
	}
}

function getVersion(): string {
	const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf-8"));
	return pkg.version;
}

// ── Step 1: Bump version via changeset ────────────────────────────────────
const versionBefore = getVersion();
console.log(`\n📦 Current version: ${versionBefore}`);
console.log("Running changeset version...");
run("bunx changeset version");

// ── Step 2: Check if version actually changed ────────────────────────────
const version = getVersion();

if (version === versionBefore) {
	console.log("\n⚠ No changesets found — nothing to release.");
	console.log("Run `bunx changeset` first to create a changeset.");
	process.exit(0);
}

const tag = `v${version}`;
console.log(`\n🦋 Version bumped: ${versionBefore} → ${version}`);

// ── Step 3: Commit version bump ──────────────────────────────────────────
run(`git add .`);
run(`git commit -m "chore: release ${tag}"`);

// ── Step 4: Build dist/ ─────────────────────────────────────────────────
run("bun run build");

// ── Step 5: Publish to npm ──────────────────────────────────────────────
run("bun publish");

// ── Step 6: Tag & push ──────────────────────────────────────────────────
run(`git tag ${tag}`);
run("git push");
run("git push --tags");

console.log(`\n✅ Released ${tag} — published to npm and pushed to remote.`);
