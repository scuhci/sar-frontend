import { Dialog, DialogContent, DialogContentText, LinearProgress, Button, DialogActions } from '@mui/material';
import "../css/Loading.css"

function ReviewsLoading({ open, onCancel, appId }) {
    
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
                    <strong>Scraping reviews for AppName: {appId}`...</strong>
                </DialogContentText>
                <DialogContentText className="loading-dialog-subtext">
                    This usually takes 1-5 minutes. <br></br>

                    Scrapes all of the user reviews available for this app.
                </DialogContentText>
                <LinearProgress className="loading-progress-bar"/>
            </DialogContent>
            <DialogActions>
                <Button onClick={onCancel} color="primary" className="loading-dialog-actions">Cancel</Button>
            </DialogActions>
        </Dialog>
    );
}

export default ReviewsLoading;