import React from 'react';
import Avatar from '@mui/material/Avatar';
import Button from '@mui/material/Button';
import { Tooltip } from '@mui/material';
import DownloadReviews from '../components/DownloadReviews';

export const columns = [
    { field: 'title', renderHeader: () => <strong>Title</strong>, minWidth: 250 },
    { field: 'appId', renderHeader: () => <strong>App ID</strong>, minWidth: 250 },
    { field: 'reviewsCount', renderHeader: () => <strong>Reviews</strong>, minWidth: 75, renderCell: (params) => params.value},
    { field: 'reviews', renderHeader: () => <strong> </strong>, minWidth: 200, renderCell: (params) => {
        if (params.value[0] < 100000) {
            return (
                DownloadReviews(params.value[1])
            );
        }
        else {
            return (
                <div className='Reviews count & button'>
                    <Tooltip title = "Unable to scrape reviews for this app due to review count being greater than max 100000 reviews.">
                    <span>
                        <Button disabled variant="outlined" size="small"> 
                            <strong>Scrape Reviews</strong>
                        </Button>
                    </span>
                    </Tooltip>
                </div>
            );
        }
    }},
    { field: 'icon', renderHeader: () => <strong>Icon</strong>, minWidth: 100, renderCell: (params) => <Avatar src={params.value} alt="Icon" /> },
    { field: 'developer', renderHeader: () => <strong>Developer</strong>, minWidth: 150 },
    { field: 'currency', renderHeader: () => <strong>Currency</strong>, minWidth: 100 },
    { field: 'price', renderHeader: () => <strong>Price</strong>, minWidth: 50 },
    { field: 'free', renderHeader: () => <strong>Free</strong>, minWidth: 50 },
    { field: 'summary', renderHeader: () => <strong>Summary</strong>, minWidth: 200 },
    { field: 'url', renderHeader: () => <strong>URL</strong>, minWidth: 200 },
    { field: 'scoreText', renderHeader: () => <strong>Score Text</strong>, minWidth: 100 },
    { field: 'score', renderHeader: () => <strong>Score</strong>, minWidth: 100 },
    { field: 'source', renderHeader: () => <strong>Source</strong>, minWidth: 100 },
    { field: 'installs', renderHeader: () => <strong>Installs</strong>, minWidth: 100 },
    { field: 'maxInstalls', renderHeader: () => <strong>Max Installs</strong>, minWidth: 100 },
    { field: 'ratings', renderHeader: () => <strong>Ratings</strong>, minWidth: 100 },
    { field: 'originalPrice', renderHeader: () => <strong>Original Price</strong>, minWidth: 120, renderCell: (params) => params.value ?? "-"},
    { field: 'discountEndDate', renderHeader: () => <strong>Discount End Date</strong>, minWidth: 150, renderCell: (params) => params.value ?? "-"},
    { field: 'available', renderHeader: () => <strong>Available</strong>, minWidth: 100 },
    { field: 'offersIAP', renderHeader: () => <strong>Offers IAP</strong>, minWidth: 100 },
    { field: 'IAPRange', renderHeader: () => <strong>IAP Range</strong>, minWidth: 200 },
    { field: 'androidVersion', renderHeader: () => <strong>Android Version</strong>, minWidth: 120 },
    { field: 'androidMaxVersion', renderHeader: () => <strong>Android Max Version</strong>, minWidth: 160 },
    { field: 'developerId', renderHeader: () => <strong>Developer Id</strong>, minWidth: 200 },
    { field: 'developerEmail', renderHeader: () => <strong>Developer Email</strong>, minWidth: 200 },
    { field: 'developerWebsite', renderHeader: () => <strong>Developer Website</strong>, minWidth: 200 },
    { field: 'developerAddress', renderHeader: () => <strong>Developer Address</strong>, minWidth: 200 },
    { field: 'privacyPolicy', renderHeader: () => <strong>Privacy Policy</strong>, minWidth: 200 },
    { field: 'genre', renderHeader: () => <strong>Genre</strong>, minWidth: 150 },
    { field: 'genreId', renderHeader: () => <strong>Genre Id</strong>, minWidth: 200 },
    { field: 'previewVideo', renderHeader: () => <strong>Preview Video</strong>, minWidth: 100, renderCell: (params) => params.value ?? "-"},
    { field: 'contentRating', renderHeader: () => <strong>Content Rating</strong>, minWidth: 120 },
    { field: 'adSupported', renderHeader: () => <strong>Ad Supported</strong>, minWidth: 120 },
    { field: 'released', renderHeader: () => <strong>Released</strong>, minWidth: 120 },
    { field: 'version', renderHeader: () => <strong>Version</strong>, minWidth: 100 },
    { field: 'recentChanges', renderHeader: () => <strong>Recent Changes</strong>, minWidth: 200 },
];
