import React from 'react';
import { Dialog, DialogContent, DialogContentText, LinearProgress, Button, DialogActions} from '@mui/material';
import "../css/Loading.css"
import { OpenInNew } from '@mui/icons-material';

function Loading({ open, onCancel, searchQuery }) {

    return (
        <Dialog open={open} onClose={onCancel} aria-labelledby="loading-dialog-title" PaperProps={{
            style: {
              backgroundColor: 'white',
              position: 'relative'
            },
          }}>
            <div className="loading-backdrop" open={open}></div>
            <DialogContent>
                <DialogContentText id="loading-dialog-title" className="loading-dialog-content">
                    <strong>Searching{searchQuery ? ` for "${searchQuery}"`: ''}...</strong>
                </DialogContentText>
                <DialogContentText className="loading-dialog-subtext">
                    On average, searches take 1-5 minutes. <br></br>
                    <br></br>
                    Returns results from two sources: <br></br>
                    {'\t'}1. up to 30 primary search results for this keyword in Google Play.  <br></br>
                    {'\t'}2. similar app results for apps in primary search results. <br></br>
                    For more info, see the <a href="https://smar-team.s3.us-west-1.amazonaws.com/user-guide/SMAR+User+Guide.pdf" target="_blank" rel="noopener noreferrer"> user guide<OpenInNew fontSize='inherit' /></a>. 
                </DialogContentText>
                <LinearProgress className="loading-progress-bar"/>
            </DialogContent>
            <DialogActions>
                <Button onClick={onCancel} color="primary" className="loading-dialog-actions">Cancel</Button>
            </DialogActions>
        </Dialog>
    );
}

export default Loading;