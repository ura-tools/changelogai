"use strict";

const TYPE_LABELS = {
  feat: "Features",
  fix: "Bug Fixes",
  docs: "Documentation",
  refactor: "Refactoring",
  test: "Tests",
  chore: "Maintenance",
  style: "Code Style",
  perf: "Performance",
  ci: "CI/CD",
  build: "Build",
  other: "Other Changes",
};

const TYPE_ORDER = [
  "feat",
  "fix",
  "perf",
  "refactor",
  "docs",
  "test",
  "style",
  "chore",
  "ci",
  "build",
  "other",
];

async function generateChangelog(commits, opts) {
  const { format, group, ai, model, versionBump, fromRef, toRef } = opts;

  let changelog;

  if (ai) {
    changelog = await generateWithAI(commits, opts);
  } else if (group) {
    changelog = generateGrouped(commits, fromRef, toRef);
  } else {
    changelog = generateFlat(commits, fromRef, toRef);
  }

  if (versionBump) {
    const bump = suggestVersionBump(commits);
    changelog += `\n\n---\n**Suggested version bump:** \`${bump}\`\n`;
  }

  if (format === "json") {
    return JSON.stringify(
      {
        range: { from: fromRef, to: toRef },
        commits: commits.map((c) => ({
          hash: c.hashShort,
          type: c.type,
          scope: c.scope,
          breaking: c.breaking,
          subject: c.subject,
          author: c.author,
          date: c.date,
        })),
        suggestedBump: versionBump ? suggestVersionBump(commits) : undefined,
      },
      null,
      2
    );
  }

  if (format === "plain") {
    return commits
      .map((c) => `${c.date} ${c.hashShort} ${c.subject} (${c.author})`)
      .join("\n");
  }

  return changelog;
}

function generateFlat(commits, fromRef, toRef) {
  const date = new Date().toISOString().split("T")[0];
  let md = `## [${toRef}](${fromRef}..${toRef}) — ${date}\n\n`;

  const breaking = commits.filter((c) => c.breaking);
  if (breaking.length > 0) {
    md += `### BREAKING CHANGES\n\n`;
    for (const c of breaking) {
      md += `- **${c.subject}** (${c.hashShort})\n`;
    }
    md += "\n";
  }

  md += `### Changes\n\n`;
  for (const c of commits) {
    if (c.breaking) continue;
    const scope = c.scope ? `**${c.scope}:** ` : "";
    md += `- ${scope}${c.description || c.subject} (${c.hashShort})\n`;
  }

  md += `\n*${commits.length} commits from ${fromRef} to ${toRef}*\n`;
  return md;
}

function generateGrouped(commits, fromRef, toRef) {
  const date = new Date().toISOString().split("T")[0];
  let md = `## [${toRef}](${fromRef}..${toRef}) — ${date}\n\n`;

  const breaking = commits.filter((c) => c.breaking);
  if (breaking.length > 0) {
    md += `### BREAKING CHANGES\n\n`;
    for (const c of breaking) {
      md += `- **${c.subject}** (${c.hashShort})\n`;
    }
    md += "\n";
  }

  const groups = {};
  for (const c of commits) {
    const t = c.type || "other";
    if (!groups[t]) groups[t] = [];
    groups[t].push(c);
  }

  for (const type of TYPE_ORDER) {
    if (!groups[type] || groups[type].length === 0) continue;
    md += `### ${TYPE_LABELS[type] || type}\n\n`;
    for (const c of groups[type]) {
      const scope = c.scope ? `**${c.scope}:** ` : "";
      md += `- ${scope}${c.description || c.subject} (${c.hashShort})\n`;
    }
    md += "\n";
  }

  md += `*${commits.length} commits from ${fromRef} to ${toRef}*\n`;
  return md;
}

async function generateWithAI(commits, opts) {
  const { model, fromRef, toRef } = opts;
  const apiKey = process.env.ANTHROPIC_API_KEY;

  const commitList = commits
    .slice(0, 100) // limit for token efficiency
    .map(
      (c) =>
        `${c.hashShort} [${c.type}${c.scope ? `(${c.scope})` : ""}] ${c.subject}`
    )
    .join("\n");

  const prompt = `Generate a professional, human-readable changelog in Markdown from these git commits.

Range: ${fromRef} → ${toRef}
Date: ${new Date().toISOString().split("T")[0]}

Commits:
${commitList}

Rules:
1. Group by category (Features, Bug Fixes, Improvements, etc.)
2. Rewrite commit messages into clear, user-facing descriptions
3. Remove internal/developer jargon — write for end users
4. Highlight breaking changes prominently at the top
5. Use bullet points, keep each entry to one line
6. Include commit hash in parentheses at end of each entry
7. Add a brief 1-2 sentence summary at the top describing the overall theme of changes
8. Output ONLY the markdown, no commentary`;

  const body = JSON.stringify({
    model,
    max_tokens: 4096,
    messages: [{ role: "user", content: prompt }],
  });

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body,
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Anthropic API error ${res.status}: ${err}`);
  }

  const data = await res.json();
  return data.content[0].text;
}

function suggestVersionBump(commits) {
  const hasBreaking = commits.some((c) => c.breaking);
  const hasFeature = commits.some((c) => c.type === "feat");
  const hasFix = commits.some((c) => c.type === "fix");

  if (hasBreaking) return "major";
  if (hasFeature) return "minor";
  if (hasFix) return "patch";
  return "patch";
}

module.exports = { generateChangelog, suggestVersionBump };
