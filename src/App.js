import "./css/App.css";
import { useState } from "react";
import { Routes, Route, useNavigate } from "react-router-dom";
import Home from "./pages/Home";
import About from "./pages/About";
import NavigationBar from "./components/NavigationBar";
import UserGuide from "./pages/UserGuide";
import TopCharts from "./pages/TopCharts";
import { ScraperProvider } from "./components/SelectedScraperProvider";

function App() {
    const navigate = useNavigate();

    const [showSearchResults, setShowSearchResults] = useState(false);

    const flipState = () => {
        if (!showSearchResults) setShowSearchResults(true);
    };

    const refresh = () => {
        if (showSearchResults) window.location.reload();
    };

    const refreshTopLists = () => {
        navigate("/toplists", { state: { selectedScraper: "Play Store" } });
        refresh();
    };

    return (
        <ScraperProvider>
            <div>
                <NavigationBar
                    refresh={refresh}
                    refreshTopLists={refreshTopLists}
                />
                <Routes className="App">
                    <Route path="/" element={<Home flipState={flipState} />} />
                    <Route
                        path="/toplists"
                        element={<TopCharts flipState={flipState} />}
                    />
                    <Route path="/userguide" element={<UserGuide />} />
                    <Route path="/about" element={<About />} />
                </Routes>
            </div>
        </ScraperProvider>
    );
}
// can add between home and citation: <Route path="/about" element={<About />} />
export default App;
