import React from "react";
import "../../css/EndpointError.css";
import { Typography, Box, Button } from "@mui/material";
import ServiceError from "../../res/SMAR_Service_Error.png";
import ReloadButton from "./ReloadButton";

const EndpointError = ({ endpointType, selectedScraper }) => {
  return (
    <Box className="endpoint-error-container">
      <img src={ServiceError} alt="Service Error" />
      {endpointType === "GooglePlay" && (
        <Box>
          <Typography sx={{ fontSize: 40 }}>Unable to reach Google Play Store</Typography>
          <Typography sx={{ fontSize: 14, marginTop: 3, marginBottom: 3}}>
            We are unable to connect to the Google Play Store to fetch app data.<br/>
            Please try your scrape again later.
          </Typography>

          <Box sx={{ display: "flex", flexDirection: "row" }}>
            <Button
              className="search-button"
              // onClick={}
              variant="contained"
              color="primary"
            >
              {selectedScraper !== "Play Store"
                ? "Scrape Play Store"
                : "Scrape App Store"}
            </Button>
            <ReloadButton />
          </Box>
        </Box>
      )}
      {endpointType === "AppStore" && (
        <Box>
          <Typography sx={{ fontSize: 40 }}>Unable to reach App Store</Typography>
          <Typography sx={{ fontSize: 14, marginTop: 3, marginBottom: 3}}>
            We are unable to connect to the App Store to fetch app data. <br/>
            Please try your scrape again later.
          </Typography>

          <Box sx={{ display: "flex", flexDirection: "row" }}>
            <Button
              className="search-button"
              // onClick={}
              variant="contained"
              color="primary"
            >
              {selectedScraper !== "Play Store"
                ? "Scrape Play Store"
                : "Scrape App Store"}
            </Button>
            <ReloadButton />
          </Box>
        </Box>
      )}
      {endpointType === "TopCharts" && (
        <Box>
          <Typography sx={{ fontSize: 40 }}>Unable to reach Top Charts</Typography>
          <Typography sx={{ fontSize: 14, marginTop: 3, marginBottom: 3}}>
            We are unable to connect to the {selectedScraper} to fetch app data. <br/>
            Please try your scrape again later.
          </Typography>
          <ReloadButton/>
        </Box>
      )}
      {endpointType === "BulkReviews" && (
        <Box>
          <Typography sx={{ fontSize: 40 }}>Unable to reach Bulk Review Scraper</Typography>
          <Typography sx={{ fontSize: 14, marginTop: 3, marginBottom: 3}}>
            We are unable to connect to the {selectedScraper} to fetch app data. <br/>
            Please try your scrape again later.
          </Typography>
          <ReloadButton/>
        </Box>
      )}
    </Box>
  );
};

export default EndpointError;
