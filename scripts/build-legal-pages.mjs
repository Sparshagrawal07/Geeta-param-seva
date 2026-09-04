/**
 * Builds static Privacy Policy / Terms HTML for GitHub Pages.
 * Source of truth: src/lib/legal-content.ts (member-facing sections)
 * Styles: website/styles.css → copied into docs/
 *
 * Usage: npm run build:legal-pages
 */
import * as esbuild from 'esbuild';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const outDir = path.join(root, 'docs');
const stylesSrc = path.join(root, 'website', 'styles.css');
const legalEntry = path.join(root, 'src/lib/legal-content.ts');

const LAST_UPDATED = 'August 2026';
const APP_NAME = 'Geeta Param Seva';

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function layout({ title, description, active, bodyHtml }) {
  const nav = [
    { href: 'index.html', id: 'home', label: 'Home' },
    { href: 'privacy-policy.html', id: 'privacy', label: 'Privacy Policy' },
    { href: 'terms.html', id: 'terms', label: 'Terms & Conditions' },
  ]
    .map((item) => {
      const cls = item.id === active ? ' aria-current="page"' : '';
      return `<a href="${item.href}"${cls}>${item.label}</a>`;
    })
    .join('\n        ');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="description" content="${escapeHtml(description)}" />
  <title>${escapeHtml(title)} · ${APP_NAME}</title>
  <link rel="stylesheet" href="styles.css" />
</head>
<body>
  <div class="wrap">
    <header class="site-header">
      <p class="brand"><a href="index.html">${APP_NAME}</a></p>
      <p class="tagline">Private community app for seva, practice, and scripture.</p>
      <nav class="site-nav" aria-label="Legal">
        ${nav}
      </nav>
    </header>
    <main>
${bodyHtml}
    </main>
    <footer class="site-footer">
      <p>© ${new Date().getFullYear()} Sparsh Agrawal. All rights reserved.</p>
      <p>This software is proprietary. Licensing: <a href="mailto:Sparshagrawaln@gmail.com">Sparshagrawaln@gmail.com</a></p>
      <p>App support: <a href="mailto:geetaparamseva@gmail.com">geetaparamseva@gmail.com</a></p>
    </footer>
  </div>
</body>
</html>
`;
}

function sectionsHtml(sections) {
  return sections
    .map(
      (section) => `      <section class="card">
        <h2>${escapeHtml(section.title)}</h2>
        <p>${escapeHtml(section.body)}</p>
      </section>`
    )
    .join('\n');
}

async function loadLegalModule() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gps-legal-'));
  const outfile = path.join(tmpDir, 'legal-content.mjs');
  try {
    // Bundle TS → ESM so this works on Node 20+ (CI) without relying on Node's TS stripper.
    // legal-content uses `import type` only from ./users — no Firebase runtime deps.
    await esbuild.build({
      entryPoints: [legalEntry],
      outfile,
      bundle: true,
      platform: 'node',
      format: 'esm',
      logLevel: 'silent',
    });
    // Await import before finally deletes the temp bundle.
    return await import(pathToFileURL(outfile).href);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

async function main() {
  fs.mkdirSync(outDir, { recursive: true });

  const legal = await loadLegalModule();

  const privacySections = legal.getPrivacyPolicySections('member');
  const termsSections = legal.getTermsOfServiceSections('member');

  const indexBody = `      <h1>${APP_NAME}</h1>
      <p class="meta">Legal documents for the mobile app (Expo / React Native).</p>
      <div class="hero-card">
        <h2>Public policies</h2>
        <p>
          These pages mirror the member-facing Privacy Policy and Terms of Service
          shown in the app. Admin accounts see additional in-app responsibilities.
        </p>
        <div class="cta-row">
          <a class="btn btn-primary" href="privacy-policy.html">Privacy Policy</a>
          <a class="btn btn-secondary" href="terms.html">Terms &amp; Conditions</a>
        </div>
      </div>
      <div class="hero-card">
        <h2>Contact</h2>
        <p>
          Support: <a href="mailto:${escapeHtml(legal.LEGAL_SUPPORT_EMAIL)}">${escapeHtml(legal.LEGAL_SUPPORT_EMAIL)}</a><br />
          Licensing / permissions: <a href="mailto:${escapeHtml(legal.LEGAL_LICENSING_EMAIL)}">${escapeHtml(legal.LEGAL_LICENSING_EMAIL)}</a>
        </p>
      </div>`;

  const privacyBody = `      <h1>Privacy Policy</h1>
      <p class="meta">Last updated: ${LAST_UPDATED} · Member-facing policy</p>
      <p class="note card">These terms apply to member accounts. Admin accounts have additional responsibilities shown in the app when signed in as an admin.</p>
${sectionsHtml(privacySections)}`;

  const termsBody = `      <h1>Terms &amp; Conditions</h1>
      <p class="meta">Last updated: ${LAST_UPDATED} · Member-facing terms</p>
      <p class="note card">These terms apply to member accounts. Admin accounts have additional responsibilities shown in the app when signed in as an admin.</p>
${sectionsHtml(termsSections)}`;

  if (!fs.existsSync(stylesSrc)) {
    throw new Error(`Missing ${stylesSrc}`);
  }
  fs.copyFileSync(stylesSrc, path.join(outDir, 'styles.css'));
  fs.writeFileSync(
    path.join(outDir, 'index.html'),
    layout({
      title: 'Legal',
      description: `${APP_NAME} privacy policy and terms of service.`,
      active: 'home',
      bodyHtml: indexBody,
    })
  );
  fs.writeFileSync(
    path.join(outDir, 'privacy-policy.html'),
    layout({
      title: 'Privacy Policy',
      description: `${APP_NAME} Privacy Policy.`,
      active: 'privacy',
      bodyHtml: privacyBody,
    })
  );
  fs.writeFileSync(
    path.join(outDir, 'terms.html'),
    layout({
      title: 'Terms & Conditions',
      description: `${APP_NAME} Terms and Conditions.`,
      active: 'terms',
      bodyHtml: termsBody,
    })
  );

  fs.writeFileSync(path.join(outDir, '.nojekyll'), '');

  console.log(`Built legal pages → ${path.relative(root, outDir)}/`);
  console.log(`  Privacy: ${legal.LEGAL_PRIVACY_URL}`);
  console.log(`  Terms:   ${legal.LEGAL_TERMS_URL}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
