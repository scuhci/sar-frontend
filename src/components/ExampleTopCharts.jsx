import React from 'react';
import { Button, Typography, Chip, Box } from '@mui/material';
import "../css/ExampleSearches.css";
import { useNavigate } from "react-router-dom";

const ExampleTopCharts = ({sampleTopChart}) => {
  const navigate = useNavigate();

  const handleButtonClick = (dropdownValue) => {
    navigate('/toplists', { state: { collectionState: dropdownValue } });
  };
  return (
    <div className="example-searches-container" style={{ textAlign: 'left' }}>
      <Box display="flex" alignItems="center" gap={1}>
        <Typography variant="h5" className='fetch-top-list'>
              Fetch Top Charts:
        </Typography>
        {sampleTopChart.map(({code, name}, index) => (
          <Button 
            variant='outlined'
            key={index}
            className="example-top-list-button" 
            onClick={() => handleButtonClick(code)}>
            {name}
          </Button>
        ))}
      </Box>
    </div>
  );
}

export default ExampleTopCharts;
