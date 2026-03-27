#!/usr/bin/env node
"use strict";

const { parseArgs } = require("node:util");
const { resolve } = require("node:path");
const { readFileSync, writeFileSync, existsSync } = require("node:fs");
const { generateChangelog } = require("../lib/generator");
const { getGitLog, getLatestTag, getTags } = require("../lib/git");

const HELP = `
changelogai — AI-powered changelog from git history

Usage:
  changelogai [options]

Options:
  --from <ref>        Start from this ref (tag/commit/branch). Default: latest tag
  --to <ref>          End at this ref. Default: HEAD
  --output <file>     Output file. Default: stdout (use --output CHANGELOG.md to write)
  --format <fmt>      Output format: markdown (default), json, plain
  --group             Group commits by type (feat, fix, etc.)
  --ai                Use Claude API for intelligent summaries (requires ANTHROPIC_API_KEY)
  --model <model>     AI model to use. Default: claude-haiku-4-5-20251001
  --prepend           Prepend to existing file instead of overwriting
  --version-bump      Suggest next version based on changes (major/minor/patch)
  --repo <path>       Path to git repo. Default: current directory
  --max-commits <n>   Max commits to process. Default: 500
  --help              Show this help
  --version           Show version

Examples:
  changelogai                          # changelog since last tag
  changelogai --from v1.0.0 --to v2.0.0 --output CHANGELOG.md
  changelogai --ai --group             # AI-enhanced grouped changelog
  changelogai --version-bump           # suggest next semver
`;

const VERSION = JSON.parse(
  readFileSync(resolve(__dirname, "../package.json"), "utf8")
).version;

function main() {
  let args;
  try {
    args = parseArgs({
      options: {
        from: { type: "string" },
        to: { type: "string", default: "HEAD" },
        output: { type: "string" },
        format: { type: "string", default: "markdown" },
        group: { type: "boolean", default: false },
        ai: { type: "boolean", default: false },
        model: { type: "string", default: "claude-haiku-4-5-20251001" },
        prepend: { type: "boolean", default: false },
        "version-bump": { type: "boolean", default: false },
        repo: { type: "string", default: "." },
        "max-commits": { type: "string", default: "500" },
        help: { type: "boolean", default: false },
        version: { type: "boolean", default: false },
      },
      strict: true,
    });
  } catch (e) {
    console.error(`Error: ${e.message}\n`);
    console.log(HELP);
    process.exit(1);
  }

  const opts = args.values;

  if (opts.help) {
    console.log(HELP);
    return;
  }

  if (opts.version) {
    console.log(`changelogai v${VERSION}`);
    return;
  }

  const repoPath = resolve(opts.repo);

  if (opts.ai && !process.env.ANTHROPIC_API_KEY) {
    console.error(
      "Error: --ai requires ANTHROPIC_API_KEY environment variable.\n" +
        "Get one at https://console.anthropic.com/\n" +
        "Set it: export ANTHROPIC_API_KEY=sk-ant-..."
    );
    process.exit(1);
  }

  run(opts, repoPath).catch((err) => {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  });
}

async function run(opts, repoPath) {
  const fromRef = opts.from || getLatestTag(repoPath);
  const toRef = opts.to;
  const maxCommits = parseInt(opts["max-commits"], 10);

  if (!fromRef) {
    console.error(
      "No tags found. Use --from <commit> to specify a start point."
    );
    process.exit(1);
  }

  const commits = getGitLog(repoPath, fromRef, toRef, maxCommits);

  if (commits.length === 0) {
    console.log("No commits found in range.");
    return;
  }

  const result = await generateChangelog(commits, {
    format: opts.format,
    group: opts.group,
    ai: opts.ai,
    model: opts.model,
    versionBump: opts["version-bump"],
    fromRef,
    toRef,
  });

  if (opts.output) {
    const outPath = resolve(opts.output);
    if (opts.prepend && existsSync(outPath)) {
      const existing = readFileSync(outPath, "utf8");
      writeFileSync(outPath, result + "\n\n" + existing);
    } else {
      writeFileSync(outPath, result);
    }
    console.error(`Written to ${outPath}`);
  } else {
    process.stdout.write(result);
  }
}

main();
