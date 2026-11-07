import React, { useEffect, useState } from "react";
import { Button, Container, Stack, Typography } from "@mui/material";
import Footer from "../components/Footer";
import "../css/About.css";
import {
  CONSENT_DENIED,
  CONSENT_GRANTED,
  getAnalyticsConsent,
  onAnalyticsConsentChange,
  setAnalyticsConsent,
} from "../analytics";

// Wording is kept in one place so the team can edit it without touching the
// layout. Only describe what the site actually does.
const SECTIONS = [
  {
    title: "Searches and downloads",
    body:
      "SMAR has no user accounts. When you run a search, fetch a top chart or " +
      "download reviews, the keywords, app IDs, country and other options you " +
      "choose are sent to the lab's servers, which collect the matching public " +
      "data from Google Play or the Apple App Store and send the results back " +
      "to you. The servers may keep these requests and results for a while, " +
      "for example so the CSV can be downloaded again.",
  },
  {
    title: "Notify Me",
    body:
      "Entering your email address in Notify Me is optional. If you do, the " +
      "address is sent to the lab's server with your search and is used to " +
      "email you the results of that search.",
  },
  {
    title: "Analytics",
    body:
      "If you allow it, the site loads Google Analytics, which records the " +
      "pages you visit and general information about your browser, device and " +
      "approximate location, and sets Google Analytics cookies. If you decline " +
      "or have not chosen yet, Google Analytics is not loaded. Your choice is " +
      "saved in this browser and you can change it here at any time.",
  },
];

const CONSENT_LABELS = {
  [CONSENT_GRANTED]: "Analytics is currently allowed.",
  [CONSENT_DENIED]: "Analytics is currently declined.",
};

const Privacy = () => {
  const [consent, setConsent] = useState(getAnalyticsConsent);

  useEffect(() => onAnalyticsConsentChange(setConsent), []);

  return (
    <Container sx={{ marginTop: 7 }}>
      <div className="app-container">
        <div className="content">
          <Typography variant="h3" className="about-header">
            Privacy notice
          </Typography>
          <Typography variant="body1" fontSize="18px" className="about-text">
            SMAR is a research tool run by the Human Computer Interaction Lab at
            Santa Clara University. This page describes what the site does with
            information when you use it.
          </Typography>

          {SECTIONS.map(({ title, body }) => (
            <React.Fragment key={title}>
              <Typography variant="h5" className="about-header">
                {title}
              </Typography>
              <Typography variant="body1" fontSize="18px" className="about-text">
                {body}
              </Typography>
            </React.Fragment>
          ))}

          <Typography variant="body1" fontSize="18px" className="about-text">
            {CONSENT_LABELS[consent] || "You have not chosen yet, so analytics is off."}
          </Typography>
          <Stack direction="row" spacing={1} sx={{ marginBottom: 3 }}>
            <Button
              variant="contained"
              disabled={consent === CONSENT_GRANTED}
              onClick={() => setAnalyticsConsent(CONSENT_GRANTED)}
            >
              Allow analytics
            </Button>
            <Button
              variant="outlined"
              disabled={consent === CONSENT_DENIED}
              onClick={() => setAnalyticsConsent(CONSENT_DENIED)}
            >
              Decline analytics
            </Button>
          </Stack>

          <Typography variant="h5" className="about-header">
            Questions
          </Typography>
          <Typography variant="body1" fontSize="18px" className="about-text">
            Questions about this notice can be sent to the HCI Lab through{" "}
            <a href="http://scuhci.com" target="_blank" rel="noopener noreferrer">
              scuhci.com
            </a>
            .
          </Typography>
        </div>
        <Footer />
      </div>
      <br />
    </Container>
  );
};

export default Privacy;
