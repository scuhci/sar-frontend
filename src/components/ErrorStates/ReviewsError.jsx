/****
 * Reviews() is down
 * - Just a banner showing "Review screping is temporarily unavailable, but you can still download app data"
 */

import React from "react";
import "../../css/ReviewsError.css"
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import { Typography, Box } from '@mui/material';

const ReviewsError = () => {
  return(
    <Box className="error-container">
      <WarningAmberIcon sx={{ color:"#ED1010", marginRight: 2 }}/>
      <Typography className="error-text">Review scraping is temporarily unavailable, but you can still download app data.</Typography>
    </Box>
  )
}

export default ReviewsError