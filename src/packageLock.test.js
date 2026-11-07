// Guards the reproducible install: package-lock.json must be committed and
// must describe the dependencies declared in package.json, otherwise `npm ci`
// (what the deploy runs) fails or installs a different tree than the one that
// was tested.
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');

describe('package-lock.json', () => {
  const lockPath = path.join(root, 'package-lock.json');

  test('exists next to package.json', () => {
    expect(fs.existsSync(lockPath)).toBe(true);
  });

  test('is not gitignored', () => {
    const gitignore = fs.readFileSync(path.join(root, '.gitignore'), 'utf8');
    const ignored = gitignore
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'));
    expect(ignored).not.toContain('package-lock.json');
  });

  test('matches the dependencies in package.json', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
    const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));

    expect(lock.lockfileVersion).toBeGreaterThanOrEqual(2);
    expect(lock.name).toBe(pkg.name);
    expect(lock.packages['']).toBeDefined();
    expect(lock.packages[''].dependencies).toEqual(pkg.dependencies);
    expect(lock.packages[''].devDependencies).toEqual(pkg.devDependencies);
  });
});
