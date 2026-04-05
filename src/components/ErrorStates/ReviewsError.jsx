/****
 * Reviews() is down
 * - Just a banner showing "Review screping is temporarily unavailable, but you can still download app data"
 */

import React from "react";
import "../../css/ReviewsError.css"
import { Typography, Box } from '@mui/material';

const ReviewsError = () => {
  return(
    <Box>
      <Typography>Review scraping is temporarily unavailable, but you can still download app data.</Typography>
    </Box>
  )
}