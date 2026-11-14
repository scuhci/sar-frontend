import React from 'react';
import { Typography, Container, Stack, Button} from '@mui/material';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import "../css/About.css";
import Card from '@mui/material/Card';
import CardContent from "@mui/material/CardContent";
import Divider from '@mui/material/Divider';


const text = "Kai Lukoff, Ilona van der Linden, Akaash Trivedi, Vaishnavi Upadhye, Gaurav Punjabi, Varun Mangla, Jeshwin Prince, Katrina Ying, Crystal Chen, Maggie Lau, Rani Rajurkar, Juilee Katpatal, Soham Phadke, Kyle Zhang, and Soumya Mohan. 2025. SMAR: A Tool for Systematic Mobile App Reviews to Research the Mobile App Ecosystem. Retrieved from https://smar-tool.org/"
const Citation = () => {
    const [copied, setCopied] = React.useState(false);
    // Only say "copied" once the browser has accepted the text (the clipboard API is missing on plain http)
    const copyCitation = async () => {
        try {
            await navigator.clipboard.writeText(text);
            setCopied(true);
        } catch (error) {
            setCopied(false);
        }
    };
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
                <Button aria-label="Copy citation" style={{height:30, width:5}} onClick={copyCitation}>
                    <ContentCopyIcon fontSize="small"/>
                </Button>
                </Stack>
                <Typography variant="body2" role="status" align="right">{copied ? "Citation copied" : ""}</Typography>
            </CardContent>
            </Card>
        </Container>
      );
    }
export default Citation;
