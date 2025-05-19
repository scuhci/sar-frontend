import React, { useState, useRef } from 'react';
import Button from '@mui/material/Button';
import { Tooltip } from '@mui/material';
import ReviewsLoading from './ReviewsLoading';
import axios from 'axios';
import { useScraper } from "../components/SelectedScraperProvider";

const DownloadReviews = (appId, countryCode) => {
    const { selectedScraper } = useScraper();
    const [isLoading, setIsLoading] = useState(false);
    const [abortController, setAbortController] = useState(null);
    const [jobId, setJobId] = useState(null);
    const pollRef = useRef(null);

    const handleCancel = () => {
        abortController.abort();
        setIsLoading(false);
    };

    const downloadAllReviews = async (appId) => {
        try {
            if (abortController) {
                abortController.abort();
            }

            const newAbortController = new AbortController();
            setAbortController(newAbortController);
            console.log("Country Code is %s\n", countryCode);
            setIsLoading(true);

           await axios.get(selectedScraper === "Play Store"
                ? `/reviews?appId=${appId}&countryCode=${countryCode}`
                : `/ios/reviews?appId=${appId}&countryCode=${countryCode}`, {
                signal: newAbortController.signal,
                // responseType: 'blob', //handling the binary data
                // headers: {
                //     // Include authorization tokens
                // }
            }).then((response) => {
                console.log(response);
                setJobId(response.data.jobId);
                setIsLoading(true);
                pollStatus(response.data.jobId);
            })
            .catch((error) => {
                    console.error("Job creation failed for download reviews", error);
                    setIsLoading(false);

            });
        } catch (error) {
            console.error('Error fetching or downloading the reviews file:', error);
            setIsLoading(false);
        }
        setIsLoading(false);
    };

    const POLL_INTERVAL = 3000;

    const pollStatus = (id) => {
        pollRef.current = setTimeout(async () => {
            try {
                
                const response = await axios.get(
                    selectedScraper === "Play Store"
                        ? `reviews/job-status?jobId=${id}`
                        : `/ios/reviews/job-status?jobId=${id}`,
                        {responseType: 'blob',  
                            headers: {
                                //Include authorization tokens
                            }} //handling the binary data
                );
                console.log('Reviews');
                console.log(response);

                // 2. Read the state header (axios lowercases header names)
                const jobState = response.headers['x-job-state'] 
                || (() => {
                    // fallback: if it really was JSON and parsed as blob, try parsing it
                    const text = new TextDecoder().decode(response.data);
                    try {
                        return JSON.parse(text).status;
                    } catch {
                        return null;
                    }
                    })();
                switch (jobState) {
                    case "completed":
                        let filename = `${id}_reviews.csv`; 
                        const dispo = response.headers['content-disposition'];
                        if (dispo) {
                            const match = /filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/.exec(dispo);
                            if (match?.[1]) {
                            filename = match[1].replace(/['"]/g, '');
                            }
                        }

                        console.log(`Filename from header: ${filename}`);

                        // Create a URL from the blob
                        console.log(response);
                        
                        const url = window.URL.createObjectURL(new Blob(["\ufeff", response.data], { type: 'text/csv;charset=utf-8' }));

                        // Create a link element, set the href to the blob URL, and trigger a download
                        const link = document.createElement('a');
                        link.href = url;
                        link.setAttribute('download', filename);
                        document.body.appendChild(link);
                        link.click();

                        // Clean up and revoke the URL
                        document.body.removeChild(link);
                        window.URL.revokeObjectURL(url);
                        break;
                    case "failed":
                        console.error("Job failed on server");
                        setIsLoading(false);
                        clearTimeout(pollRef.current);
                        setJobId(null);
                        break;
                    default:
                        pollStatus(id);
                        break;
                }
            } catch (err) {
                console.error("Error polling job status for download reviews.", err);
                setIsLoading(false);
                clearTimeout(pollRef.current);
                setJobId(null);
            }
        }, POLL_INTERVAL);
    }


    return (
        <div className='Reviews count & button'>
            <Tooltip title="Scraping reviews for an app may take 1-5 minutes.">
                <Button variant="outlined" size="small" onClick={() => downloadAllReviews(appId)}>
                    <strong>Scrape Reviews</strong>
                </Button>
            </Tooltip>
            <ReviewsLoading open={isLoading} onCancel={handleCancel} appId={appId} />
        </div>
    );
}

export default DownloadReviews;