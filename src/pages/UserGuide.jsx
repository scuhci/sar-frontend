import React from 'react';
import { Typography, Container, Divider, Box, Link } from '@mui/material';
import { Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper } from '@mui/material'
import Footer from '../components/Footer';
import "../css/UserGuide.css";

const UserGuide = () => {
    const createData = (name, desc) => {
        return { name, desc };
    }
    const appRows = [
        createData('appName', 'Name of the app'),
        createData('appID', 'App bundle identifier'),
        createData('url', 'App page URL (Play Store)'),
        createData('icon', 'App image icon URL'),
        createData('developer', 'App developer'),
        createData('currency', 'Currency to purchase app'),
        createData('price', 'Purchase cost of app'),
        createData('description', 'App description on Play Store'),
        createData('avgRating', 'Average app rating'),
        createData('scrapedFrom', 'Two possible values: (1) Keyword search results - the results from searching for a keyword in Google Play. While Google Play previously returned hundreds of results it now returns a maximum of 30 results for a keyword search, as of September 2024. (2) Similar app links - Links (if any) to “Similar Apps/Games” shown on the app profile page for each of the keyword search results. This allows researchers to gather a larger number of apps that are related to a specific keyword. Regardless of how many times an app appears in “Similar Apps/Games” it is only shown once in the CSV (duplicates are removed).'),
        createData('approximateInstalls', 'Approximation of total app downloads/installs'),
        createData('totalRatings', 'Total number of user provided ratings'),
        createData('totalReviews', 'Total number of user provided reviews'),
        createData('originalPrice', 'Original app price, if app is currently on sale'),
        createData('discountEndDate', 'Price discount end date, if app is currently on sale'),
        createData('downloadable', 'Whether app is currently downloadable from Play Store'),
        createData('inAppPurchases', 'Whether app offers in app purchases (IAPs)'),
        createData('inAppPurchasesPriceRange', 'Price range of IAPs, if app offers in app purchases'),
        createData('androidMinVersion', 'Minimum Android version necessary to run app'),
        createData('developerID', 'App developer’s ID as registered with Play Store'),
        createData('developerEmail', 'App developer’s email'),
        createData('developerWebsite', 'App developer’s website'),
        createData('developerAddress', 'App developer’s address'),
        createData('privacyPolicyURL', 'App’s privacy policy URL'),
        createData('genreID', 'App’s genre'),
        createData('contentRating', 'App’s content rating as described on Play Store'),
        createData('inAppAdvertisements', 'Whether in app advertisements are supported'),
        createData('originalReleaseDate', 'App’s initial release date'),
        createData('currentAppVersion', 'Current app version'),
        createData('currentVersionChanges', 'Release notes from latest app update'),
        createData('dateScraped', 'Timestamp, date from when this app data was scraped')
      ]
    const reviewRows = [
        createData('reviewID', 'Review’s unique ID registered with the Play Store'),
        createData('dateReviewed', 'Date on which review was published'),
        createData('rating', 'App rating as given by review'),
        createData('reviewURL', 'Review’s Play Store URL'),
        createData('reviewText', 'Actual review text'),
        createData('developerReplyDate', 'Date on which the developer replied to the review, if at all'),
        createData('developerReplyText', 'The actual developer reply to the posted review, if it exists'),
        createData('versionWhenReviewed', 'App’s version number at the time when the current review was published'),
        createData('helpfulVotes', 'Number of people that found this review helpful and upvoted it'),
        createData('dateScraped', 'Timestamp, date from when this review data was scraped')
      ]

    const MetadataTable = ({rows}) => {
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

    return (
        <Container>
            <Typography variant="h4" className="main-header">User Guide</Typography>

            <Typography variant="h4" className="section-header">Contents</Typography>
            
            <Link href="#SMAR_Background" variant="inherit" color="inherit" underline="hover">
                <Typography variant="h6">SMAR Background</Typography>
            </Link>
            
            <Link href="#SMAR_Study" variant="inherit" color="inherit" underline="hover">
                <Typography variant="body1" className="toc-first-subitem">What is a SMAR Study?</Typography>
            </Link>
            
            <Link href="#Why_SMAR" variant="inherit" color="inherit" underline="hover">
                <Typography variant="body1" className="toc-last-subitem">Why would I want to conduct an SMAR?</Typography>
            </Link>
            
            <Link href="#SMAR_Tool_Usage" variant="inherit" color="inherit" underline="hover">
                <Typography variant="h6">SMAR Tool Usage</Typography>
            </Link>
            
            <Link href="#Keyword_Search" variant="inherit" color="inherit" underline="hover">
                <Typography variant="body1" className="toc-only-subitem">Conducting a Keyword Search</Typography>
            </Link>
                
            <Link href="#SMAR_Metadata_Breakdown" variant="inherit" color="inherit" underline="hover">
                <Typography variant="h6">SMAR Metadata Breakdown</Typography>
            </Link>
            
            <Link href="#App_Metadata" variant="inherit" color="inherit" underline="hover">
                <Typography variant="body1" className="toc-first-subitem">App Metadata</Typography>
            </Link>
            
            <Link href="#Review_Metadata" variant="inherit" color="inherit" underline="hover">
                <Typography variant="body1" className="toc-last-subitem">Review Metadata</Typography>
            </Link>
            
            <Link href="#References" variant="inherit" color="inherit" underline="hover">
                <Typography variant="h6">References</Typography>
            </Link>
            

            <br/>
            <Divider variant="li" />
            <br/>
            <br/>

            <Typography variant="h4" className="section-header" id="SMAR_Background">SMAR Background</Typography>

            <Typography variant="h5" className="section-sub-header" id="SMAR_Study">What is a SMAR study?</Typography>
            <Typography variant="body1" className="main-text">An SMAR (systematic app review) can be generally classified 
                as a search and subsequent analysis of applications that meet certain criteria across 
                a set of mobile app stores. Search criteria can include keywords, download count, and 
                other information available in the corresponding app's store page. The search results 
                from the SMAR include large-scale app metadata - such as user reviews and app permissions 
                - as well as app contents such as functionality or accessibility.
            </Typography>
            <Typography variant="body1" className="main-text">
                The general steps of an SMAR can be classified as follows:
            </Typography>
            <Typography variant="body1" className="main-text">
                First, the researcher plans the topic, scope, and timeline of their app review. Second, they select a corpus 
                of mobile apps. Third, they extract data for analysis, e.g., user reviews or app files. Fourth, 
                they analyze their data, using either qualitative, quantitative, or automated analysis. Fifth, 
                they report their method and findings.
            </Typography>

            <Box display="flex" justifyContent="center" alignItems="center">
                <img src={require('../res/SMAR_Steps.png')} className="inline-image-nb" alt="SMAR steps"/>
            </Box>

            <Typography variant="h5" className="section-sub-header" id="Why_SMAR">Why would I want to conduct an SMAR?</Typography>
            <Typography variant="body1" className="main-text">
                Conducting an SMAR is a valuable way for researchers to quickly yet effectively collect targeted mobile 
                application data at scale. This is the starting point for many research studies aiming to analyze a 
                subset of the existing catalog of millions of mobile applications across different platforms.
            </Typography>
            <Typography variant="body1" className="main-text">
                The SMAR method has been used in many fields. In the field of HCI (Human-Computer Interaction), researchers 
                have studied how children perceive parental control apps [1,5,8], user reviews of mental health apps [6], 
                dark patterns in Japanese apps [7], and missing label accessibility failures in Android apps [4]. In health, 
                researchers have examined apps for child development [3], support functions in pain management apps [2], and 
                menstrual tracking apps [9]. All of these studies started with a systematic search of app store(s).
            </Typography>
            <Typography variant="body1" className="main-text">
                Existing SMAR tools are either paid products targeted towards commercial developers, or free tools that 
                require technical expertise to get up and running. Our free SMAR tool aims to provide a flexible feature 
                set and intuitive interface to enable researchers of all backgrounds to quickly yet effectively conduct SMAR's.
            </Typography>

            <br/><br/>
            <Divider variant="li" />
            <br/><br/>

            <Typography variant="h4" className="section-header" id="SMAR_Tool_Usage">SMAR Tool Usage</Typography>

            <Typography variant="h5" className="section-sub-header" id="Keyword_Search">Conducting a Keyword Search</Typography>
            <Typography variant="body1" className="main-text">
                The SMAR Tool is designed around the central search bar that allows 
                users to quickly retrieve a filtered list of applications from the Google Play Store. 
            </Typography>
            <Typography variant="body1" className="main-text">
                <b>1.</b> To get started, type in a search keyword (1). Optionally, check the 'Include permissions in scrape' button a) 
                to also retrieve individual app permissions (such as microphone or camera access). Click on the 'Scrape Data'  button 
                (2) to begin the search process.
            </Typography>
                <Box display="flex" justifyContent="center" alignItems="center">
                    <img src={require('../res/SMAR_Search_Screen.png')} className="inline-image" alt="SMAR steps" />
                </Box>
                <br/><br/>
            <Typography variant="body1" className="main-text">
                <b>2.</b> Now a dialog box will appear with the following message: “Scraping data for *your keyword* ”. This will take 
                a few minutes to complete.
            </Typography>
                <Box display="flex" justifyContent="center" alignItems="center">
                    <img src={require('../res/SMAR_Searching_Dialog.png')} className="inline-image" alt="SMAR steps" />
                </Box>
                <br/><br/>
            {/* TODO - make a note about special characters and csv encoding */}
            <Typography variant="body1" className="main-text">
                <b>3.</b> Once the search has completed, a portion of the page will update with search results. A preview of the first 
                few results will be visible (3) and are horizontally scrollable, and the rest of the results can be downloaded by 
                clicking the button at the bottom of the page (4). Additionally, user reviews for each application can be scraped by 
                clicking the corresponding row's 'scrape reviews' button (5).
            </Typography>
                <Box display="flex" justifyContent="center" alignItems="center">
                    <img src={require('../res/SMAR_Results_Screen.png')} className="inline-image" alt="SMAR steps" />
                </Box>
                <br/><br/>
            <Typography variant="body1" className="main-text">
                <b>4.</b> To begin another search, repeat steps <b>1-3</b>.
            </Typography>

            <br/><br/>
            <Divider variant="li" />
            <br/><br/>

            <Typography variant="h4" className="section-header" id="SMAR_Metadata_Breakdown">SMAR Metadata Breakdown</Typography>
            
            <Typography variant="h5" className="section-sub-header" id="App_Metadata">App Metadata</Typography>
            <br/>
            <MetadataTable rows={appRows}/>
            <br/><br/>

            <Typography variant="h5" className="section-sub-header" id="Review_Metadata">Review Metadata</Typography>
            <MetadataTable rows={reviewRows}/>

            <br/><br/><br/>
            <Divider variant="li" />
            <br/><br/>

            <Typography variant="h4" className="section-header" id="References">References</Typography>
            <br/>
            <Typography variant="body1" className="refs">
                [1] Turki Alelyani, Arup Kumar Ghosh, Larry Moralez, Shion Guha, and Pamela Wisniewski. 2019. Examining Parent Versus Child Reviews of Parental Control Apps on Google Play. In Social Computing and Social Media. Communication and Social Communities, 3–21. hps://doi.org/10.1007/978-3-030-21905-5_1 
            </Typography>
            <br/>
            <Typography variant="body1" className="refs">
                [2] Hemakumar Devan, Devin Farmery, Lucy Peebles, and Rebecca Grainger. 2019. Evaluation of Self-Management Support Functions in Apps for People With Persistent Pain: Systematic Review. JMIR mHealth and uHealth 7, 2: e13080. hps://doi.org/10.2196/13080 
            </Typography>
            <br/>
            <Typography variant="body1" className="refs">
                [3] Akeiylah DeWi, Julie Kien, and Kendra Liljenquist. 2022. Quality of Mobile Apps for Child Development Support: Search in App Stores and Content Analysis. JMIR pediatrics and parenting 5, 4: e38793. hps://doi.org/10.2196/38793 
            </Typography>
            <br/>
            <Typography variant="body1" className="refs">
                [4] Raymond Fok, Mingyuan Zhong, Anne Spencer Ross, James Fogarty, and Jacob O. Wobbrock. 2022. A Large-Scale Longitudinal Analysis of Missing Label Accessibility Failures in Android Apps. In Proceedings of the 2022 CHI Conference on Human Factors in Computing Systems (CHI ’22), 1–16. hps://doi.org/10.1145/3491102.3502143 
            </Typography>
            <br/>
            <Typography variant="body1" className="refs">
                [5] Arup Kumar Ghosh, Karla Badillo-Urquiola, Shion Guha, Joseph J. LaViola Jr, and Pamela J. Wisniewski. 2018. Safety vs. Surveillance: What Children Have to Say about Mobile Apps for Parental Control. In Proceedings of the 2018 CHI Conference on Human Factors in Computing Systems (CHI ’18), 1–14. hps://doi.org/10.1145/3173574.3173698 
            </Typography>
            <br/>
            <Typography variant="body1" className="refs">
                [6] M. R. Haque and S. Rubya. 2022. “ For an app supposed to make its users feel beer, it sure is a joke”-an analysis of user reviews of mobile mental health applications. Proceedings of the ACM on Human-Computer. Retrieved from hps://dl.acm.org/doi/abs/10.1145/3555146 
            </Typography>
            <br/>
            <Typography variant="body1" className="refs">
                [7] Shun Hidaka, Sota Kobuki, Mizuki Watanabe, and Katie Seaborn. 2023. Linguistic Dead-Ends and Alphabet Soup: Finding Dark Patterns in Japanese Apps. In Proceedings of the 2023 CHI Conference on Human Factors in Computing Systems (CHI ’23), 1–13. hps://doi.org/10.1145/3544548.3580942  
            </Typography>
            <br/>
            <Typography variant="body1" className="refs">
                [8] P. Wisniewski, A. K. Ghosh, H. Xu, and M. B. Rosson. 2017. Parental Control vs. Teen Self-Regulation: Is there a middle ground for mobile online safety? Proceedings of the. Retrieved from hps://dl.acm.org/citation.cfm?id=2998352 
            </Typography>
            <br/>
            <Typography variant="body1" className="refs">
                [9] Rhonda Zwingerman, Michael Chaikof, and Claire Jones. 2020. A Critical Appraisal of Fertility and Menstrual Tracking Apps for the iPhone. Journal of obstetrics and gynaecology Canada: JOGC = Journal d’obstetrique et gynecologie du Canada: JOGC 42, 5: 583–590. hps://doi.org/10.1016/j.jogc.2019.09.023
            </Typography>

            <Footer />
            <br/>
        </Container>
    );
}

export default UserGuide;