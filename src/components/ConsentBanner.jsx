import React, { useEffect, useState } from "react";
import { Box, Button, Paper, Typography } from "@mui/material";
import Link from "@mui/material/Link";
import { Link as RouterLink } from "react-router-dom";
import {
  CONSENT_DENIED,
  CONSENT_GRANTED,
  getAnalyticsConsent,
  onAnalyticsConsentChange,
  setAnalyticsConsent,
} from "../analytics";

/**
 * Shown until the visitor accepts or declines Google Analytics. Nothing is
 * sent to Google before they accept.
 */
const ConsentBanner = () => {
  const [consent, setConsent] = useState(getAnalyticsConsent);

  useEffect(() => onAnalyticsConsentChange(setConsent), []);

  if (consent !== null) return null;

  return (
    <Paper
      elevation={6}
      role="dialog"
      aria-label="Analytics consent"
      sx={{
        position: "fixed",
        bottom: 16,
        left: 16,
        right: 16,
        maxWidth: 720,
        margin: "0 auto",
        padding: 2,
        zIndex: (theme) => theme.zIndex.snackbar,
      }}
    >
      <Typography variant="body2" sx={{ marginBottom: 1.5 }}>
        SMAR uses Google Analytics to understand how the tool is used. Analytics
        only runs if you allow it. See our{" "}
        <Link component={RouterLink} to="/privacy">
          privacy notice
        </Link>{" "}
        for what we collect.
      </Typography>
      <Box sx={{ display: "flex", gap: 1, justifyContent: "flex-end" }}>
        <Button
          variant="outlined"
          size="small"
          onClick={() => setAnalyticsConsent(CONSENT_DENIED)}
        >
          Decline
        </Button>
        <Button
          variant="contained"
          size="small"
          onClick={() => setAnalyticsConsent(CONSENT_GRANTED)}
        >
          Allow analytics
        </Button>
      </Box>
    </Paper>
  );
};

export default ConsentBanner;
