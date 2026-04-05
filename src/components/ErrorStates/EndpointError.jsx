import React from "react";
import "../../css/EndpointError.css";
import { Typography, Box, Button } from "@mui/material";
import "../../res/SMAR_Service_Error.png";

const EndpointError = (endpointType, selectedScraper) => {
  return (
    <Box className="error-container">
      {endpointType === "GooglePlay" && (
        <Box>
          <Typography>Unable to reach Google Play Store</Typography>
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
        </Box>
      )}
      {endpointType === "AppStore" && (
        <Box>
          <Typography>Unable to reach App Store</Typography>
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
        </Box>
      )}
      {endpointType === "TopCharts" && (
        <Box>
          <Typography>Unable to reach Top Charts</Typography>
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
        </Box>
      )}
      {endpointType === "BulkReviews" && (
        <Box>
          <Typography>Unable to reach Top Charts</Typography>
        </Box>
      )}
    </Box>
  );
};

export default EndpointError;
