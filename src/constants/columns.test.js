import { render } from "@testing-library/react";
import { appStoreColumns, playStoreColumns } from "./columns";
import appStoreRow from "./__fixtures__/appStoreSearchResult.json";

// SearchBar/TopLists add these two fields to every row before handing it to the DataGrid
const synthesizedFields = ["reviewsCount", "reviews"];

const renderToText = (node) => render(<div>{node}</div>).container.textContent;

const headerText = (column) => renderToText(column.renderHeader());

const cellText = (column, row) =>
  renderToText(column.renderCell({ value: row[column.field], row }));

describe("appStoreColumns", () => {
  const dataColumns = appStoreColumns.filter(
    (column) => !synthesizedFields.includes(column.field)
  );

  test("has no empty slots", () => {
    // Array.from turns holes left by out-of-range index assignment into undefined
    expect(Array.from(appStoreColumns).every((column) => column && column.field)).toBe(true);
  });

  test("every column field exists on an App Store search result", () => {
    const missing = dataColumns
      .map((column) => column.field)
      .filter((field) => !(field in appStoreRow));
    expect(missing).toEqual([]);
  });

  test("renders the result value instead of '-' for every populated column", () => {
    const blank = dataColumns
      .filter((column) => column.field !== "icon")
      .filter((column) => cellText(column, appStoreRow) === "-")
      .map((column) => column.field);
    expect(blank).toEqual([]);
  });

  test("binds App Store headers to the backend's field names", () => {
    const headers = Object.fromEntries(
      appStoreColumns.map((column) => [headerText(column), column.field])
    );
    expect(headers).toMatchObject({
      Description: "description",
      genreIDs: "genreIds",
      "iOS Version": "requiredOsVersion",
      "Current Version Changes": "releaseNotes",
      "Current Version Reviews": "currentVersionReviews",
      "App Size (in Bytes)": "size",
      "App Screenshots": "screenshots",
      "iPad Screenshots": "ipadScreenshots",
      "Apple TV Screenshots": "appletvScreenshots",
      "Date Last Updated": "updated",
      "Supported Languages": "languages",
      "Current Version Average Rating": "currentVersionScore",
      "Developer URL": "developerUrl",
      "Supported Devices": "supportedDevices",
    });
  });

  test("renders list values as comma separated text", () => {
    const genreColumn = appStoreColumns.find((column) => column.field === "genreIds");
    expect(cellText(genreColumn, appStoreRow)).toBe("6008, 6005");
  });

  test("leaves out Play Store only fields", () => {
    const fields = appStoreColumns.map((column) => column.field);
    expect(fields).not.toContain("maxInstalls");
    expect(fields).not.toContain("ratings");
    expect(fields).not.toContain("summary");
  });
});

describe("playStoreColumns", () => {
  test("still uses the Play Store field names", () => {
    const fields = playStoreColumns.map((column) => column.field);
    expect(fields).toEqual(expect.arrayContaining(["summary", "genreId", "maxInstalls", "ratings"]));
  });
});
