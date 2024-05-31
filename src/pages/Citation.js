import React from 'react';
import { Typography, Container, Stack, Button} from '@mui/material';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import "../css/About.css";
import Card from '@mui/material/Card';
import CardContent from "@mui/material/CardContent";
import Divider from '@mui/material/Divider';


const text = "Kai Lukoff, Akaash Trivedi, Ilona van der Linden, Vaishnavi Upadhye, Gaurav Punjabi, Varun Mangla, Katrina Ying, Crystal Chen, Maggie Lau, Rani Rajurkar, Juilee Katpatal, Soham Phadke, and Soumya Mohan. 2024. SMAR: A Tool for Systematic Mobile App Reviews to Research the Mobile App Ecosystem. Retrieved from www.tinyurl.com/smar-tool"
const Citation = () => {
    return (
        <Container>
            <Card m={3} elevation={4} style={{backgroundColor: "#e3f2fd"}}>
            <CardContent>
                <Typography variant="body1">
                    If you are publishing research conducted using the SMAR Tool, <strong>please cite our tool as follows</strong>:<br /><br />
                </Typography>
                <Divider variant="fullWidth"/>
                <br />
                <Stack alignItems="right" direction="row" justifyContent={'space-between'} >
                <Typography variant="body1">
                    {text}
                </Typography>
                <Button style={{height:30, width:5}} onClick={() => {navigator.clipboard.writeText(text)}}>
                    <ContentCopyIcon fontSize="small"/>
                </Button>
                </Stack>
            </CardContent>
            </Card>
        </Container>
      );
    }
export default Citation;