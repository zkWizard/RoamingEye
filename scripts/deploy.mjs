// Build the site for GitHub Pages and force-push it to the gh-pages branch.
//
// Usage: node scripts/deploy.mjs
//
// Publishes a single fresh commit each run (gh-pages history is disposable).
// The site is served at https://<owner>.github.io/<repo>/, so the build runs
// with DEPLOY_BASE=/<repo>/ (see vite.config.ts).
import { execSync } from "node:child_process";
import { writeFileSync, rmSync, existsSync } from "node:fs";

const run = (cmd, opts = {}) =>
  execSync(cmd, { stdio: "pipe", encoding: "utf8", ...opts }).trim();

const remote = run("git remote get-url origin");
const repoName = remote.match(/\/([^/]+?)(\.git)?$/)[1];
const sha = run("git rev-parse --short HEAD");
const base = process.env.DEPLOY_BASE ?? `/${repoName}/`;

console.log(`Building with base ${base} …`);
run("npm run build", { env: { ...process.env, DEPLOY_BASE: base } });

// Pages runs Jekyll by default, which drops files/dirs starting with "_".
// .nojekyll disables that and serves the Vite output verbatim.
writeFileSync("dist/.nojekyll", "");

console.log("Publishing dist/ to gh-pages …");
if (existsSync("dist/.git"))
  rmSync("dist/.git", { recursive: true, force: true });
run("git init -q", { cwd: "dist" });
run("git checkout -qb gh-pages", { cwd: "dist" });
run("git add -A", { cwd: "dist" });
run(`git commit -q -m "Deploy ${sha}"`, { cwd: "dist" });
run(`git push -f "${remote}" gh-pages`, { cwd: "dist" });
rmSync("dist/.git", { recursive: true, force: true });

console.log(
  `Deployed ${sha}. Site: ${remote
    .replace(/\.git$/, "")
    .replace("github.com/", "")
    .replace(/^.*[:/](.+)\/(.+)$/, "https://$1.github.io/$2/")}`
);
