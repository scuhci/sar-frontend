import React from 'react';
import {
    Typography, Container, Alert, Button, Stack, Link, Box,
    Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper, Chip,
    Card, CardContent,
} from '@mui/material';
import { Download, GitHub } from '@mui/icons-material';
import Footer from '../components/Footer';
import "../css/About.css";

const GITHUB_DOCS_URL = 'https://github.com/scuhci/sar-frontend/tree/production/agent-skills';
const FEEDBACK_URL = 'https://github.com/scuhci/sar-frontend/issues';
const PLAYSTORE_SKILL_URL = '/agent-skills/smar-playstore-agent.skill';
const APPSTORE_SKILL_URL = '/agent-skills/smar-appstore-agent.skill';

const versions = [
    {
        key: 'full',
        title: 'Full skills (Google Play + App Store)',
        bullets: [
            'Keyword search with similar apps, app ID lookup, country selection, top charts, and single and bulk reviews, for both stores.',
            'Scripts run on your computer (Claude Code with Node 18+), or in the bundled browser mode in Claude.ai and Claude in Chrome. App Store keyword search still needs a terminal.',
            'Every value is cross-checked against a second source; cells that cannot be verified are left blank and flagged. Progress is saved, so long runs can resume.',
            'Stress-tested (45 issues fixed) and benchmarked against SMAR\'s scraper with 0 wrong values.',
        ],
        bestFor: 'research data collection, larger runs, the App Store, and reproducibility.',
        downloads: [
            { label: 'Google Play skill (v3.1.0)', href: PLAYSTORE_SKILL_URL },
            { label: 'App Store skill (v2.1.0)', href: APPSTORE_SKILL_URL },
        ],
    },
    {
        key: 'chrome',
        title: 'Chrome-only skills (Google Play, no install)',
        bullets: [
            'Google Play keyword search with similar apps, top charts, and bulk reviews.',
            'Nothing to install: Claude in Chrome pastes one extractor into a play.google.com tab and downloads the CSV. A keyword search took about 23 to 53 seconds in our tests.',
            'Cell values matched SMAR on normal data in our benchmark. Fewer columns are cross-checked, so an unexpected store format change is less likely to be caught.',
            'No resume (reloading the tab loses the run), similar-app lists can include more apps than SMAR\'s, and testing was mainly on US runs.',
        ],
        bestFor: 'quick exploratory pulls and users without a terminal. We recommend checking important results with the full skills.',
        downloads: [
            { label: 'Keyword search', href: '/agent-skills/chrome-only/smar-playstore-keyword-search.skill' },
            { label: 'Top charts', href: '/agent-skills/chrome-only/smar-playstore-top-charts.skill' },
            { label: 'Bulk reviews', href: '/agent-skills/chrome-only/smar-playstore-bulk-reviews.skill' },
        ],
    },
];

const comparisonRows = [
    { label: 'Stores', full: 'Google Play and App Store', chrome: 'Google Play only' },
    { label: 'Features', full: 'Keyword search, similar apps, app ID lookup, country selection, top charts, reviews, bulk reviews', chrome: 'Keyword search, similar apps, top charts, bulk reviews' },
    { label: 'Install', full: 'Claude Code (Node 18+) or upload to Claude.ai', chrome: 'Upload to Claude.ai; needs Claude in Chrome' },
    { label: 'Where it runs', full: 'Your computer, or browser mode in Claude in Chrome', chrome: 'A play.google.com tab in Chrome' },
    { label: 'Speed', full: 'Depends on run size; built for larger runs', chrome: 'Fast (keyword search about 23 to 53 seconds)' },
    { label: 'Checking', full: 'Every value cross-checked; unverifiable cells blanked and flagged', chrome: 'Lighter: fewer columns cross-checked' },
    { label: 'Resume', full: 'Yes, saves progress', chrome: 'No, reloading the tab loses the run' },
    { label: 'Best for', full: 'Research data, larger runs, App Store, reproducibility', chrome: 'Quick exploratory pulls, no terminal' },
];

const supportRows = [
    {
        status: 'Supported',
        color: 'success',
        items: [
            'Keyword search, including similar apps',
            'App ID lookup',
            'Country selection',
            'Top charts',
            'Reviews and bulk reviews',
            'CSV output in SMAR format',
            'Both Google Play and the App Store (App Store keyword search needs a terminal)',
        ],
    },
    {
        status: 'Partial',
        color: 'warning',
        items: [
            'Reproducibility log',
            'Results preview',
            'Top charts reviews and zipped download',
        ],
    },
    {
        status: 'Not yet supported',
        color: 'default',
        items: [
            'Permissions columns',
            'Email when done',
        ],
    },
];

const sectionSx = { marginTop: 4, marginBottom: 2 };

const AgentSkills = () => {
    return (
        <Container sx={{ marginTop: 7 }} maxWidth="md">
            <div className="app-container">
                <div className="content">
                    <Typography variant="h3" className="about-header">Agent Skills</Typography>

                    <Alert severity="info" sx={{ marginBottom: 3 }}>
                        <strong>Experimental.</strong> Agent Skills are a new, experimental way to use SMAR.
                        We are actively looking for feedback from researchers and developers.
                    </Alert>

                    <Typography variant="body1" fontSize="20px" className="about-text">
                        Agent Skills let you run SMAR's scraping with your own AI agent. They were built and
                        tested with Claude (Claude Code, Claude.ai, and Claude in Chrome) and produce CSV files in
                        the same format as this site. The data values come from scripts that cross-check each
                        value; they are never typed by the AI. Anything that cannot be verified is left blank and
                        flagged. The SMAR website remains the main way to use SMAR; the skills are an alternative
                        for people who already use an AI agent, or who want to go beyond the site's limits.
                    </Typography>

                    <Typography variant="h5" sx={sectionSx}>Two versions</Typography>
                    <Typography variant="body1" className="about-text">
                        There are two versions of the skills. Both produce CSV files in SMAR's format.
                    </Typography>
                    <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} useFlexGap sx={{ marginTop: 2, alignItems: 'stretch' }}>
                        {versions.map((v) => (
                            <Card key={v.key} variant="outlined" sx={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                                <CardContent sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
                                    <Typography variant="h6" gutterBottom>{v.title}</Typography>
                                    <Box component="ul" sx={{ margin: 0, paddingLeft: 2.5, '& li': { marginBottom: 1 } }}>
                                        {v.bullets.map((b) => (
                                            <li key={b}><Typography variant="body2">{b}</Typography></li>
                                        ))}
                                    </Box>
                                    <Typography variant="body2" sx={{ marginTop: 1, marginBottom: 2 }}>
                                        <strong>Best for:</strong> {v.bestFor}
                                    </Typography>
                                    <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap', marginTop: 'auto' }}>
                                        {v.downloads.map((d) => (
                                            <Button key={d.href} variant="contained" size="small" startIcon={<Download />} href={d.href} download>
                                                {d.label}
                                            </Button>
                                        ))}
                                    </Stack>
                                </CardContent>
                            </Card>
                        ))}
                    </Stack>

                    <Typography variant="h5" sx={sectionSx}>Which version should I use?</Typography>
                    <TableContainer component={Paper}>
                        <Table size="small" aria-label="Comparison of the two skill versions">
                            <TableHead>
                                <TableRow>
                                    <TableCell sx={{ width: 130 }} />
                                    <TableCell><b>Full skills</b></TableCell>
                                    <TableCell><b>Chrome-only skills</b></TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {comparisonRows.map((row) => (
                                    <TableRow key={row.label} sx={{ '&:last-child td, &:last-child th': { border: 0 } }}>
                                        <TableCell component="th" scope="row" sx={{ verticalAlign: 'top' }}><b>{row.label}</b></TableCell>
                                        <TableCell sx={{ verticalAlign: 'top' }}>{row.full}</TableCell>
                                        <TableCell sx={{ verticalAlign: 'top' }}>{row.chrome}</TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </TableContainer>

                    <Typography variant="h5" sx={sectionSx}>What's supported (full skills)</Typography>
                    <Typography variant="body2" sx={{ marginBottom: 2 }}>
                        The Chrome-only skills cover Google Play keyword search (with similar apps), top charts and
                        bulk reviews.
                    </Typography>
                    <TableContainer component={Paper}>
                        <Table aria-label="Full skills feature support">
                            <TableHead>
                                <TableRow>
                                    <TableCell sx={{ width: 180 }}><b>Status</b></TableCell>
                                    <TableCell><b>Features</b></TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {supportRows.map((row) => (
                                    <TableRow key={row.status} sx={{ '&:last-child td, &:last-child th': { border: 0 } }}>
                                        <TableCell component="th" scope="row" sx={{ verticalAlign: 'top' }}>
                                            <Chip label={row.status} color={row.color} size="small" />
                                        </TableCell>
                                        <TableCell>
                                            <Box component="ul" sx={{ margin: 0, paddingLeft: 2.5 }}>
                                                {row.items.map((item) => (
                                                    <li key={item}><Typography variant="body2">{item}</Typography></li>
                                                ))}
                                            </Box>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </TableContainer>

                    <Typography variant="h5" sx={sectionSx}>Quick start</Typography>
                    <Box component="ol" sx={{ paddingLeft: 3, '& li': { marginBottom: 1.5 } }}>
                        <li>
                            <Typography variant="body1">
                                <strong>Download</strong> a version using the buttons above: a full skill for the store you want to study, or one or more Chrome-only skills.
                            </Typography>
                        </li>
                        <li>
                            <Typography variant="body1">
                                <strong>Install</strong> it. Full skills: in Claude Code, unzip the file into <code>~/.claude/skills/</code>,
                                or in Claude.ai go to Settings &gt; Capabilities &gt; Skills and choose Upload skill.
                                Chrome-only skills: upload each file the same way in Claude.ai, install the Claude in Chrome
                                extension, and open play.google.com.
                            </Typography>
                        </li>
                        <li>
                            <Typography variant="body1">
                                <strong>Ask</strong> in plain English, for example: "Keyword search the US Play Store for meditation apps in SMAR format".
                            </Typography>
                        </li>
                    </Box>

                    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} useFlexGap sx={{ flexWrap: 'wrap' }}>
                        <Button
                            variant="outlined"
                            startIcon={<GitHub />}
                            href={GITHUB_DOCS_URL}
                            target="_blank"
                            rel="noopener noreferrer"
                        >
                            Documentation and source on GitHub
                        </Button>
                    </Stack>

                    <Typography variant="h5" sx={sectionSx}>Feedback</Typography>
                    <Typography variant="body1" className="about-text">
                        Found a problem or have a suggestion? Please{' '}
                        <Link href={FEEDBACK_URL} target="_blank" rel="noopener noreferrer">
                            open an issue on GitHub
                        </Link>
                        . Your feedback helps us decide what to support next.
                    </Typography>
                </div>
                <Footer />
            </div>
            <br />
        </Container>
    );
};

export default AgentSkills;
