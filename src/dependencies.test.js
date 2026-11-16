const fs = require('fs');
const path = require('path');

// Packages that only make sense on a Node server. They must not be listed as
// frontend dependencies: nothing in the browser bundle can use them, and
// nodemailer in particular pulls high-severity npm audit advisories into
// every build.
const SERVER_ONLY_PACKAGES = ['nodemailer', 'express-useragent', 'express'];

const root = path.resolve(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

function listSourceFiles(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      listSourceFiles(full, out);
    } else if (/\.(jsx?|tsx?)$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

describe('frontend dependency list', () => {
  test('does not declare server-only packages', () => {
    const declared = Object.keys({
      ...(pkg.dependencies || {}),
      ...(pkg.devDependencies || {}),
    });
    const offenders = declared.filter((name) => SERVER_ONLY_PACKAGES.includes(name));
    expect(offenders).toEqual([]);
  });

  test('nothing in src/ imports a server-only package', () => {
    const importPattern = new RegExp(
      `(?:from\\s+|require\\()\\s*['"](${SERVER_ONLY_PACKAGES.join('|')})(?:/|['"])`
    );
    const offenders = listSourceFiles(path.join(root, 'src'))
      .filter((file) => file !== __filename)
      .filter((file) => importPattern.test(fs.readFileSync(file, 'utf8')))
      .map((file) => path.relative(root, file));
    expect(offenders).toEqual([]);
  });
});
