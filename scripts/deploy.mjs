// Build the site for GitHub Pages and force-push it to the gh-pages branch.
//
// Usage: node scripts/deploy.mjs
//
// Publishes a single fresh commit each run (gh-pages history is disposable).
// The site is served at the custom domain below (root path), so the build
// runs with DEPLOY_BASE=/ (see vite.config.ts). Because every deploy
// force-pushes a fresh gh-pages branch, the CNAME file GitHub Pages needs to
// keep the custom domain attached must be re-written into dist/ each run —
// without it, one deploy would silently detach roamingeye.org.
import { execSync } from "node:child_process";
import { writeFileSync, rmSync, existsSync } from "node:fs";

const run = (cmd, opts = {}) =>
  execSync(cmd, { stdio: "pipe", encoding: "utf8", ...opts }).trim();

const DOMAIN = "roamingeye.org";

const remote = run("git remote get-url origin");
const sha = run("git rev-parse --short HEAD");
const base = process.env.DEPLOY_BASE ?? "/";

console.log(`Building with base ${base} …`);
run("npm run build", { env: { ...process.env, DEPLOY_BASE: base } });

// Pages runs Jekyll by default, which drops files/dirs starting with "_".
// .nojekyll disables that and serves the Vite output verbatim.
writeFileSync("dist/.nojekyll", "");
writeFileSync("dist/CNAME", `${DOMAIN}\n`);

console.log("Publishing dist/ to gh-pages …");
if (existsSync("dist/.git"))
  rmSync("dist/.git", { recursive: true, force: true });
run("git init -q", { cwd: "dist" });
// The throwaway dist repo has no identity of its own — inherit the outer
// repo's (git commit refuses to run without one).
const userName = run("git config user.name");
const userEmail = run("git config user.email");
run(`git config user.name "${userName}"`, { cwd: "dist" });
run(`git config user.email "${userEmail}"`, { cwd: "dist" });
run("git checkout -qb gh-pages", { cwd: "dist" });
run("git add -A", { cwd: "dist" });
run(`git commit -q -m "Deploy ${sha}"`, { cwd: "dist" });
run(`git push -f "${remote}" gh-pages`, { cwd: "dist" });
rmSync("dist/.git", { recursive: true, force: true });

console.log(`Deployed ${sha}. Site: https://${DOMAIN}/`);
