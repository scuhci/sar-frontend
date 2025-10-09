import React, { useState } from "react";
import Button from "@mui/material/Button";
import { Tooltip } from "@mui/material";
import ReviewsLoading from "./ReviewsLoading";
import axios from "axios";
import { useScraper } from "../components/SelectedScraperProvider";

let JSZip = require("jszip");

const DownloadReviews = (appId, countryCode) => {
  const { selectedScraper } = useScraper();
  const [isLoading, setIsLoading] = useState(false);
  const [abortController, setAbortController] = useState(null);

  const handleCancel = () => {
    abortController.abort();
    setIsLoading(false);
  };

  const downloadAllReviews = async (appId) => {
    try {
      if (abortController) {
        abortController.abort();
      }
      const newAbortController = new AbortController();
      setAbortController(newAbortController);
      console.log("Country Code is %s\n", countryCode);
      setIsLoading(true);
      const response = await axios.get(
        selectedScraper === "Play Store"
          ? `/reviews?appId=${appId}&countryCode=${countryCode}`
          : `/ios/reviews?appId=${appId}&countryCode=${countryCode}`,
        {
          signal: newAbortController.signal,
          responseType: "blob", //handling the binary data
          headers: {
            // Include authorization tokens
          },
        }
      );

      const relog_response = await axios.get(
        selectedScraper === "Play Store"
          ? `/download-reviews-relog?appId=${appId}&countryCode=${countryCode}&store=${"Google Play Store"}&sorting=${"RECENT"}`
          : `/ios/download-reviews-relog?appId=${appId}&countryCode=${countryCode}&store=${"iOS App Store"}&sorting=${"RECENT"}`,
        {
          signal: newAbortController.signal,
          responseType: "blob", //handling the binary data
          headers: {
            // Include authorization tokens
          },
        }
      );

      // Extract the filename from the Content-Disposition header
      // const disposition = response.headers['content-disposition'];
      const filename = `${appId}_reviews.csv`;
      console.log(`Filename from header: ${filename}`);
      const filename_relog = filename.slice(0, -4) + "_reproducibility_log.txt";
      const filename_zip = filename.slice(0, -4) + ".zip";
      console.log(`Relog filename from header: ${filename_relog}`);
      // Create a URL from the blob
      const csv_file = new Blob(["\ufeff", response.data], {
        type: "text/csv;charset=utf-8",
      });
      const relog_file = new Blob(["\ufeff", relog_response.data], {
        type: "text/plain;charset=utf-8",
      });
      const zip = new JSZip();
      zip.file(filename, csv_file);
      zip.file(filename_relog, relog_file);
      zip.generateAsync({ type: "blob" }).then(function (zipFile) {
        // Create a link element, set the href to the blob URL, and trigger a download
        const url = window.URL.createObjectURL(zipFile);
        const link = document.createElement("a");
        link.href = url;
        link.setAttribute("download", filename_zip);
        document.body.appendChild(link);
        link.click();
        // Clean up and revoke the URL
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
      });
    } catch (error) {
      console.error("Error fetching or downloading the reviews file:", error);
      setIsLoading(false);
    }
    setIsLoading(false);
  };

  return (
    <div className="Reviews count & button">
      <Tooltip title="Scraping reviews for an app may take 1-5 minutes.">
        <Button
          variant="outlined"
          size="small"
          onClick={() => downloadAllReviews(appId)}
        >
          <strong>Scrape Reviews</strong>
        </Button>
      </Tooltip>
      <ReviewsLoading open={isLoading} onCancel={handleCancel} appId={appId} />
    </div>
  );
};

export default DownloadReviews;
