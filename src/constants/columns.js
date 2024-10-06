import React from 'react';
import Avatar from '@mui/material/Avatar';
import Button from '@mui/material/Button';
import { Tooltip } from '@mui/material';
import DownloadReviews from '../components/DownloadReviews';

export const columns = [
    { field: 'title', renderHeader: () => <strong>App Name</strong>, minWidth: 250 },
    { field: 'appId', renderHeader: () => <strong>App ID</strong>, minWidth: 250 },
    { field: 'reviewsCount', renderHeader: () => <strong>Total Reviews</strong>, minWidth: 120, renderCell: (params) => params.value},
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
    { field: 'icon', renderHeader: () => <strong>Icon</strong>, width: 100, renderCell: (params) => <Avatar src={params.value} alt="Icon" /> },
    { field: 'developer', renderHeader: () => <strong>Developer</strong>, width: 150 },
    { field: 'currency', renderHeader: () => <strong>Currency</strong>, width: 100 },
    { field: 'price', renderHeader: () => <strong>Price</strong>, width: 50 },
    { field: 'free', renderHeader: () => <strong>Free</strong>, width: 50 },
    { field: 'summary', renderHeader: () => <strong>Summary</strong>, width: 200 },
    { field: 'url', renderHeader: () => <strong>URL</strong>, width: 200 },
    { field: 'currentVersionScore', renderHeader: () => <strong>Current Version Score</strong>, width: 200 },
    { field: 'score', renderHeader: () => <strong>Score</strong>, width: 100 },
    { field: 'source', renderHeader: () => <strong>Source</strong>, width: 100 },
    { field: 'primaryGenre', renderHeader: () => <strong>Primary Genre</strong>, width: 120 },
    { field: 'genres', renderHeader: () => <strong>Genres</strong>, width: 280 },
    { field: 'ratings', renderHeader: () => <strong>Ratings</strong>, width: 100 },
    { field: 'originalPrice', renderHeader: () => <strong>Original Price</strong>, width: 130, renderCell: (params) => params.value ? params.value : "-"},
    { field: 'discountEndDate', renderHeader: () => <strong>Discount End Date</strong>, width: 150, renderCell: (params) => params.value ? params.value : "-"},
    { field: 'available', renderHeader: () => <strong>Available</strong>, width: 80 },
    { field: 'offersIAP', renderHeader: () => <strong>Offers IAP</strong>, width: 80 },
    { field: 'IAPRange', renderHeader: () => <strong>IAP Range</strong>, width: 100 },
    { field: 'supportedDevices', renderHeader: () => <strong>Supported Devices</strong>, width:150},
    { field: 'requiredOsVersion', renderHeader: () => <strong>Minimum IOS Version</strong>, width: 170 },
    { field: 'developerId', renderHeader: () => <strong>Developer Id</strong>, width: 200 },
    { field: 'developerEmail', renderHeader: () => <strong>Developer Email</strong>, width: 200 },
    { field: 'developerWebsite', renderHeader: () => <strong>Developer Website</strong>, width: 200 },
    { field: 'developerAddress', renderHeader: () => <strong>Developer Address</strong>, width: 200 },
    { field: 'privacyPolicy', renderHeader: () => <strong>Privacy Policy</strong>, width: 200 },
    { field: 'genre', renderHeader: () => <strong>Genre</strong>, width: 150 },
    { field: 'genreId', renderHeader: () => <strong>Genre Id</strong>, width: 200 },
    { field: 'previewVideo', renderHeader: () => <strong>Preview Video</strong>, width: 130, renderCell: (params) => params.value ? params.value : "-"},
    { field: 'contentRating', renderHeader: () => <strong>Content Rating</strong>, width: 120 },
    { field: 'adSupported', renderHeader: () => <strong>Ad Supported</strong>, width: 130 },
    { field: 'released', renderHeader: () => <strong>Released</strong>, width: 100 },
    { field: 'version', renderHeader: () => <strong>Version</strong>, width: 100 },
    { field: 'recentChanges', renderHeader: () => <strong>Recent Changes</strong>, width: 200 },
];
