import React from 'react';
import { Typography, Container} from '@mui/material';
import "../css/About.css";
import Card from '@mui/material/Card';
import CardContent from "@mui/material/CardContent";
import Stack from '@mui/material/Stack';
import InfoIcon from '@mui/icons-material/Info';


const Citation = () => {
    return (
        <Container>
            <Card elevation={3} style={{backgroundColor: "#e3f2fd"}}>
            <CardContent>
                <Stack direction="row" gap={0.7}>
                    <InfoIcon fontSize='small'/>
                    <Typography variant="body1">
                        If you are publishing research conducted using the SMAR Tool, <strong>please cite our tool as follows</strong>:<br /><br />
                    </Typography>
                </Stack>
                <Typography variant="body1">
                Kai Lukoff, Akaash Trivedi, Ilona van der Linden, Vaishnavi Upadhye, Gaurav Punjabi, Varun Mangla, Chen Crystal Ying Katrina, Maggie Lau, Rani Rajurkar, Juilee Katpatal, Soham Phadke, and Soumya Mohan. 2024. SMAR: A Tool for Systematic Mobile App Reviews to Research the Mobile App Ecosystem. Retrieved from www.tinyurl.com/smar-tool
                </Typography>
            </CardContent>
            </Card>
        </Container>
      );
    }
export default Citation;