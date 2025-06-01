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

function Loading({ open, onCancel, searchQuery, time, selectedScraper }) {
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
            ? "Google Play (Google Play returns a max of 30 results)"
            : "the Apple App Store (App Store returns a max of 30 results?)"}
          <br></br>
          {"\t"}2. <strong>Similar app links</strong> - Links (if any) to
          “Similar Apps/Games” shown on the app profile page for each of the
          keyword search results
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
          <u>Busy? Drop an email and we'll ping you when it's done.</u>
          <NotifyMe />
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
