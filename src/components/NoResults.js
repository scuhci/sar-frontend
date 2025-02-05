import React from 'react'
import { Typography, Box } from "@mui/material";
import '../css/NoResults.css';

const NoResults = ({fixedSearchQuery}) => {
  return (
    <div className='no-results'>
        <Typography variant="h4" align="center">No Results Found</Typography>
        <Typography variant="h5" align="center">
            Looks like we could not find any apps matching your search. Try adjusting your keywords or filters, and let's give it another go!
        </Typography>
        <Box display="flex" justifyContent="center" alignItems="center">
            <img src={'/noresultsfound.png'} className="inline-image-nb" alt="image"/>
        </Box>
    </div>
  )
}

export default NoResults