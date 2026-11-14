import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogContentText,
  LinearProgress,
  Button,
  DialogActions,
} from "@mui/material";
import NotifyMe from "./NotifyMe";
import "../css/Loading.css";
import { OpenInNew } from "@mui/icons-material";

function Loading({
  open,
  onCancel,
  country,
  permissions,
  searchQuery,
  time,
  selectedScraper,
}) {
  return (
    <Dialog
      open={open}
      onClose={onCancel}
      aria-labelledby="loading-dialog-title"
      PaperProps={{
        style: {
          backgroundColor: "white",
          position: "relative",
        },
      }}
    >
      <div className="loading-backdrop" open={open}></div>
      <DialogContent>
        <DialogContentText
          id="loading-dialog-title"
          className="loading-dialog-content"
        >
          <strong>
            Scraping data {searchQuery ? ` for "${searchQuery}"` : ""}...
          </strong>
        </DialogContentText>
        <DialogContentText className="loading-dialog-subtext">
          Scrapes data from two sources: <br></br>
          <br></br>
          {"\t"}1. <strong>Keyword search results</strong> - Results from
          searching for this keyword in{" "}
          {selectedScraper === "Play Store"
            ? "Google Play (SMAR requests up to 20 results)"
            : "the Apple App Store (SMAR requests up to 50 results)"}
          <br></br>
          {"\t"}2. <strong>Similar app links</strong> -{" "}
          {selectedScraper === "Play Store"
            ? <>Results of a second Google Play search for {"“related to <app title>”"} for each of the keyword search results</>
            : "Apps that the App Store lists as similar to each of the keyword search results"}
          <br></br>
          <br></br>
          For more info, see the{" "}
          <a href="/userguide" target="_blank" rel="noopener noreferrer">
            {" "}
            user guide
            <OpenInNew fontSize="inherit" />
          </a>
          .<br></br>
          <br></br>
          {/* Only the Play backend can send the notification email. */}
          {selectedScraper === "Play Store" && (
            <>
              <u>Busy? Drop an email and we'll ping you when it's done.</u>
              <NotifyMe
                country={country}
                query={searchQuery}
                permissions={permissions}
                queryTime={time}
              />
            </>
          )}
        </DialogContentText>
        <LinearProgress className="loading-progress-bar" />
      </DialogContent>
      <DialogActions>
        <Button
          onClick={onCancel}
          color="primary"
          className="loading-dialog-actions"
        >
          Cancel
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export default Loading;
