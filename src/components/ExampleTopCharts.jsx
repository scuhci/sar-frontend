import React from 'react';
import { Button, Typography, Chip } from '@mui/material';
import "../css/ExampleSearches.css";
import { useNavigate } from "react-router-dom";

const ExampleTopCharts = () => {
  const navigate = useNavigate();

  const handleButtonClick = (dropdownValue) => {
    navigate(`/toplists?dropdownValue=${dropdownValue}`);
  };
  return (
    <div className="example-searches-container" style={{ textAlign: 'left' }}>
      <Typography variant="h5">
            Fetch Top Charts:
        </Typography>
      <Chip 
        label="Top Free"
        onClick={handleButtonClick("Top Free")}
      />
      <Chip 
        label="Top Paid"
        onClick={handleButtonClick("Top Paid")}
      />
      <Chip 
        label="Top Grossing"
        onClick={handleButtonClick("Top Grossing")}
      />
    </div>
  );
}

export default ExampleTopCharts;
