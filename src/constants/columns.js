import React from "react";
import Avatar from "@mui/material/Avatar";
import Button from "@mui/material/Button";
import { Tooltip } from "@mui/material";
import DownloadReviews from "../components/DownloadReviews";

// Map of field names to header names
// Keeps track of fields where the header name is distinct from the field name
// Used to generate renderHeader attribute
const headerNames = {
  title: "App Name",
  reviewsCount: "Total Reviews",
  reviews: "",
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

// Function to render a button to scrape reviews from an app
// only if review count does not exceed 100,000
const renderScrapeReviewButton = (params) => {
  if (params.value[0] < 100000) {
    return DownloadReviews(params.value[1]);
  } else {
    return (
      <div className="Reviews count & button">
        <Tooltip title="Unable to scrape reviews for this app due to review count being greater than max 100000 reviews.">
          <span>
            <Button disabled variant="outlined" size="small">
              <strong>Scrape Reviews</strong>
            </Button>
          </span>
        </Tooltip>
      </div>
    );
  }
};

// Function to render avatar for icon column
const renderIcon = (params) => <Avatar src={params.value} alt="Icon" />;

// Keep track of fields that are boolean values
// so their renderCell attribute is diferent
const booleanFields = ["available", "offersIAP", "adSupported"];

// Helper function for creating renderCell attribute
// For fields "review" and "icon", returns their respective renderCell functions
// For boolean fields, returns the function (params) => params.value.toString()
// For non-boolean fields, returns the function (params) => params.value ?? "-"
const renderCell = (fieldName) => {
  // Case 1: field is "review"
  if (fieldName === "reviews") return renderScrapeReviewButton;
  // Case 2: field is "icon"
  if (fieldName === "icon") return renderIcon;
  // Case 3: field is a boolean field
  if (booleanFields.includes(fieldName))
    return (params) => params.value.toString();
  // Case 4: field is a non-boolean field
  return (params) => params.value ?? "-";
};

// List of fields that need a larger width
// Used to set minWidth to 200
const largeWidthFields = [
  "reviews",
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
// For fields in large_width_fields, return 200
// For fields in extra_width_fields, return 250
// For all other fields, return 100
const minWidth = (fieldName) => {
  // Case 1: field is in large_width_fields
  if (largeWidthFields.includes(fieldName)) return 200;
  // Case 2: field is in extra_width_fields
  if (extraWidthFields.includes(fieldName)) return 250;
  // Case 3: any other field
  return 100;
};

// List of all column field names
// Used to generate final GridColDef array for the DataGrid component
const fieldNames = [
  "title",
  "appId",
  "reviewsCount",
  "reviews",
  "icon",
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
  "version",
  "recentChanges",
];

// Generates DataGridRef array using fieldNames and helper functions
export const columns = fieldNames.map((fieldName) => ({
  field: fieldName,
  renderHeader: renderHeader(fieldName),
  renderCell: renderCell(fieldName),
  minWidth: minWidth(fieldName),
}));
