import React from 'react';
import { Button, Typography } from '@mui/material';
import "../css/ExampleSearches.css";

const ExampleSearches = ({ sampleSearch, onExampleSearch }) => {
  return (
    <div className="example-searches-container" style={{ textAlign: 'left' }}>
        <Typography variant="h5">
            Example Searches:
        </Typography>
        {sampleSearch.map((term, index) => (
        <Button 
            key={index} 
            className="example-search-button" 
            onClick={() => onExampleSearch(term)}>
            {term}
        </Button>
      ))}
    </div>
  );
};

export default ExampleSearches;
