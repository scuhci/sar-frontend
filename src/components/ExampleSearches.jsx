import { Chip, Box, Typography } from "@mui/material";
import "../css/ExampleSearches.css";

const ExampleSearches = ({ sampleSearch, onExampleSearch }) => {
    return (
        <div className="example-searches-container" style={{ textAlign: "left" }}>
            <Typography variant="h5">Example Searches: </Typography>
            <Box sx={{ mr: 1 }}></Box>
            {sampleSearch.map((term, index) => (
                <Chip
                    key={index}
                    sx={{ mr: 1 }}
                    variant="outlined"
                    label={term}
                    onClick={() => onExampleSearch(term)}
                />
            ))}
        </div>
    );
};

export default ExampleSearches;
