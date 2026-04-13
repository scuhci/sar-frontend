import React from "react";
import "../../css/EndpointError.css";
import { Typography, Box, Button } from "@mui/material";
import ServiceError from "../../res/SMAR_Service_Error.png";
import ReloadButton from "./ReloadButton";

const EndpointError = ({ endpointType, selectedScraper }) => {
  return (
    <Box className="endpoint-error-container">
      <img src={ServiceError} alt="Service Error" />
      {endpointType === "Scrape" && (
        <Box>
          <Typography sx={{ fontSize: 40 }}>
            Unable to reach {selectedScraper}
          </Typography>
          <Typography sx={{ fontSize: 14, marginTop: 3, marginBottom: 3 }}>
            We are unable to connect to the {selectedScraper} to fetch app data.
            <br />
            Please try your scrape again later.
          </Typography>

          <Box sx={{ display: "flex", flexDirection: "row", justifyContent: 'center'}}>
            <Button
              sx={{
                backgroundColor: "#FFFFFF",
                fontSize: "16px",
                border: "#BDBDBD solid 1px",
                width: "226px",
                height: "49px",
                textAlign: "center",
                textTransform: "none",
                "&:hover": {
                  backgroundColor: "#fdfdfd",
                },
                marginBottom: "10px",
                marginRight: "16px"
              }}
              variant="contained"
              color="primary"
            >
              <Typography sx={{ fontSize: 16, color:'#000000', fontWeight: 500}}>
                {selectedScraper !== "Play Store"
                  ? "SCRAPE PLAY STORE"
                  : "SCRAPE APP STORE"}
              </Typography>
            </Button>

            <ReloadButton />
          </Box>
        </Box>
      )}
      {endpointType === "TopCharts" && (
        <Box>
          <Typography sx={{ fontSize: 40 }}>
            Unable to reach Top Charts
          </Typography>
          <Typography sx={{ fontSize: 14, marginTop: 3, marginBottom: 3 }}>
            We are unable to connect to the {selectedScraper} to fetch app data.{" "}
            <br />
            Please try your scrape again later.
          </Typography>
          <ReloadButton />
        </Box>
      )}
      {endpointType === "BulkReviews" && (
        <Box>
          <Typography sx={{ fontSize: 40 }}>
            Unable to reach Bulk Review Scraper
          </Typography>
          <Typography sx={{ fontSize: 14, marginTop: 3, marginBottom: 3 }}>
            We are unable to connect to the {selectedScraper} to fetch app data.{" "}
            <br />
            Please try your scrape again later.
          </Typography>
          <ReloadButton />
        </Box>
      )}
    </Box>
  );
};

export default EndpointError;
