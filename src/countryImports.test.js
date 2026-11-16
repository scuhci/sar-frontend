const fs = require("fs");
const path = require("path");

// The top-charts branch uses iosCountries in these two files without touching
// the import line, so git merges the files silently. If the import is dropped
// here as "unused", the merged tree fails with "'iosCountries' is not defined".
describe("country list imports", () => {
  test.each(["Dropdown.js", "TopLists.js"])(
    "%s keeps importing both country lists",
    (file) => {
      const source = fs.readFileSync(
        path.join(__dirname, "components", file),
        "utf8"
      );
      expect(source).toContain(
        'import { gplayCountries, iosCountries } from "../constants/countryCodes";'
      );
    }
  );
});
