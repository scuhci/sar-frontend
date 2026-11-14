import React from 'react';
import { Typography, Container, Divider, Box, Link, IconButton } from '@mui/material';
import { Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper, ToggleButton, ToggleButtonGroup } from '@mui/material'
import Footer from '../components/Footer';
import "../css/UserGuide.css";
import { Android, Apple, ChevronLeft, ChevronRight } from '@mui/icons-material';
const UserGuide = () => {
    const [sidebarOpen, setSidebarOpen] = React.useState(true);
    const [selectedStore, setSelectedStore] = React.useState('PS')
    const handleChange = (event, newStore) => {
        setSelectedStore(newStore);
    };

    const createData = (name, desc) => {
        return { name, desc };
    }
    const appRows_PlayStore = [
        createData('appName', 'Name of the app'),
        createData('appId', 'App bundle identifier'),
        createData('url', 'App page URL (Play Store)'),
        createData('icon', 'App image icon URL'),
        createData('developer', 'App developer'),
        createData('developerId', 'App developer’s ID as registered with Play Store'),
        createData('currency', 'Currency to purchase app'),
        createData('price', 'Purchase cost of app'),
        createData('description', 'Short summary (tagline) shown on the app’s Play Store page. The full app description is not included.'),
        createData('avgRating', 'Average app rating (out of 5)'),
        createData('country', "Play Store country code. Keyword and app ID search files only; Top Charts files do not have this column."),
        createData('scrapedFrom', 'Keyword and app ID search files only; Top Charts files do not have this column. Two possible values: (1) keyword search - the results of searching for the keyword in Google Play. SMAR requests up to 20 results per keyword search. An app ID lookup returns one app, which is also labelled keyword search. (2) similar app links - for each keyword search result, the results of a second Google Play search for “related to <app title>”. This allows researchers to gather a larger number of apps that are related to a specific keyword. Regardless of how many times an app is found it is only shown once in the CSV (duplicates are removed).'),
        createData('approximateInstalls', 'Approximation of total app downloads/installs'),
        createData('totalRatings', 'Total number of user provided ratings'),
        createData('totalReviews', 'Total number of user provided reviews'),
        createData('originalPrice', 'Original app price, if app is currently on sale'),
        createData('discountEndDate', 'Price discount end date, if app is currently on sale'),
        createData('downloadable', 'Whether app is currently downloadable from Play Store'),
        createData('inAppPurchases', 'Whether app offers in app purchases (IAPs)'),
        createData('inAppPurchasesPriceRange', 'Price range of IAPs, if app offers in app purchases'),
        createData('androidMinVersion', 'Minimum Android version necessary to run app'),
        createData('developerEmail', 'App developer’s email'),
        createData('developerWebsite', 'App developer’s website'),
        createData('developerAddress', 'App developer’s address'),
        createData('privacyPolicyURL', 'App’s privacy policy URL'),
        createData('genreId', 'App’s genre'),
        createData('contentRating', 'App’s content rating as described on Play Store'),
        createData('inAppAdvertisements', 'Whether in app advertisements are supported'),
        createData('originalReleaseDate', 'App’s initial release date'),
        createData('currentAppVersion', 'Current app version'),
        createData('currentVersionChanges', 'Release notes from latest app update'),
        createData('permissionsFetchFailed', "Only present when 'Include permissions in scrape' is checked. true when the app's permissions could not be retrieved; its permission columns are then left empty."),
        createData('dateScraped', 'Timestamp, date from when this app data was scraped')
    ]
    const reviewRows_PlayStore = [
        createData('reviewID', "Review's unique ID registered with the Play Store"),
        createData('dateReviewed', 'Date on which review was published'),
        createData('rating', 'App rating as given by review'),
        createData('reviewURL', "Review's Play Store URL"),
        createData('reviewText', 'Actual review text'),
        createData('developerReplyDate', 'Date on which the developer replied to the review, if at all'),
        createData('developerReplyText', 'The actual developer reply to the posted review, if it exists'),
        createData('versionWhenReviewed', "App's version number at the time when the current review was published"),
        createData('helpfulVotes', 'Number of people that found this review helpful and upvoted it'),
        createData('country', 'Play Store country code'),
        createData('dateScraped', 'Timestamp, date from when this review data was scraped')
    ]

    const appRows_AppStore = [
        createData('id', 'Numeric App Store ID of the app'),
        createData('appId', 'App bundle identifier'),
        createData('appName', 'Name of the app'),
        createData('url', 'App page URL (App Store)'),
        createData('description', 'App description on the App Store'),
        createData('icon', 'App image icon URL'),
        createData('genres', 'A comma separated list of genres this app falls within'),
        createData('genreIDs', 'A comma separated list of genre IDs corresponding to the genres this app falls within'),
        createData('primaryGenre', 'The primary genre this app is classified within'),
        createData('primaryGenreId', 'The ID of the primary genre this app is classified within'),
        createData('contentRating', "App's content rating as described on App Store"),
        createData('supportedLanguages', 'The various languages officially supported by this app'),
        createData('appSizeInBytes', 'Size of the app (in Bytes)'),

        createData('requiredOsVersion', 'Minimum iOS (and iPadOS, if supported) version necessary to run app'),
        createData('originalReleaseDate', "App's initial release date"),
        createData('lastUpdated', 'Timestamp of when the app was last updated by the developer'),
        createData('releaseNotes', 'Release notes from latest app update'),
        createData('currentAppVersion', 'Current app version'),
        createData('price', 'Purchase cost of app'),
        createData('currency', 'Currency to purchase app'),
        createData('developerId', "App developer's ID as registered with App Store"),
        createData('developer', 'App developer'),
        createData('developerAppStorePageURL', "The URL of the developer's page on the App Store"),
        createData('developerWebsite', "App developer's website"),
        createData('avgRating', 'Average app rating (out of 5)'),
        createData('totalReviews', 'Total number of user ratings. This is the rating count the App Store reports; it is not a count of written reviews.'),
        createData('currentVersionAvgRating', 'The average app rating for the most recent (currently released) version'),
        createData('currentVersionReviews', 'Number of user ratings for the most recent (current) version of the app, as reported by the App Store'),
        createData('appScreenshots', 'Screenshot previews of the app from its App Store page'),
        createData('appIpadScreenshots', 'Screenshot previews of the iPad app (if officially supported)'),
        createData('appletvScreenshots', 'Screenshot previews of the Apple TV app (if officially supported)'),
        createData('supportedDeviceList', 'A list of various devices that are supported by the app'),
        createData('country', "App Store country code. Keyword and app ID search files only; Top Charts files do not have this column."),
        createData('collection', 'Top Charts files only: the chart the app was scraped from'),
        createData('scrapedFrom', 'Keyword and app ID search files only; Top Charts files do not have this column. Two possible values: (1) keyword search - the results of searching for the keyword in the Apple App Store. SMAR requests up to 50 results per keyword search. An app ID lookup returns one app, which is also labelled keyword search. (2) similar app links - the apps the App Store lists as similar to each of the keyword search results. This allows researchers to gather a larger number of apps that are related to a specific keyword. Regardless of how many times an app is found it is only shown once in the CSV (duplicates are removed).'),
        createData('dateScraped', 'Timestamp, date from when this app data was scraped'),
    ]

    const reviewRows_AppStore = [
        createData('reviewID', "Review's unique ID registered with the App Store"),
        createData('versionWhenReviewed', "App's version number at the time when the current review was published"),
        createData('rating', 'App rating as given by review'),
        createData('reviewTitle', 'Title the reviewer gave the review'),
        createData('reviewText', 'Actual review text'),
        createData('reviewURL', "Review's App Store URL"),

        createData('dateReviewed', 'Date and time when the review was published'),

        createData('country', 'App Store country code'),
        createData('dateScraped', 'Timestamp, date from when this review data was scraped')
    ]

    const MetadataTable = ({ rows }) => {
        return (
            <TableContainer component={Paper}>
                <Table sx={{ minWidth: 250 }} aria-label="simple table">
                    <TableHead>
                        <TableRow>
                            <TableCell><b>Field</b></TableCell>
                            <TableCell><b>Description</b></TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {rows.map((row) => (
                            <TableRow key={row.name} sx={{ '&:last-child td, &:last-child th': { border: 0 } }}>
                                <TableCell component="th" scope="row">
                                    {row.name}
                                </TableCell>
                                <TableCell align="left">{row.desc}</TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </TableContainer>
        )
    }

    const tocLinkSx = {
        color: 'inherit',
        textDecoration: 'none',
        display: 'block',
        '&:hover': { textDecoration: 'underline' },
    };

    return (

        <Container sx={{ marginTop: 7 }} maxWidth="lg">
            <div className="app-container">
                <div className="content">
                    <Typography variant="h4" className="main-header">User Guide</Typography>

                    <div className="user-guide-layout">
                        <div className="user-guide-toc-cluster">
                            <div className="user-guide-sidebar-rail">
                                <IconButton
                                    size="small"
                                    onClick={() => setSidebarOpen((o) => !o)}
                                    aria-expanded={sidebarOpen}
                                    aria-controls={sidebarOpen ? 'user-guide-toc-list' : undefined}
                                    aria-label={sidebarOpen ? 'Hide table of contents' : 'Show table of contents'}
                                    className="user-guide-sidebar-toggle"
                                >
                                    {sidebarOpen ? <ChevronLeft fontSize="small" /> : <ChevronRight fontSize="small" />}
                                </IconButton>
                            </div>
                            <nav
                                className={`user-guide-sidebar${sidebarOpen ? '' : ' user-guide-sidebar--collapsed'}`}
                                aria-label="Table of contents"
                            >
                                <Typography variant="h5" component="h2" className="toc-sidebar-title">
                                    Contents
                                </Typography>
                            {sidebarOpen && (
                            <ul id="user-guide-toc-list" className="toc-tree">
                                <li className="toc-section">
                                    <Link href="#SMAR_Background" sx={tocLinkSx} variant="subtitle1" className="toc-section-link" fontWeight={600}>
                                        SMAR Background
                                    </Link>
                                    <ul className="toc-sublist">
                                        <li>
                                            <Link href="#SMAR_Study" sx={tocLinkSx} variant="body2">What is a SMAR Study?</Link>
                                        </li>
                                        <li>
                                            <Link href="#Why_SMAR" sx={tocLinkSx} variant="body2">Why would I want to conduct an SMAR?</Link>
                                        </li>
                                    </ul>
                                </li>
                                <li className="toc-section">
                                    <Link href="#SMAR_Tool_Usage" sx={tocLinkSx} variant="subtitle1" className="toc-section-link" fontWeight={600}>
                                        SMAR Tool Usage
                                    </Link>
                                    <ul className="toc-sublist">
                                        <li>
                                            <Link href="#Keyword_Search" sx={tocLinkSx} variant="body2">Conducting a Keyword Search</Link>
                                        </li>
                                        <li>
                                            <Link href="#TopLists_Search" sx={tocLinkSx} variant="body2">Conducting a Top Charts Search</Link>
                                        </li>
                                        <li>
                                            <Link href="#Bulk_Reviews" sx={tocLinkSx} variant="body2">Scraping Reviews in Bulk</Link>
                                        </li>
                                    </ul>
                                </li>
                                <li className="toc-section">
                                    <Link href="#SMAR_Metadata_Breakdown" sx={tocLinkSx} variant="subtitle1" className="toc-section-link" fontWeight={600}>
                                        SMAR Metadata Breakdown
                                    </Link>
                                    <ul className="toc-sublist">
                                        <li>
                                            <Link href="#App_Metadata" sx={tocLinkSx} variant="body2">App Metadata</Link>
                                        </li>
                                        <li>
                                            <Link href="#Review_Metadata" sx={tocLinkSx} variant="body2">Review Metadata</Link>
                                        </li>
                                    </ul>
                                </li>
                                <li className="toc-section toc-section--leaf">
                                    <Link href="#References" sx={tocLinkSx} variant="subtitle1" className="toc-section-link" fontWeight={600}>
                                        References
                                    </Link>
                                </li>
                            </ul>
                            )}
                            </nav>
                        </div>

                        <div className="user-guide-main">
                    <br />
                    <Divider variant="li" />
                    <br />
                    <br />

                    <Typography variant="h4" className="section-header" id="SMAR_Background">SMAR Background</Typography>

                    <Typography variant="h5" className="section-sub-header" id="SMAR_Study">What is a SMAR study?</Typography>
                    <Typography variant="body1" className="main-text">An SMAR (systematic app review) can be generally classified
                        as a search and subsequent analysis of applications that meet certain criteria across
                        a set of mobile app stores. Search criteria can include keywords, download count, and
                        other information available in the corresponding app's store page. The search results
                        from the SMAR include large-scale app metadata - such as user reviews and app permissions
                        - as well as app contents such as functionality or accessibility.
                    </Typography>
                    <br />
                    <Typography variant="body1" className="main-text">
                        The general steps of an SMAR can be classified as follows:
                    </Typography>
                    <br />
                    <Typography variant="body1" className="main-text">
                        First, the researcher plans the topic, scope, and timeline of their app review. Second, they select a corpus
                        of mobile apps. Third, they extract data for analysis, e.g., user reviews or app files. Fourth,
                        they analyze their data, using either qualitative, quantitative, or automated analysis. Fifth,
                        they report their method and findings.
                    </Typography>

                    <Box display="flex" justifyContent="center" alignItems="center">
                        <img src={require('../res/SMAR_Steps.png')} className="inline-image-nb" alt="SMAR steps" />
                    </Box>

                    <Typography variant="h5" className="section-sub-header" id="Why_SMAR">Why would I want to conduct an SMAR?</Typography>
                    <Typography variant="body1" className="main-text">
                        Conducting an SMAR is a valuable way for researchers to quickly yet effectively collect targeted mobile
                        application data at scale. This is the starting point for many research studies aiming to analyze a
                        subset of the existing catalog of millions of mobile applications across different platforms.
                    </Typography>
                    <br />
                    <Typography variant="body1" className="main-text">
                        The SMAR method has been used in many fields. In the field of HCI (Human-Computer Interaction), researchers
                        have studied how children perceive parental control apps [1,5,8], user reviews of mental health apps [6],
                        dark patterns in Japanese apps [7], and missing label accessibility failures in Android apps [4]. In health,
                        researchers have examined apps for child development [3], support functions in pain management apps [2], and
                        menstrual tracking apps [9]. All of these studies started with a systematic search of app store(s).
                    </Typography>
                    <br />
                    <Typography variant="body1" className="main-text">
                        Existing SMAR tools are either paid products targeted towards commercial developers, or free tools that
                        require technical expertise to get up and running. Our free SMAR tool aims to provide a flexible feature
                        set and intuitive interface to enable researchers of all backgrounds to quickly yet effectively conduct SMAR's.
                    </Typography>

                    <br /><br />
                    <Divider variant="li" />
                    <br /><br />

                    <Typography variant="h4" className="section-header" id="SMAR_Tool_Usage">SMAR Tool Usage</Typography>

                    <Typography variant="h5" className="section-sub-header" id="Keyword_Search">I. Conducting a Keyword Search</Typography>
                    <br />
                    <Typography variant="body1" className="main-text">
                        The SMAR Tool is designed around the central search bar that allows
                        users to quickly retrieve a filtered list of applications from the Google Play Store or the Apple App Store
                        in a certain country.
                    </Typography>
                    <br />
                    <Typography variant="body1" className="main-text">
                        <b>1.</b> To get started, select which app store you would like to search and type in a search keyword (1). The store
                        country can be changed using the dropdown menu (a), which also supports type to search. Optionally, when scraping
                        the Google Play Store, check the 'Include permissions in scrape' button (b) to also retrieve individual app
                        permissions (such as microphone or camera access). Click on the 'Scrape Play Store' button (2), which reads
                        'Scrape App Store' when the App Store is selected, to begin the search process.
                    </Typography>
                    <Box display="flex" justifyContent="center" alignItems="center">
                        <img src={require('../res/SMAR_Home_Screen.png')} className="inline-image" alt="SMAR steps" />
                    </Box>
                    <br /><br />
                    <Typography variant="body1" className="main-text">
                        <b>2.</b> Now a dialog box will appear with the following message: “Scraping data for *your keyword* ”. This will take
                        a few minutes to complete.
                    </Typography>
                    <Box display="flex" justifyContent="center" alignItems="center">
                        <img src={require('../res/SMAR_Searching_Dialog.png')} className="inline-image" alt="SMAR steps" />
                    </Box>
                    <br /><br />

                    <Typography variant="body1" className="main-text">
                        <b>3.</b> Once the search has completed, a portion of the page will update with search results. A preview of the first
                        few results will be visible (4) and are horizontally scrollable, while additional results can be viewed using the
                        pagination controls (5). User reviews for applications can be scraped by clicking the corresponding row's 'scrape
                        reviews' button (6) which is enabled when the application has reviews. <i>Scraping returns the
                            newest reviews, up to 10,000 per application on Google Play and 500 on the App Store.</i> The full list of results,
                        along with a reproducibility log containing SMAR search metadata can be downloaded by clicking the button at the bottom
                        of the page (7). The descriptions regarding each individual metadata field, for both the Play Store and App Store, can be
                        found in the section 'SMAR Metadata Breakdown'.
                    </Typography>
                    <Box display="flex" justifyContent="center" alignItems="center">
                        <img src={require('../res/SMAR_Results_Screen.png')} className="inline-image" alt="SMAR steps" />
                    </Box>
                    <br /><br />
                    <Typography variant="body1" className="main-text">
                        <b>4.</b> To begin another search, repeat steps <b>1-3</b>.
                    </Typography>
                    <br /><br />

                    <Typography variant="h5" className="section-sub-header" id="TopLists_Search">II. Conducting a Top Charts Search</Typography>
                    <br />
                    <Typography variant="body1" className="main-text">
                        <b>1.</b> To get started, navigate to the Top Charts page by either clicking on the example collections (1) or
                        the header navigation buttons (2).
                    </Typography>
                    <Box display="flex" justifyContent="center" alignItems="center">
                        <img src={require('../res/SMAR_Home_Screen_TL.png')} className="inline-image" alt="SMAR home screen" />
                    </Box>
                    <br /><br />

                    <Typography variant="body1" className="main-text">
                        <b>2.</b> Now, select which app store you would like to search (3). The dropdown menus will adjust depending on the
                        selected app store -- now select the desired filters (4). <i>If scraping the Google Play Store, the 'Include permissions
                            in scrape' button (a) will be visible, and can be checked to retrieve individual app permissions (such as microphone or
                            camera access) in addition to other app metadata.</i> Click on the 'Search' button (5) to begin the search process.
                    </Typography>
                    <Box display="flex" justifyContent="center" alignItems="center">
                        <img src={require('../res/SMAR_TL.png')} className="inline-image" alt="SMAR top lists" />
                    </Box>
                    <br /><br />

                    <Typography variant="body1" className="main-text">
                        <b>3.</b> Now a dialog box will appear with the following message: “Scraping data for *Your collection* apps in *your selected
                        country* ”. This will take a few seconds to complete.
                    </Typography>
                    <Box display="flex" justifyContent="center" alignItems="center">
                        <img src={require('../res/SMAR_Searching_Dialog_TL.png')} className="inline-image" alt="SMAR steps" />
                    </Box>
                    <br /><br />

                    <Typography variant="body1" className="main-text">
                        <b>4.</b> Once the search has completed, a portion of the page will update with search results - this is the same as
                        the interface for displaying keyword search results.
                        <br /><br />
                        A preview of the first few results will be visible (6) and are horizontally scrollable, while additional results can be
                        viewed using the pagination controls (7). User reviews for applications can be scraped by clicking the corresponding row's
                        'scrape reviews' button (8) which is enabled when the application has reviews. <i>Scraping returns the
                            newest reviews, up to 10,000 per application on Google Play and 500 on the App Store.</i> The full list of results,
                        along with a reproducibility log containing SMAR search metadata can be downloaded by clicking the button at the bottom
                        of the page (9). The descriptions regarding each individual metadata field, for both the Play Store and App Store, can be
                        found in the next section 'SMAR Metadata Breakdown'.
                    </Typography>
                    <Box display="flex" justifyContent="center" alignItems="center">
                        <img src={require('../res/SMAR_Results_Screen_TL.png')} className="inline-image" alt="SMAR steps" />
                    </Box>
                    <br /><br />

                    <Typography variant="h5" className="section-sub-header" id="Bulk_Reviews">III. Scraping Reviews in Bulk</Typography>
                    <br />
                    <Typography variant="body1" className="main-text">
                        <b>1.</b> To scrape the reviews of several apps at once, navigate to the Bulk Reviews page using the header
                        navigation buttons and select which app store you would like to search.
                    </Typography>
                    <br />
                    <Typography variant="body1" className="main-text">
                        <b>2.</b> Enter the app IDs, separated by commas (for example com.example.app1, com.example.app2), and click on the
                        'Scrape Play Store' button, which reads 'Scrape App Store' when the App Store is selected.
                    </Typography>
                    <br />
                    <Typography variant="body1" className="main-text">
                        <b>3.</b> Check the list of apps that were found, then click on the 'Scrape and Download Reviews' button to
                        download the reviews for all of the listed apps, along with a reproducibility log.
                    </Typography>
                    <br /><br />

                    <br /><br />
                    <Divider variant="li" />
                    <br /><br />

                    <Typography variant="h4" className="section-header" id="SMAR_Metadata_Breakdown">SMAR Metadata Breakdown</Typography>

                    <ToggleButtonGroup
                        color="primary"
                        value={selectedStore}
                        exclusive
                        onChange={handleChange}
                        aria-label="Platform"
                        sx={{ marginBottom: 3, marginTop: 3 }}
                    >
                        <ToggleButton value="PS">
                            <Android style={{ marginRight: 10 }} />
                            Play Store
                        </ToggleButton>
                        <ToggleButton value="AS">
                            <Apple style={{ marginRight: 8 }} />
                            App Store
                        </ToggleButton>
                    </ToggleButtonGroup>

                    {selectedStore === "PS" && (
                        <div>
                            <Typography variant="h5" className="section-sub-header" id="App_Metadata">App Metadata (Play Store)</Typography>
                            <br />

                            <MetadataTable rows={appRows_PlayStore} />
                            <br />
                            <Typography variant="body1" className="main-text" id="Permission_Columns">
                                When 'Include permissions in scrape' is checked, the file also has one column per app permission
                                (for example 'take pictures and videos'), holding true or false for each app. The cells are left empty for an
                                app whose permissions could not be retrieved (see permissionsFetchFailed).
                            </Typography>
                            <br /><br />

                            <Typography variant="h5" className="section-sub-header" id="Review_Metadata">Review Metadata (Play Store)</Typography>
                            <MetadataTable rows={reviewRows_PlayStore} />
                        </div>
                    )}

                    {selectedStore === "AS" && (
                        <div>
                            <Typography variant="h5" className="section-sub-header" id="App_Metadata">App Metadata (App Store)</Typography>
                            <br />

                            <MetadataTable rows={appRows_AppStore} />
                            <br /><br />

                            <Typography variant="h5" className="section-sub-header" id="Review_Metadata">Review Metadata (App Store)</Typography>
                            <MetadataTable rows={reviewRows_AppStore} />
                        </div>
                    )}

                    <br /><br /><br />
                    <Divider variant="li" />
                    <br /><br />

                    <Typography variant="h4" className="section-header" id="References">References</Typography>
                    <br />
                    <Typography variant="body1" className="refs">
                        [1] Turki Alelyani, Arup Kumar Ghosh, Larry Moralez, Shion Guha, and Pamela Wisniewski. 2019. Examining Parent Versus Child Reviews of Parental Control Apps on Google Play. In Social Computing and Social Media. Communication and Social Communities, 3–21. <Link href="https://doi.org/10.1007/978-3-030-21905-5_1" target="_blank" rel="noopener noreferrer">https://doi.org/10.1007/978-3-030-21905-5_1</Link>
                    </Typography>
                    <br />
                    <Typography variant="body1" className="refs">
                        [2] Hemakumar Devan, Devin Farmery, Lucy Peebles, and Rebecca Grainger. 2019. Evaluation of Self-Management Support Functions in Apps for People With Persistent Pain: Systematic Review. JMIR mHealth and uHealth 7, 2: e13080. <Link href="https://doi.org/10.2196/13080" target="_blank" rel="noopener noreferrer">https://doi.org/10.2196/13080</Link>
                    </Typography>
                    <br />
                    <Typography variant="body1" className="refs">
                        [3] Akeiylah DeWitt, Julie Kientz, and Kendra Liljenquist. 2022. Quality of Mobile Apps for Child Development Support: Search in App Stores and Content Analysis. JMIR pediatrics and parenting 5, 4: e38793. <Link href="https://doi.org/10.2196/38793" target="_blank" rel="noopener noreferrer">https://doi.org/10.2196/38793</Link>
                    </Typography>
                    <br />
                    <Typography variant="body1" className="refs">
                        [4] Raymond Fok, Mingyuan Zhong, Anne Spencer Ross, James Fogarty, and Jacob O. Wobbrock. 2022. A Large-Scale Longitudinal Analysis of Missing Label Accessibility Failures in Android Apps. In Proceedings of the 2022 CHI Conference on Human Factors in Computing Systems (CHI ’22), 1–16. <Link href="https://doi.org/10.1145/3491102.3502143" target="_blank" rel="noopener noreferrer">https://doi.org/10.1145/3491102.3502143</Link>
                    </Typography>
                    <br />
                    <Typography variant="body1" className="refs">
                        [5] Arup Kumar Ghosh, Karla Badillo-Urquiola, Shion Guha, Joseph J. LaViola Jr, and Pamela J. Wisniewski. 2018. Safety vs. Surveillance: What Children Have to Say about Mobile Apps for Parental Control. In Proceedings of the 2018 CHI Conference on Human Factors in Computing Systems (CHI ’18), 1–14. <Link href="https://doi.org/10.1145/3173574.3173698" target="_blank" rel="noopener noreferrer">https://doi.org/10.1145/3173574.3173698</Link>
                    </Typography>
                    <br />
                    <Typography variant="body1" className="refs">
                        [6] M. R. Haque and S. Rubya. 2022. “For an app supposed to make its users feel better, it sure is a joke”-an analysis of user reviews of mobile mental health applications. Proceedings of the ACM on Human-Computer Interaction 6, CSCW2. <Link href="https://doi.org/10.1145/3555146" target="_blank" rel="noopener noreferrer">https://doi.org/10.1145/3555146</Link>
                    </Typography>
                    <br />
                    <Typography variant="body1" className="refs">
                        [7] Shun Hidaka, Sota Kobuki, Mizuki Watanabe, and Katie Seaborn. 2023. Linguistic Dead-Ends and Alphabet Soup: Finding Dark Patterns in Japanese Apps. In Proceedings of the 2023 CHI Conference on Human Factors in Computing Systems (CHI ’23), 1–13. <Link href="https://doi.org/10.1145/3544548.3580942" target="_blank" rel="noopener noreferrer">https://doi.org/10.1145/3544548.3580942</Link>
                    </Typography>
                    <br />
                    <Typography variant="body1" className="refs">
                        [8] P. Wisniewski, A. K. Ghosh, H. Xu, and M. B. Rosson. 2017. Parental Control vs. Teen Self-Regulation: Is there a middle ground for mobile online safety? In Proceedings of the 2017 ACM Conference on Computer Supported Cooperative Work and Social Computing (CSCW ’17). <Link href="https://doi.org/10.1145/2998181.2998352" target="_blank" rel="noopener noreferrer">https://doi.org/10.1145/2998181.2998352</Link>
                    </Typography>
                    <br />
                    <Typography variant="body1" className="refs">
                        [9] Rhonda Zwingerman, Michael Chaikof, and Claire Jones. 2020. A Critical Appraisal of Fertility and Menstrual Tracking Apps for the iPhone. Journal of obstetrics and gynaecology Canada: JOGC = Journal d’obstetrique et gynecologie du Canada: JOGC 42, 5: 583–590. <Link href="https://doi.org/10.1016/j.jogc.2019.09.023" target="_blank" rel="noopener noreferrer">https://doi.org/10.1016/j.jogc.2019.09.023</Link>
                    </Typography>
                        </div>
                    </div>
                </div>
                <Footer />
            </div>
            <br />
        </Container>

    );
}

export default UserGuide;