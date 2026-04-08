#!/usr/bin/env node

import { pathToFileURL } from 'node:url';
import path from 'node:path';
import fs from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import process from 'node:process';
import { spawn } from 'node:child_process';
import readline from 'node:readline';

const UPSTREAM_REPO = 'https://github.com/MagicMirrorOrg/MagicMirror-3rd-Party-Modules.git';
const DEFAULT_SHARED_CHECKER_REPO = process.env.MAGICMIRROR_CHECKER_REPO || '/opt/mm-module-checker';
const DEFAULT_SHARED_CHECKER_REPO_REF = process.env.MAGICMIRROR_CHECKER_REPO_REF || 'main';
const DEFAULT_FALLBACK_CHECKER_REPO = path.join('/tmp', 'mm-module-checker-all');
const DEFAULT_MODULES_ROOT = '/opt/magic_mirror/modules';
const CURRENT_MODULE_DIR = path.resolve(process.env.MAGICMIRROR_CURRENT_MODULE_DIR || process.cwd());

function resolveDefaultCheckerRepo() {
  return existsSync(DEFAULT_SHARED_CHECKER_REPO) ? DEFAULT_SHARED_CHECKER_REPO : DEFAULT_FALLBACK_CHECKER_REPO;
}

function isSharedCheckerRepo(repoPath) {
  return path.resolve(repoPath) === path.resolve(DEFAULT_SHARED_CHECKER_REPO);
}

function extractLinks(text, urlMap) {
  let currentIndex = urlMap.size + 1;
  return text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (match, linkText, url) => {
    let refNum = null;
    for (const [num, storedUrl] of urlMap.entries()) {
      if (storedUrl === url) {
        refNum = num;
        break;
      }
    }
    if (refNum === null) {
      refNum = currentIndex++;
      urlMap.set(refNum, url);
    }
    return `${linkText} [${refNum}]`;
  });
}

function smartWrap(text, maxWidth = null, indent = '', hangingIndent = '') {
  const width = maxWidth || process.stdout.columns || 80;
  if (indent.length + text.length <= width) {
    return indent + text;
  }

  const lines = [];
  const fullHangingIndent = indent + hangingIndent;
  const chunks = [];
  let remaining = text;

  while (remaining.length > 0) {
    remaining = remaining.trimStart();
    if (remaining.length === 0) break;

    const parenMatch = remaining.match(/^\([^)]+\)(?:\s*\[\d+\])?[.,;]?/);
    if (parenMatch) {
      chunks.push(parenMatch[0]);
      remaining = remaining.slice(parenMatch[0].length);
      continue;
    }

    const sentenceMatch = remaining.match(/^[^.()]+\./);
    if (sentenceMatch) {
      chunks.push(sentenceMatch[0]);
      remaining = remaining.slice(sentenceMatch[0].length);
      continue;
    }

    const wordMatch = remaining.match(/^\S+(?:\s*\[\d+\])?[.,;]?/);
    if (wordMatch) {
      chunks.push(wordMatch[0]);
      remaining = remaining.slice(wordMatch[0].length);
      continue;
    }

    chunks.push(remaining[0]);
    remaining = remaining.slice(1);
  }

  let currentLine = '';
  let isFirstLine = true;

  for (const chunk of chunks) {
    const trimmedChunk = chunk.trim();
    if (!trimmedChunk) continue;

    const lineIndent = isFirstLine ? indent : fullHangingIndent;
    const testLine = currentLine ? `${currentLine} ${trimmedChunk}` : trimmedChunk;

    if (lineIndent.length + testLine.length <= width) {
      currentLine = testLine;
    } else {
      if (currentLine) {
        lines.push(lineIndent + currentLine);
        isFirstLine = false;
      }
      currentLine = trimmedChunk;
    }
  }

  if (currentLine) {
    const lineIndent = isFirstLine ? indent : fullHangingIndent;
    lines.push(lineIndent + currentLine);
  }

  return lines.join('\n');
}

function findModulesDirectory(overridePath = null) {
  if (overridePath && existsSync(overridePath)) {
    return path.resolve(overridePath);
  }

  let checkPath = CURRENT_MODULE_DIR;

  for (let i = 0; i < 8; i++) {
    const modulesPath = path.join(checkPath, 'modules');
    const packageJsonPath = path.join(checkPath, 'package.json');
    if (existsSync(modulesPath) && existsSync(packageJsonPath)) {
      try {
        const pkg = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
        if (pkg.name === 'magicmirror') {
          return modulesPath;
        }
      } catch {
        // ignore broken package.json and continue walking upwards
      }
    }

    const parentPath = path.dirname(checkPath);
    if (parentPath === checkPath) break;
    checkPath = parentPath;
  }

  if (existsSync(DEFAULT_MODULES_ROOT)) {
    return DEFAULT_MODULES_ROOT;
  }

  throw new Error('Could not find MagicMirror modules directory. Use --modules-root=PATH if needed.');
}

function detectCurrentModule(modulesRoot) {
  let checkPath = CURRENT_MODULE_DIR;

  for (let i = 0; i < 6; i++) {
    const packageJsonPath = path.join(checkPath, 'package.json');
    const moduleName = path.basename(checkPath);
    if (existsSync(packageJsonPath) && existsSync(path.join(modulesRoot, moduleName))) {
      return { name: moduleName, dir: checkPath };
    }

    const parentPath = path.dirname(checkPath);
    if (parentPath === checkPath) break;
    checkPath = parentPath;
  }

  return { name: null, dir: CURRENT_MODULE_DIR };
}

function normalizePackage(pkg, moduleName) {
  const normalized = {};
  normalized.name = pkg && typeof pkg.name === 'string' ? pkg.name : moduleName;
  normalized.version = pkg && typeof pkg.version === 'string' ? pkg.version : '0.0.0';
  normalized.description =
    pkg && typeof pkg.description === 'string' ? pkg.description : `MagicMirror module: ${moduleName}`;
  normalized.license = pkg && typeof pkg.license === 'string' ? pkg.license : 'none';
  normalized.keywords = Array.isArray(pkg && pkg.keywords)
    ? pkg.keywords.filter((keyword) => typeof keyword === 'string' && keyword.length > 0)
    : [];
  if (normalized.keywords.length === 0) normalized.keywords = ['Other'];

  let repositoryUrl = '';
  try {
    repositoryUrl = (pkg && pkg.repository && pkg.repository.url) || pkg.repository || '';
    if (typeof repositoryUrl !== 'string') repositoryUrl = '';
    repositoryUrl = repositoryUrl.replace(/^git\+/, '').replace(/\.git$/, '');
  } catch {
    repositoryUrl = '';
  }

  normalized.repositoryUrl = repositoryUrl;
  normalized.dependencies =
    pkg && typeof pkg.dependencies === 'object' && pkg.dependencies ? pkg.dependencies : {};
  normalized.devDependencies =
    pkg && typeof pkg.devDependencies === 'object' && pkg.devDependencies ? pkg.devDependencies : {};
  normalized.scripts = pkg && typeof pkg.scripts === 'object' && pkg.scripts ? pkg.scripts : {};
  return normalized;
}

function printHelp() {
  console.log('\nUsage: node magicmirror-check.mjs [options]');
  console.log('\nOptions:');
  console.log('  --current                 Check the current module (resolved from CWD or wrapper env)');
  console.log('  --module=NAME             Check a specific module by name');
  console.log('  --modules=NAME1,NAME2     Check multiple specific modules');
  console.log('  --modules-root=PATH       Override modules root directory');
  console.log('  --checker-repo=PATH       Override checker repo location');
  console.log('  --output-dir=PATH         Write magicmirror-check-results.md to this directory');
  console.log('  --cleanup                 Remove temporary checker files after run');
  console.log('  --help                    Show this help message');
  console.log('');
}

function parseCliArguments() {
  const args = process.argv.slice(2);
  const config = {
    filterMode: 'all',
    specificModules: [],
    cliModulesRoot: null,
    cliCheckerRepo: null,
    cliOutputDir: null,
    cleanup: false,
  };

  for (const arg of args) {
    if (arg === '--current') {
      config.filterMode = 'current';
    } else if (arg.startsWith('--module=')) {
      config.filterMode = 'specific';
      config.specificModules.push(arg.slice('--module='.length));
    } else if (arg.startsWith('--modules=')) {
      config.filterMode = 'specific';
      config.specificModules.push(...arg.slice('--modules='.length).split(',').filter(Boolean));
    } else if (arg.startsWith('--modules-root=')) {
      config.cliModulesRoot = arg.slice('--modules-root='.length);
    } else if (arg.startsWith('--checker-repo=')) {
      config.cliCheckerRepo = arg.slice('--checker-repo='.length);
    } else if (arg.startsWith('--output-dir=')) {
      config.cliOutputDir = arg.slice('--output-dir='.length);
    } else if (arg === '--cleanup') {
      config.cleanup = true;
    } else if (arg === '--help') {
      printHelp();
      process.exit(0);
    } else {
      console.error(`Unknown argument: ${arg}`);
      printHelp();
      process.exit(1);
    }
  }

  return config;
}

function normalizeAndValidateCheckerRepo(checkerRepo) {
  if (typeof checkerRepo !== 'string') {
    throw new Error('Invalid checker repository path: expected a string');
  }

  const trimmed = checkerRepo.trim();
  if (trimmed.length === 0) {
    throw new Error('Invalid checker repository path: path must not be empty');
  }

  const normalized = path.resolve(trimmed);
  const disallowedPattern = /["'`$&|;<>]/;
  if (disallowedPattern.test(normalized)) {
    throw new Error('Invalid checker repository path: contains forbidden characters');
  }

  return normalized;
}

function runCommandCapture(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }

      const error = new Error(`${command} ${args.join(' ')} exited with code ${code}`);
      error.stdout = stdout;
      error.stderr = stderr;
      reject(error);
    });
  });
}

async function getLocalCommitDate(repoPath) {
  try {
    const { stdout } = await runCommandCapture('git', ['log', '-1', '--format=%cI'], { cwd: repoPath });
    const value = stdout.trim();
    return value.length > 0 ? value : null;
  } catch {
    return null;
  }
}

async function updateGitCheckerRepository(repoPath) {
  console.log(`🔄 Updating checker repository from origin/${DEFAULT_SHARED_CHECKER_REPO_REF}...`);
  try {
    await runCommandCapture('git', ['fetch', '--depth', '1', 'origin', DEFAULT_SHARED_CHECKER_REPO_REF], { cwd: repoPath });
    await runCommandCapture('git', ['reset', '--hard', 'FETCH_HEAD'], { cwd: repoPath });
    await runCommandCapture('git', ['clean', '-fd'], { cwd: repoPath });
  } catch (error) {
    console.log(`⚠️  Could not update checker repository, using cached checkout: ${error.message}`);
  }
}

async function ensureCheckerRepository(checkerRepo) {
  const safeCheckerRepo = normalizeAndValidateCheckerRepo(checkerRepo);
  const gitDir = path.join(safeCheckerRepo, '.git');

  if (existsSync(safeCheckerRepo) && existsSync(gitDir)) {
    await updateGitCheckerRepository(safeCheckerRepo);
  }

  if (!existsSync(safeCheckerRepo)) {
    console.log('Fetching checker repository via `degit` (first time only)...');
    try {
      await new Promise((resolve, reject) => {
        const child = spawn('npx', ['-y', 'degit', `MagicMirrorOrg/MagicMirror-3rd-Party-Modules#${DEFAULT_SHARED_CHECKER_REPO_REF}`, safeCheckerRepo], {
          stdio: 'inherit',
        });
        child.on('error', reject);
        child.on('exit', (code) => {
          if (code === 0) resolve();
          else reject(new Error(`degit exited with code ${code}`));
        });
      });
    } catch (error) {
      console.log('`degit` failed or not available, falling back to git clone and stripping .git:', error?.message || error);
      await new Promise((resolve, reject) => {
        const child = spawn('git', ['clone', '--depth', '1', '--branch', DEFAULT_SHARED_CHECKER_REPO_REF, UPSTREAM_REPO, safeCheckerRepo], {
          stdio: 'inherit',
        });
        child.on('error', reject);
        child.on('exit', (code) => {
          if (code === 0) resolve();
          else reject(new Error(`git clone exited with code ${code}`));
        });
      });
      try {
        await fs.rm(path.join(safeCheckerRepo, '.git'), { recursive: true, force: true });
      } catch {
        // keep going, .git removal is only a fallback cleanup
      }
    }
  }

  if (!existsSync(path.join(safeCheckerRepo, 'node_modules'))) {
    console.log('📦 Installing checker dependencies...');
    await new Promise((resolve, reject) => {
      const child = spawn('npm', ['install', '--no-audit', '--no-fund'], { cwd: safeCheckerRepo, stdio: 'inherit' });
      child.on('error', reject);
      child.on('exit', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`npm install exited with code ${code}`));
      });
    });
  }
}

async function scanModules(modulesRoot, filterMode, specificModules) {
  const moduleDirs = await fs.readdir(modulesRoot, { withFileTypes: true });
  const validModules = [];

  for (const dirent of moduleDirs) {
    if (!dirent.isDirectory()) continue;

    const moduleName = dirent.name;
    const modulePath = path.join(modulesRoot, moduleName);
    const packageJsonPath = path.join(modulePath, 'package.json');

    if (moduleName === 'default' || !existsSync(packageJsonPath)) {
      continue;
    }

    if ((filterMode === 'specific' || filterMode === 'current') && specificModules.length > 0 && !specificModules.includes(moduleName)) {
      continue;
    }

    try {
      const pkg = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
      const repositoryUrl = pkg.repository?.url?.replace(/^git\+/, '').replace(/\.git$/, '') || '';
      const maintainer = repositoryUrl.match(/github\.com\/([^/]+)\//)?.[1] || 'unknown';

      validModules.push({
        name: moduleName,
        path: modulePath,
        pkg,
        maintainer,
        repoUrl: repositoryUrl,
      });
    } catch {
      console.log(`⚠️  Skipping ${moduleName}: Invalid package.json`);
    }
  }

  return validModules;
}

async function prepareCheckerFiles(checkerRepo, validModules) {
  const checkerModulesDir = path.join(checkerRepo, 'modules');
  await fs.mkdir(checkerModulesDir, { recursive: true });

  const websiteDataDir = path.join(checkerRepo, 'website', 'data');
  const websiteDir = path.join(checkerRepo, 'website');
  const filesToClean = [
    path.join(websiteDataDir, 'modules.stage.4.json'),
    path.join(websiteDataDir, 'modules.json'),
    path.join(websiteDataDir, 'moduleCache.json'),
    path.join(websiteDir, 'result.md'),
  ];

  for (const file of filesToClean) {
    if (existsSync(file)) {
      await fs.rm(file, { force: true });
    }
  }

  console.log(validModules.length === 1 ? '\n📋 Preparing module for analysis...' : '\n📋 Copying modules...');

  const moduleDataArray = [];
  const preserveGitMetadata = validModules.length === 1;

  for (const mod of validModules) {
    const moduleCopyPath = path.join(checkerModulesDir, `${mod.name}-----${mod.maintainer}`);
    const lastCommit = await getLocalCommitDate(mod.path);

    if (existsSync(moduleCopyPath)) {
      await fs.rm(moduleCopyPath, { recursive: true, force: true });
    }

    if (validModules.length > 1) {
      console.log(`  ✓  ${mod.name}`);
    }

    await fs.cp(mod.path, moduleCopyPath, {
      recursive: true,
      filter: (src) => {
        const relativePath = path.relative(mod.path, src);
        return (
          !relativePath.startsWith('node_modules') &&
          (preserveGitMetadata || (relativePath !== '.git' && !relativePath.startsWith('.git/'))) &&
          !relativePath.startsWith('.mm-module-checker') &&
          relativePath !== 'magicmirror-check-results.md' &&
          !relativePath.endsWith(`scripts${path.sep}magicmirror-check.mjs`) &&
          !relativePath.includes(`${path.sep}.devcontainer${path.sep}`)
        );
      },
    });

    const normalizedPackage = normalizePackage(mod.pkg, mod.name);
    const moduleId = `${mod.maintainer}/${mod.name}`;
    moduleDataArray.push({
      id: moduleId,
      name: mod.name,
      category: normalizedPackage.keywords[0] || 'Other',
      maintainer: mod.maintainer,
      maintainerURL: `https://github.com/${mod.maintainer}`,
      url: mod.repoUrl || normalizedPackage.repositoryUrl || `https://github.com/${moduleId}`,
      description: normalizedPackage.description,
      license: normalizedPackage.license,
      keywords: normalizedPackage.keywords,
      lastCommit,
      issues: [],
      packageJson: {
        status: 'parsed',
        summary: {
          name: normalizedPackage.name,
          version: normalizedPackage.version,
          description: normalizedPackage.description,
          license: normalizedPackage.license,
          keywords: normalizedPackage.keywords,
          dependencies: normalizedPackage.dependencies,
          devDependencies: normalizedPackage.devDependencies,
          scripts: normalizedPackage.scripts,
        },
      },
    });
  }

  await fs.mkdir(websiteDataDir, { recursive: true });
  await fs.writeFile(path.join(websiteDataDir, 'modules.stage.4.json'), JSON.stringify({ modules: moduleDataArray }, null, 2));

  return { moduleDataArray };
}

async function runChecker(checkerRepo, moduleDataArray, validModules) {
  const checkText = validModules.length === 1 ? 'Running module check...' : `Running checks for ${validModules.length} modules...`;
  console.log(`\n🔎 ${checkText}`);

  const previousLogLevel = process.env.LOG_LEVEL;
  const previousLogFormat = process.env.LOG_FORMAT;
  process.env.LOG_LEVEL = 'error';
  process.env.LOG_FORMAT = 'text';

  const checkerRepoUrl = pathToFileURL(`${checkerRepo}${path.sep}`).href;
  const [{ createInProcessStageRunner }, { loadStageGraph, buildExecutionPlan }, { runStagesSequentially }] = await Promise.all([
    import(new URL('scripts/orchestrator/in-process-stage-runner.ts', checkerRepoUrl).href),
    import(new URL('scripts/orchestrator/stage-graph.ts', checkerRepoUrl).href),
    import(new URL('scripts/orchestrator/stage-executor.ts', checkerRepoUrl).href),
  ]);

  const graphPath = path.join(checkerRepo, 'pipeline', 'stage-graph.json');
  const graph = await loadStageGraph(graphPath);
  const { stages } = buildExecutionPlan(graph, 'full-refresh-parallel');

  const spinnerFrames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  let frameIndex = 0;
  let elapsed = 0;
  const tick = 200;
  let activeStage = 'collect-metadata';

  const spinnerInterval = setInterval(() => {
    const frame = spinnerFrames[frameIndex++ % spinnerFrames.length];
    const text = `Checking... ${frame} ${Math.floor(elapsed / 1000)}s  ${activeStage}`;
    try {
      readline.clearLine(process.stdout, 0);
      readline.cursorTo(process.stdout, 0);
      process.stdout.write(text);
    } catch {
      return;
    }
    elapsed += tick;
  }, tick);

  const flushSpinner = () => {
    try {
      readline.clearLine(process.stdout, 0);
      readline.cursorTo(process.stdout, 0);
    } catch {
      // nothing to do
    }
  };

  const stageRunner = createInProcessStageRunner({
    projectRoot: checkerRepo,
    stageRuntimes: {
      collectMetadata: async () => ({ modules: moduleDataArray }),
    },
  });

  try {
    await runStagesSequentially(stages, {
      cwd: checkerRepo,
      env: {
        ...process.env,
        LOG_LEVEL: 'error',
        LOG_FORMAT: 'text',
        NODE_OPTIONS: '--no-warnings',
      },
      stageRunner,
      logger: {
        start: (stage) => {
          activeStage = stage.id;
        },
      },
    });
  } finally {
    clearInterval(spinnerInterval);
    flushSpinner();
    if (previousLogLevel === undefined) {
      delete process.env.LOG_LEVEL;
    } else {
      process.env.LOG_LEVEL = previousLogLevel;
    }
    if (previousLogFormat === undefined) {
      delete process.env.LOG_FORMAT;
    } else {
      process.env.LOG_FORMAT = previousLogFormat;
    }
  }

  console.log('Checking complete.');
}

async function parseCheckerResults(checkerRepo, validModules) {
  const websiteDataDir = path.join(checkerRepo, 'website', 'data');
  const modulesJsonPath = path.join(websiteDataDir, 'modules.json');
  const modulesData = JSON.parse(await fs.readFile(modulesJsonPath, 'utf8'));
  const resultMd = await fs.readFile(path.join(checkerRepo, 'website', 'result.md'), 'utf8');

  const moduleSections = resultMd.split(/### \[/).slice(1);
  const issuesByModule = {};

  for (const section of moduleSections) {
    const moduleNameMatch = section.match(/^([^\]]+)/);
    if (!moduleNameMatch) continue;

    const fullName = moduleNameMatch[1];
    const moduleName = fullName.split(' by ')[0];
    const issueMatches = [];
    const lines = section.split('\n');
    let currentIssue = '';

    for (const line of lines) {
      if (line.match(/^\d+\./)) {
        if (currentIssue) issueMatches.push(currentIssue);
        currentIssue = line.replace(/^\d+\.\s*/, '').trim();
      } else if (line.trim().startsWith('-') && currentIssue) {
        currentIssue += `\n${line.trim()}`;
      } else if (line.trim() && currentIssue) {
        currentIssue += ` ${line.trim()}`;
      }
    }
    if (currentIssue) issueMatches.push(currentIssue);
    issuesByModule[moduleName] = issueMatches;
  }

  return modulesData.modules
    .filter((mod) => validModules.some((validModule) => validModule.name === mod.name))
    .map((mod) => ({
      name: mod.name,
      issues: issuesByModule[mod.name] || [],
    }));
}

function displayResults(allResults) {
  const resultTitle = allResults.length === 1 ? `Module Check Result: ${allResults[0].name}` : `Module Check Results: ${allResults.length} modules checked`;

  console.log(`${'='.repeat(80)}`);
  console.log(resultTitle);
  console.log('='.repeat(80));

  let totalIssues = 0;
  const cleanModules = [];
  const modulesWithIssues = [];

  for (const result of allResults) {
    if (result.issues.length > 0) {
      totalIssues += result.issues.length;
      modulesWithIssues.push(result);
    } else {
      cleanModules.push(result);
    }
  }

  if (cleanModules.length > 0) {
    const passText = cleanModules.length === 1 ? '✅ Module passed all checks' : `✅ ${cleanModules.length} modules passed all checks`;
    console.log(`\n${passText}`);
    if (cleanModules.length > 1) {
      cleanModules.forEach((mod) => console.log(`  ✓ ${mod.name}`));
    }
  }

  if (modulesWithIssues.length > 0) {
    const issueText =
      allResults.length === 1
        ? `⚠️  ${totalIssues} issue${totalIssues > 1 ? 's' : ''} found`
        : `⚠️  ${modulesWithIssues.length} module${modulesWithIssues.length > 1 ? 's' : ''} with issues (${totalIssues} total)`;
    console.log(`\n${issueText}:\n`);

    modulesWithIssues.forEach((mod) => {
      const urlMap = new Map();
      if (allResults.length > 1) {
        console.log(`  📦 ${mod.name} (${mod.issues.length} issue${mod.issues.length > 1 ? 's' : ''})`);
      }
      mod.issues.forEach((issue, index) => {
        const issueLines = issue.split('\n');
        const baseIndent = allResults.length > 1 ? '     ' : '  ';
        const subIndent = `${baseIndent}   `;

        const processedText = extractLinks(issueLines[0], urlMap);
        console.log(smartWrap(`${index + 1}. ${processedText}`, null, baseIndent, '   '));

        for (let lineIndex = 1; lineIndex < issueLines.length; lineIndex++) {
          const processedSubItem = extractLinks(issueLines[lineIndex], urlMap);
          console.log(smartWrap(processedSubItem, null, subIndent, '  '));
        }
      });

      if (urlMap.size > 0) {
        console.log(`\n    📎 Links for ${mod.name}:`);
        for (const [num, url] of urlMap.entries()) {
          console.log(`     [${num}] ${url}`);
        }
      }

      console.log('');
    });
  }

  return { cleanModules, modulesWithIssues, totalIssues };
}

function determineResultsDirectory(modulesRoot, cliOutputDir, filterMode, currentModuleDir, specificModules, validModules) {
  let resultsDir = modulesRoot;

  if (cliOutputDir && cliOutputDir.length > 0) {
    if (cliOutputDir === '.' || cliOutputDir.toLowerCase() === 'cwd') {
      resultsDir = process.cwd();
    } else {
      resultsDir = path.isAbsolute(cliOutputDir) ? cliOutputDir : path.join(process.cwd(), cliOutputDir);
    }
  } else if (filterMode === 'current' && currentModuleDir) {
    resultsDir = currentModuleDir;
  } else if (filterMode === 'specific' && specificModules.length === 1) {
    const validModule = validModules.find((module) => module.name === specificModules[0]);
    if (validModule?.path) resultsDir = validModule.path;
  }

  return resultsDir;
}

async function writeResultsFile(resultsDir, modulesRoot, allResults, cleanModules, modulesWithIssues, totalIssues) {
  const resultsPath = path.join(resultsDir, 'magicmirror-check-results.md');
  let resultsContent = '# MagicMirror Module Check Results\n\n';
  resultsContent += `**Check Date:** ${new Date().toLocaleString('en-US')}\n`;
  resultsContent += `**Modules Directory:** ${modulesRoot}\n`;
  resultsContent += `**Modules Checked:** ${allResults.length}\n\n`;
  resultsContent += '## Summary\n\n';
  resultsContent += `- ✅ **${cleanModules.length}** modules passed all checks\n`;
  resultsContent += `- ⚠️  **${modulesWithIssues.length}** modules with issues\n`;
  resultsContent += `- 📊 **${totalIssues}** total issues found\n\n`;

  if (cleanModules.length > 0) {
    resultsContent += `## ✅ Modules Passed (${cleanModules.length})\n\n`;
    cleanModules.forEach((mod) => {
      resultsContent += `- ${mod.name}\n`;
    });
    resultsContent += '\n';
  }

  if (modulesWithIssues.length > 0) {
    resultsContent += `## ⚠️ Modules with Issues (${modulesWithIssues.length})\n\n`;
    modulesWithIssues.forEach((mod) => {
      const urlMap = new Map();
      resultsContent += `### ${mod.name}\n`;
      resultsContent += `**Issues:** ${mod.issues.length}\n`;
      mod.issues.forEach((issue, index) => {
        const lines = issue.split('\n');
        const first = extractLinks(lines[0], urlMap);
        let formattedIssue = `${index + 1}. ${first}`;
        for (let lineIndex = 1; lineIndex < lines.length; lineIndex++) {
          formattedIssue += `\n${extractLinks(lines[lineIndex], urlMap)}`;
        }
        resultsContent += `${formattedIssue}\n`;
      });

      if (urlMap.size > 0) {
        resultsContent += '\n**Links:**\n';
        for (const [num, url] of urlMap.entries()) {
          resultsContent += `- [${num}] ${url}\n`;
        }
      }

      resultsContent += '\n';
    });
  }

  resultsContent += '---\n\n';
  resultsContent += 'Compare with results: https://modules.magicmirror.builders/result.html\n';

  await fs.writeFile(resultsPath, resultsContent);
  return resultsPath;
}

async function main() {
  try {
    const cliConfig = parseCliArguments();
    let modulesRoot = null;
    let checkerRepo = resolveDefaultCheckerRepo();

    try {
      modulesRoot = findModulesDirectory(cliConfig.cliModulesRoot);
    } catch {
      console.warn('Warning: could not auto-detect modules directory, falling back to CLI or default.');
      if (cliConfig.cliModulesRoot && existsSync(cliConfig.cliModulesRoot)) {
        modulesRoot = path.resolve(cliConfig.cliModulesRoot);
      } else {
        modulesRoot = findModulesDirectory();
      }
    }

    if (cliConfig.cliCheckerRepo && cliConfig.cliCheckerRepo.length > 0) {
      checkerRepo = cliConfig.cliCheckerRepo;
    }

    let currentModuleName = null;
    let currentModuleDir = CURRENT_MODULE_DIR;

    if (cliConfig.filterMode === 'current') {
      const detectedModule = detectCurrentModule(modulesRoot);
      currentModuleName = detectedModule.name;
      currentModuleDir = detectedModule.dir;

      if (!currentModuleName) {
        console.error('❌ Error: Could not determine current module. Run the wrapper from the module root or use --module=NAME.');
        process.exit(1);
      }

      cliConfig.specificModules = [currentModuleName];
      cliConfig.filterMode = 'specific';
      console.log(`🔍 Checking current module: ${currentModuleName}`);
    } else if (cliConfig.filterMode === 'specific') {
      console.log(`🔍 Checking specific module(s): ${cliConfig.specificModules.join(', ')}`);
    } else {
      const displayRoot = cliConfig.cliModulesRoot || DEFAULT_MODULES_ROOT;
      console.log(`🔍 Setting up MagicMirror checker for all modules in: ${displayRoot}`);
    }

    await ensureCheckerRepository(checkerRepo);

    const validModules = await scanModules(modulesRoot, cliConfig.filterMode, cliConfig.specificModules);
    if (validModules.length === 0) {
      console.error('❌ Error: No valid modules found to check.');
      if (cliConfig.filterMode === 'specific') {
        console.error(`   Requested module(s): ${cliConfig.specificModules.join(', ')}`);
        console.error(`   Available modules in ${modulesRoot}:`);
        const allDirs = await fs.readdir(modulesRoot, { withFileTypes: true });
        for (const dirent of allDirs) {
          if (dirent.isDirectory() && dirent.name !== 'default' && existsSync(path.join(modulesRoot, dirent.name, 'package.json'))) {
            console.error(`     - ${dirent.name}`);
          }
        }
      }
      process.exit(1);
    }

    console.log(`\n📦 Found ${validModules.length} module${validModules.length > 1 ? 's' : ''} to check:`);
    validModules.forEach((mod, index) => {
      console.log(`  ${index + 1}. ${mod.name} (${mod.maintainer})`);
    });

    const { moduleDataArray } = await prepareCheckerFiles(checkerRepo, validModules);
    await runChecker(checkerRepo, moduleDataArray, validModules);

    const allResults = await parseCheckerResults(checkerRepo, validModules);
    const cleanModules = [];
    const modulesWithIssues = [];
    let totalIssues = 0;

    for (const result of allResults) {
      if (result.issues.length > 0) {
        totalIssues += result.issues.length;
        modulesWithIssues.push(result);
      } else {
        cleanModules.push(result);
      }
    }

    const resultsDir = determineResultsDirectory(modulesRoot, cliConfig.cliOutputDir, cliConfig.filterMode, currentModuleDir, cliConfig.specificModules, validModules);
    const resultsPath = await writeResultsFile(resultsDir, modulesRoot, allResults, cleanModules, modulesWithIssues, totalIssues);

    console.log('='.repeat(80));
    console.log(`📄 Results saved to: ${resultsPath}`);
    console.log('Compare with: https://modules.magicmirror.builders/result.html');
    console.log('='.repeat(80) + '\n');

    if (cliConfig.cleanup) {
      if (isSharedCheckerRepo(checkerRepo)) {
        console.log('⚠️  Skipping cleanup for the shared checker repository from the devcontainer image.');
      } else {
        console.log('🧹 Cleaning up checker files...');
        await fs.rm(checkerRepo, { recursive: true, force: true });
        console.log('✅ Cleanup complete\n');
      }
    } else {
      console.log('💡 Tip: Use --cleanup to remove temporary checker files after check');
    }

    displayResults(allResults);
  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.stderr) console.error(error.stderr);
    process.exit(1);
  }
}

main();