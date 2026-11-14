// nginx serves the build with `try_files $uri $uri/ /index.html`. A request whose path is a real
// directory in the build (everything under public/ is copied there) matches `$uri/` and never
// reaches the index.html fallback: it is redirected to the trailing-slash URL and answered with
// 403 because the directory has no index file. So no route may share its first path segment with
// a folder under public/ (or with CRA's own build/static folder).
import fs from "fs";
import path from "path";

const root = path.join(__dirname, "..");
const publicDir = path.join(root, "public");

const routePaths = () => {
    const source = fs.readFileSync(path.join(__dirname, "App.js"), "utf8");
    return [...source.matchAll(/<Route\s+path="([^"]+)"/g)].map((match) => match[1]);
};

// What the server does with a GET for `urlPath`, given the files under public/
const tryFiles = (urlPath) => {
    const target = path.join(publicDir, urlPath);
    if (fs.existsSync(target)) {
        if (fs.statSync(target).isFile()) return "file";
        return fs.existsSync(path.join(target, "index.html")) ? "directory index" : "403";
    }
    return "index.html";
};

test("App.js routes are found", () => {
    expect(routePaths()).toEqual(expect.arrayContaining(["/", "/agent-skills", "/about"]));
});

test("no route is shadowed by a folder under public/", () => {
    const reserved = fs
        .readdirSync(publicDir, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .concat("static");
    const shadowed = routePaths().filter((route) => reserved.includes(route.split("/")[1]));
    expect(shadowed).toEqual([]);
});

test("a direct visit to every route falls through to index.html", () => {
    const routes = routePaths().filter((route) => route !== "/");
    const outcomes = Object.fromEntries(routes.map((route) => [route, tryFiles(route)]));
    expect(outcomes).toEqual(Object.fromEntries(routes.map((route) => [route, "index.html"])));
});

test("every skill download on the Agent Skills page is a file in public/", () => {
    const source = fs.readFileSync(path.join(__dirname, "pages", "AgentSkills.jsx"), "utf8");
    const hrefs = [...source.matchAll(/'(\/[^']+\.skill)'/g)].map((match) => match[1]);
    expect(hrefs).toHaveLength(5);
    hrefs.forEach((href) => {
        expect([href, tryFiles(href)]).toEqual([href, "file"]);
    });
});
