const fs = require("fs");
const path = require("path");

describe("download labels", () => {
    ["SearchBar.js", "TopLists.js"].forEach((fileName) => {
        test(`${fileName} explains what the download contains`, () => {
            const source = fs.readFileSync(path.join(__dirname, fileName), "utf8");

            expect(source).toContain("Reproducibility Log as ZIP, reviews not included)");
            expect(source).toContain("It does not include user reviews.");
        });
    });
});
