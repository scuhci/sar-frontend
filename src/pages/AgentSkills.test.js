import fs from "fs";
import path from "path";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import AgentSkills from "./AgentSkills";

const skillsDir = path.join(__dirname, "..", "..", "agent-skills");
const read = (...parts) => fs.readFileSync(path.join(skillsDir, ...parts), "utf8");

// The backend commits the verify kit compares the skills against
const pinnedRef = (script) => read("verify", script).match(/SMAR_REF="\$\{SMAR_REF:-([0-9a-f]{40})\}"/)[1];
const playRef = pinnedRef("verify.sh").slice(0, 8);
const appStoreRef = pinnedRef("verify_appstore.sh").slice(0, 7);

// Whether the App Store skill writes the reviewer profile link into its review files
const skillWritesUserUrl = /REVIEWS_HEADER = \[[^\]]*'userUrl'/.test(
    read("smar-appstore-agent", "scripts", "as_reviews.js")
);

const pageText = () => {
    render(
        <MemoryRouter>
            <AgentSkills />
        </MemoryRouter>
    );
    return document.body.textContent.replace(/\s+/g, " ");
};

test("the page does not promise the skills always match the site's current CSV format", () => {
    const text = pageText();
    expect(text).not.toMatch(/in the same format as this site/);
    expect(text).not.toMatch(/Both produce CSV files in SMAR's format\./);
    expect(screen.queryByText("CSV output in SMAR format")).toBeNull();
});

test("the page names the backend revisions the skills were benchmarked against", () => {
    const text = pageText();
    expect(text).toContain(playRef);
    expect(text).toContain(appStoreRef);
});

test("the page says so when the App Store skill writes reviewer profile links", () => {
    expect(pageText().includes("userUrl")).toBe(skillWritesUserUrl);
});

test("the skills README makes the same qualified claim", () => {
    const readme = read("README.md");
    expect(readme).not.toMatch(/Both write CSVs in SMAR's format\./);
    expect(readme).not.toMatch(/The columns are the same as SMAR's, so files work/);
    expect(readme).toContain(playRef);
    expect(readme).toContain(appStoreRef);
    expect(readme.includes("`userUrl`")).toBe(skillWritesUserUrl);
});
