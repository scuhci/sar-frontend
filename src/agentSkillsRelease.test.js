/**
 * @jest-environment node
 */
// The skills' --smar-compat mode reproduces one pinned SAR-backend revision, not the live site. These tests keep
// the schema pages honest about which revision that is, and keep the published .skill archives in step with the
// agent-skills/ folders they are zipped from.
import fs from "fs";
import path from "path";
import JSZip from "jszip";

const root = path.join(__dirname, "..");
const skillsDir = path.join(root, "agent-skills");
const downloadsDir = path.join(root, "public", "downloads", "agent-skills");
const read = (...parts) => fs.readFileSync(path.join(skillsDir, ...parts), "utf8");

const pinnedRef = (script) => read("verify", script).match(/SMAR_REF="\$\{SMAR_REF:-([0-9a-f]{40})\}"/)[1];

const filesUnder = (dir, prefix = "") =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        if (entry.name === ".DS_Store") return [];
        const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
        return entry.isDirectory() ? filesUnder(path.join(dir, entry.name), relative) : [relative];
    });

test("the Play schema page says which backend commit --smar-compat reproduces", () => {
    const schema = read("smar-playstore-agent", "references", "smar_schema.md");
    const policy = schema.split("\n- ").find((item) => item.includes("`--smar-compat`") && item.includes("SMAR's bytes"));
    expect(policy).toContain(pinnedRef("verify.sh").slice(0, 8));
    expect(policy).toMatch(/not necessarily the live site/);
});

test("the App Store schema page says which backend commit --smar-compat reproduces", () => {
    const intro = read("smar-appstore-agent", "references", "smar_appstore_schema.md").split("\n## ")[0];
    expect(intro).toContain(pinnedRef("verify_appstore.sh").slice(0, 7));
    expect(intro).toMatch(/not necessarily the live site/);
});

test("the verify kit README says a clean report is about the pinned commit", () => {
    const readme = read("verify", "README.md");
    expect(readme).toContain(pinnedRef("verify.sh").slice(0, 8));
    expect(readme).toContain(pinnedRef("verify_appstore.sh").slice(0, 7));
    expect(readme).toMatch(/not whatever\s+smar-tool\.org runs today/);
});

const archives = [
    ["smar-playstore-agent.skill", "smar-playstore-agent"],
    ["smar-appstore-agent.skill", "smar-appstore-agent"],
    ["chrome-only/smar-playstore-keyword-search.skill", "chrome-only/smar-playstore-keyword-search"],
    ["chrome-only/smar-playstore-top-charts.skill", "chrome-only/smar-playstore-top-charts"],
    ["chrome-only/smar-playstore-bulk-reviews.skill", "chrome-only/smar-playstore-bulk-reviews"],
];

test.each(archives)("%s holds exactly the files in agent-skills/%s", async (archive, folder) => {
    const zip = await JSZip.loadAsync(fs.readFileSync(path.join(downloadsDir, archive)));
    const name = path.basename(folder);
    const zipped = Object.values(zip.files)
        .filter((entry) => !entry.dir)
        .map((entry) => entry.name)
        .sort();
    const onDisk = filesUnder(path.join(skillsDir, folder))
        .map((file) => `${name}/${file}`)
        .sort();
    expect(zipped).toEqual(onDisk);
    for (const file of zipped) {
        const packed = await zip.file(file).async("nodebuffer");
        const source = fs.readFileSync(path.join(skillsDir, path.dirname(folder), file));
        expect([file, packed.equals(source)]).toEqual([file, true]);
    }
});
