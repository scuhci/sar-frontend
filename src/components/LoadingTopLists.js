import React from 'react';
import { Dialog, DialogContent, DialogContentText, LinearProgress, Button, DialogActions} from '@mui/material';
import "../css/Loading.css"

function LoadingTopLists({ open, onCancel, country, collection, category }) {

    return (
        <Dialog open={open} onClose={onCancel} maxWidth={'md'} aria-labelledby="loading-dialog-title" PaperProps={{
            style: {
              backgroundColor: 'white',
              position: 'relative',
            },
          }}>
            <div className="loading-backdrop" open={open}></div>
            <DialogContent>
                <DialogContentText id="loading-dialog-title" className="loading-dialog-content">
                    <strong>Scraping data for {collection} {category} Apps in {country}...</strong>
                </DialogContentText>
                <DialogContentText className="loading-dialog-subtext">
                    On average, scraping top charts takes 5-10 seconds.
                </DialogContentText>
                <LinearProgress className="loading-progress-bar"/>
            </DialogContent>
            <DialogActions>
                <Button onClick={onCancel} color="primary" className="loading-dialog-actions">Cancel</Button>
            </DialogActions>
        </Dialog>
    );
}

export default LoadingTopLists;