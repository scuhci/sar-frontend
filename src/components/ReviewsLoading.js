import { Dialog, DialogContent, DialogContentText, LinearProgress, Button, DialogActions, Backdrop } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import "../css/Loading.css"

function ReviewsLoading({ open, onCancel, appId }) {
    // const theme = useTheme();
    
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
                    Scraping reviews for App Id: "${appId}"`...
                </DialogContentText>
                <DialogContentText className="loading-dialog-subtext">
                    On average, searches take 1-5 minutes.
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