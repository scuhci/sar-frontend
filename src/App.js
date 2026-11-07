import "./css/App.css";
import { useState } from "react";
import { Routes, Route, useNavigate, useLocation } from "react-router-dom";
import { UAParser } from "ua-parser-js";
import Home from "./pages/Home";
import About from "./pages/About";
import NavigationBar from "./components/NavigationBar";
import MobileScreen from "./components/MobileScreen";
import UserGuide from "./pages/UserGuide";
import TopCharts from "./pages/TopCharts";
import { ScraperProvider } from "./components/SelectedScraperProvider";
import BulkReviews from "./pages/BulkReviews";
import AgentSkills from "./pages/AgentSkills";
// testing commit

function App() {
    const navigate = useNavigate();
    const location = useLocation();

    const [showSearchResults, setShowSearchResults] = useState(false);

    const userAgent = new UAParser().getDevice();
    const isMobileDevice = userAgent.type === 'mobile';
    const flipState = () => {
        if (!showSearchResults) setShowSearchResults(true);
    };

    // After a search, the nav buttons reload the page to clear it. Their onClick runs before the
    // surrounding NavLink navigates, and reload() reloads whatever URL is current, so navigate here
    // first and cancel the click so the NavLink does not push the same URL again. Modifier clicks
    // (open in a new tab) are left to the browser.
    const reloadAt = (event, to, options) => {
        if (event.button !== 0 || event.metaKey || event.altKey || event.ctrlKey || event.shiftKey) return;
        event.preventDefault();
        navigate(to, { ...options, replace: location.pathname === to });
        window.location.reload();
    };

    const refresh = (event) => {
        if (showSearchResults) reloadAt(event, "/");
    };

    const refreshTopLists = (event) => {
        if (showSearchResults) reloadAt(event, "/toplists", { state: { selectedScraper: "Play Store" } });
    };

    // Every route shows the mobile screen on a phone; the pages are desktop-only
    if (isMobileDevice) {
        return <MobileScreen />;
    }

    return (
        <ScraperProvider>
            <div>
                <NavigationBar refresh={refresh} refreshTopLists={refreshTopLists} />
                <Routes className="App">
                    <Route path="/" element={<Home flipState={flipState} />} />
                    <Route path="/toplists" element={<TopCharts flipState={flipState} />} />
                    <Route path="/userguide" element={<UserGuide />} />
                    <Route path="/bulkreviews" element={<BulkReviews flipState={flipState} />} />
                    <Route path="/agent-skills" element={<AgentSkills />} />
                    <Route path="/about" element={<About />} />
                </Routes>
            </div>
        </ScraperProvider>
    );
}
// can add between home and citation: <Route path="/about" element={<About />} />
export default App;
