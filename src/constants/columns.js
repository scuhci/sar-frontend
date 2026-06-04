import React from "react";
import Avatar from "@mui/material/Avatar";
import { GRID_CHECKBOX_SELECTION_COL_DEF } from "@mui/x-data-grid";

// Row selection checkboxes are rendered by DataGrid's checkboxSelection prop,
// placed to the left of Icon (the first data column in fieldNames).

// Select-all is scoped to the current page in SearchBar/TopLists; download-all uses no selection.
export const selectionColumnProps = {
  width: 52,
  minWidth: 52,
  maxWidth: 52,
};

export const dataGridSelectionProps = {
  checkboxSelection: true,
  disableRowSelectionOnClick: true,
};

export const withSelectionColumn = (dataColumns) => [
  { ...GRID_CHECKBOX_SELECTION_COL_DEF, ...selectionColumnProps },
  ...dataColumns,
];
// Map of field names to header names
// Keeps track of fields where the header name is distinct from the field name
// Used to generate renderHeader attribute
const headerNames = {
  title: "App Name",
  reviewsCount: "Total Reviews",
  summary: "Description",
  score: "Average Rating",
  source: "Scraped From",
  maxInstalls: "Approximate Installs",
  ratings: "Total Ratings",
  available: "Downloadable",
  url: "URL",
  offersIAP: "In App Purchases",
  IAPRange: "In App Purchases Price Range",
  androidVersion: "Android Minimum Version",
  privacyPolicy: "Privacy Policy URL",
  adSupported: "In App Advertisements",
  released: "Original Release Date",
  version: "Current App Version",
  recentChanges: "Current Version Changes",
};
// Helper function to convert field names to header names
// Splits the field string into multiple readable words
const fieldNameToHeader = (fieldName) => {
  // Step 1: Add spaces before capital letters
  const fieldNameWithSpaces = fieldName
    .split("")
    .map((char, index) =>
      char === char.toUpperCase() && index !== 0 ? " " + char : char
    )
    .join("");

  // Step 2: Capitalize the first character
  return (
    fieldNameWithSpaces.charAt(0).toUpperCase() + fieldNameWithSpaces.slice(1)
  );
};

// Helper function for creating renderHeader attribute for each column
const renderHeader = (fieldName) => {
  // Case 1: fieldName is defined in headerNames map
  if (fieldName in headerNames) {
    return () => <strong>{headerNames[fieldName]}</strong>;
    // Case 2: fieldName can be used to generate header name
  } else {
    return () => <strong>{fieldNameToHeader(fieldName)}</strong>;
  }
};

// Function to render avatar for icon column
const renderIcon = (params) => <Avatar src={params.value} alt="Icon" />;

// Keep track of fields that are boolean values
// so their renderCell attribute is diferent
const booleanFields = ["available", "offersIAP", "adSupported", "downloadable"];

// Helper function for creating renderCell attribute
// For field "icon", returns renderIcon; for boolean fields, returns toString()
// For non-boolean fields, returns the function (params) => params.value ?? "-"
const renderCell = (fieldName) => {
  if (fieldName === "icon") return renderIcon;
  if (booleanFields.includes(fieldName))
    return (params) => params.value.toString();
  return (params) => params.value ?? "-";
};

const narrowWidthFields = ["icon"];

// List of fields that need a larger width
// Used to set minWidth to 200
const largeWidthFields = [
  "developer",
  "summary",
  "url",
  "IAPRange",
  "developerId",
  "developerEmail",
  "developerWebsite",
  "developerAddress",
  "privacyPolicy",
  "genreId",
  "adSupported",
  "released",
  "version",
];
// List of fields that need the largest width
// Used to set minWidth to 250
const extraWidthFields = ["title", "appId", "recentChanges"];

// Helper function to generate minWidth attribute based on field name
// For fields in narrow_width_fields, return 72
// For fields in large_width_fields, return 200
// For fields in extra_width_fields, return 250
// For all other fields, return 150
const minWidth = (fieldName) => {
  // Case 1: field is in narrow_width_fields
  if (narrowWidthFields.includes(fieldName)) return 72;
  // Case 2: field is in large_width_fields
  if (largeWidthFields.includes(fieldName)) return 200;
  // Case 3: field is in extra_width_fields
  if (extraWidthFields.includes(fieldName)) return 250;
  // Case 4: any other field
  return 150;
};

// List of all column field names
// Used to generate final GridColDef array for the DataGrid component
const fieldNames = [
  "icon", // Move Icon column to far left (first column) of results spreadsheet
  "title",
  "appId",
  "reviewsCount",
  "developer",
  "currency",
  "price",
  "summary",
  "url",
  "score",
  "source",
  "maxInstalls",
  "ratings",
  "originalPrice",
  "discountEndDate",
  "available",
  "offersIAP",
  "IAPRange",
  "androidVersion",
  "developerId",
  "developerEmail",
  "developerWebsite",
  "developerAddress",
  "privacyPolicy",
  "genreId",
  "contentRating",
  "adSupported",
  "released",
  "country",
  "version",
  "recentChanges",
];

// Generates DataGridRef array using fieldNames and helper functions
export const columns = fieldNames.map((fieldName) => ({
  field: fieldName,
  renderHeader: renderHeader(fieldName),
  renderCell: renderCell(fieldName),
  minWidth: minWidth(fieldName),
  ...(fieldName === "icon" ? { disableColumnMenu: true } : {}),
}));

// Named columns based on selected scraper being 'Play Store' or 'App Store'
export const playStoreColumns = columns;

// Include new and modified fields for appStoreColumns
// New fields, with associated field names and the index where it should be added
const newFieldNames = {
  currentVersionReviews: { name: "Current Version Reviews", index: 5 },
  appSizeInBytes: { name: "App Size (in Bytes)", index: 6 },
  appScreenshots: { name: "App Screenshots", index: 7 },
  appIpadScreenshots: { name: "iPad Screenshots", index: 8 },
  appletvScreenshots: { name: "Apple TV Screenshots", index: 9 },
  lastUpdated: { name: "Date Last Updated", index: 10 },
  supportedLanguages: { name: "Supported Languages", index: 13 },
  currentVersionAvgRating: {
    name: "Current Version Average Rating",
    index: 18,
  },
  developerAppStorePageURL: { name: "Developer URL", index: 28 },
  supportedDevicesList: { name: "Supported Devices", index: 34 },
};

// Helper function for creating renderHeader attribute for new columns
const renderNewHeader = (fieldName) => {
  return () => <strong>{newFieldNames[fieldName].name}</strong>;
};

// List of fields that are not included in 'App Store' scraper
// Used to filter out fields that are in this list
const removedFieldNames = [
  "approximateInstalls",
  "originalPrice",
  "discountEndDate",
  "downloadable",
  "available",
  "offersIAP",
  "IAPRange",
  "developerEmail",
  "developerAddress",
  "privacyPolicy",
  "adSupported",
];

// List of fields that are renamed in 'App Store' scraper
// Key is the 'Play Store' version, value is the renamed 'App Store' version
const renamedFieldNames = {
  androidVersion: "iOS Version",
  genreId: "genreIDs",
};

// Helper function for creating renderHeader attribute for renamed columns
const renderRenamedHeader = (fieldName) => {
  return () => <strong>{renamedFieldNames[fieldName]}</strong>;
};

const appStoreColumns = playStoreColumns
  .filter((column) => !removedFieldNames.includes(column.field)) // Remove fields in removedFieldNames
  .map((column) => {
    if (column.field in renamedFieldNames) {
      return {
        ...column,
        field: renamedFieldNames[column.field],
        renderHeader: renderRenamedHeader(column.field),
      };
    }
    return column;
  }); // Rename fields in renamedFieldNames

// Add fields in newFieldNames at specified indices
Object.keys(newFieldNames).forEach((field) => {
  const { name, index } = newFieldNames[field];
  const newColumn = {
    field: name,
    renderHeader: renderNewHeader(field),
    renderCell: renderCell(field),
    minWidth: 200, // Set new columns to 200 by default, adjust after testing if this is too much or too little
  };
  // If the index is within the bounds of the existing array, insert it
  if (index < appStoreColumns.length) {
    appStoreColumns.splice(index, 0, newColumn); // Insert at the specified index
  } else {
    appStoreColumns.push(newColumn); // Append when index exceeds current length
  }
});

export { appStoreColumns };
