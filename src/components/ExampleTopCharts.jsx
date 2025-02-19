import React from "react";
import { Button, Typography, Box } from "@mui/material";
import "../css/ExampleSearches.css";
import { StyledEngineProvider } from "@mui/material";
import { useNavigate } from "react-router-dom";

const ExampleTopCharts = ({ selectedScraper }) => {
    const gplayTopCharts = [
        {code: "TOP_FREE", name: "Top Free"},
        {code: "TOP_PAID", name: "Top Paid"},
        {code: "GROSSING", name: "Top Grossing"},
    ];
    const iosTopCharts = [
        {code: "topfreemacapps", name: "Top Free"},
        {code: "toppaidmacapps", name: "Top Paid"},
        {code: "topgrossingmacapps", name: "Top Grossing"},
    ];

    const navigate = useNavigate();

    const handleButtonClick = (dropdownValue) => {
        navigate("/toplists", { state: { collectionState: dropdownValue, selectedScraper: selectedScraper } });
    };
    return (
        <StyledEngineProvider injectFirst>
            <div
                className="example-searches-container"
                style={{ textAlign: "left" }}
            >
                <Box display="flex" alignItems="center" gap={1}>
                    <Typography variant="h5">Fetch Top Charts:</Typography>
                     {(selectedScraper === "Play Store" ? gplayTopCharts : iosTopCharts).map(({code, name}, index) => (
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
        </StyledEngineProvider>
    );
};

export default ExampleTopCharts;
