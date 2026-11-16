import React, { useEffect, useState } from "react";
import { Button, Container, Divider, IconButton, Link, Stack, Typography } from "@mui/material";
import { ChevronLeft, ChevronRight } from "@mui/icons-material";
import Footer from "../components/Footer";
import "../css/About.css";
import "../css/UserGuide.css";
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
    id: "Searches_Downloads",
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
    id: "Notify_Me",
    title: "Notify Me",
    body:
      "Entering your email address in Notify Me is optional. If you do, the " +
      "address is sent to the lab's server with your search and is used to " +
      "email you the results of that search.",
  },
  {
    id: "Analytics",
    title: "Analytics",
    body:
      "If you allow it, the site loads Google Analytics, which records the " +
      "pages you visit and general information about your browser, device and " +
      "approximate location, and sets Google Analytics cookies. If you decline " +
      "or have not chosen yet, Google Analytics is not loaded. Your choice is " +
      "saved in this browser and you can change it here at any time. If you " +
      "decline after having allowed it, the Google Analytics cookies are " +
      "deleted and the page reloads without Google Analytics.",
  },
  {
    id: "Other_Servers",
    title: "Images from other servers",
    body:
      "App icons in result tables are loaded directly from Google and Apple " +
      "servers, and the team photos and user guide from the lab's Amazon S3 " +
      "storage. Those servers see your IP address when your browser fetches " +
      "them, whether or not you allow analytics.",
  },
];

const CONSENT_LABELS = {
  [CONSENT_GRANTED]: "Analytics is currently allowed.",
  [CONSENT_DENIED]: "Analytics is currently declined.",
};

const tocLinkSx = {
  color: "inherit",
  textDecoration: "none",
  display: "block",
  "&:hover": { textDecoration: "underline" },
};

const Privacy = () => {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [consent, setConsent] = useState(getAnalyticsConsent);

  useEffect(() => onAnalyticsConsentChange(setConsent), []);

  return (
    <Container sx={{ marginTop: 7 }} maxWidth="lg">
      <div className="app-container">
        <div className="content">
          <Typography variant="h4" className="main-header">
            Privacy Notice
          </Typography>

          <div className="user-guide-layout">
            <div className="user-guide-toc-cluster">
              <div className="user-guide-sidebar-rail">
                <IconButton
                  size="small"
                  onClick={() => setSidebarOpen((o) => !o)}
                  aria-expanded={sidebarOpen}
                  aria-controls={sidebarOpen ? "privacy-toc-list" : undefined}
                  aria-label={sidebarOpen ? "Hide table of contents" : "Show table of contents"}
                  className="user-guide-sidebar-toggle"
                >
                  {sidebarOpen ? <ChevronLeft fontSize="small" /> : <ChevronRight fontSize="small" />}
                </IconButton>
              </div>
              <nav
                className={`user-guide-sidebar${sidebarOpen ? "" : " user-guide-sidebar--collapsed"}`}
                aria-label="Table of contents"
              >
                <Typography variant="h5" component="h2" className="toc-sidebar-title">
                  Contents
                </Typography>
                {sidebarOpen && (
                  <ul id="privacy-toc-list" className="toc-tree">
                    <li className="toc-section toc-section--leaf">
                      <Link href="#Overview" sx={tocLinkSx} variant="subtitle1" className="toc-section-link" fontWeight={600}>
                        Overview
                      </Link>
                    </li>
                    <li className="toc-section">
                      <Link href="#Data_Handling" sx={tocLinkSx} variant="subtitle1" className="toc-section-link" fontWeight={600}>
                        How your data is handled
                      </Link>
                      <ul className="toc-sublist">
                        {SECTIONS.map(({ id, title }) => (
                          <li key={id}>
                            <Link href={`#${id}`} sx={tocLinkSx} variant="body2">{title}</Link>
                          </li>
                        ))}
                      </ul>
                    </li>
                    <li className="toc-section">
                      <Link href="#Analytics_Choice" sx={tocLinkSx} variant="subtitle1" className="toc-section-link" fontWeight={600}>
                        Your analytics choice
                      </Link>
                    </li>
                    <li className="toc-section toc-section--leaf">
                      <Link href="#Questions" sx={tocLinkSx} variant="subtitle1" className="toc-section-link" fontWeight={600}>
                        Questions
                      </Link>
                    </li>
                  </ul>
                )}
              </nav>
            </div>

            <div className="user-guide-main">
              <br />
              <Divider variant="li" />
              <br />

              <Typography variant="h4" className="section-header" id="Overview">
                Overview
              </Typography>
              <Typography variant="body1" className="main-text">
                SMAR is a research tool run by the Human Computer Interaction Lab at
                Santa Clara University. This page describes what the site does with
                information when you use it.
              </Typography>

              <br /><br />
              <Divider variant="li" />
              <br /><br />

              <Typography variant="h4" className="section-header" id="Data_Handling">
                How your data is handled
              </Typography>
              {SECTIONS.map(({ id, title, body }) => (
                <React.Fragment key={id}>
                  <Typography variant="h5" className="section-sub-header" id={id}>
                    {title}
                  </Typography>
                  <Typography variant="body1" className="main-text">
                    {body}
                  </Typography>
                </React.Fragment>
              ))}

              <br /><br />
              <Divider variant="li" />
              <br /><br />

              <Typography variant="h4" className="section-header" id="Analytics_Choice">
                Your analytics choice
              </Typography>
              <Typography variant="body1" className="main-text">
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

              <br /><br />
              <Divider variant="li" />
              <br /><br />

              <Typography variant="h4" className="section-header" id="Questions">
                Questions
              </Typography>
              <Typography variant="body1" className="main-text">
                Questions about this notice can be sent to the HCI Lab through{" "}
                <a href="http://scuhci.com" target="_blank" rel="noopener noreferrer">
                  scuhci.com
                </a>
                .
              </Typography>
            </div>
          </div>
        </div>
        <Footer />
      </div>
      <br />
    </Container>
  );
};

export default Privacy;
