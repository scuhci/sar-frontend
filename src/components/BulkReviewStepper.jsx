import * as React from "react";
import Box from "@mui/material/Box";
import Stepper from "@mui/material/Stepper";
import Step from "@mui/material/Step";
import StepLabel from "@mui/material/StepLabel";
// import Button from "@mui/material/Button";
// import Typography from "@mui/material/Typography";

const steps = ["Search for apps", "Review List & Download "];

const BulkReviewStepper = ({ activeStep }) => {
    return (
        <Box sx={{ width: "33%", mx: "auto", mt: 4 }}>
            <Stepper activeStep={activeStep}>
                {steps.map((label, _index) => {
                    const stepProps = {};
                    const labelProps = {};
                    return (
                        <Step key={label} {...stepProps}>
                            <StepLabel {...labelProps}>{label}</StepLabel>
                        </Step>
                    );
                })}
            </Stepper>
        </Box>
    );
};

export default BulkReviewStepper;
