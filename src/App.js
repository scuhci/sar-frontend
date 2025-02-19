import "./css/App.css";
import { Routes, Route, useNavigate } from "react-router-dom";
import Home from "./pages/Home";
import About from "./pages/About";
import NavigationBar from "./components/NavigationBar";
import UserGuide from "./pages/UserGuide";
import TopCharts from "./pages/TopCharts";
import { ScraperProvider } from "./components/SelectedScraperProvider";

function App() {
    const navigate = useNavigate();

    let curHomeState = "HOMEPAGE";
    let curTopListState = "SEARCHPAGE";

    const refresh = () => {
        if (curHomeState === "SEARCH_RESULTS") {
            window.location.reload();
        }
    };

    const refreshTopLists = () => {
        navigate("/toplists", { state: { selectedScraper: "Play Store" } });
    };

    const flipState = () => {
        if (curHomeState === "HOMEPAGE") {
            curHomeState = "SEARCH_RESULTS";
        } else {
            curHomeState = "HOMEPAGE";
        }
    };

    const flipTopListState = () => {
        if (curTopListState === "SEARCHPAGE") {
            curTopListState = "RESULTSPAGE";
        } else {
            curTopListState = "SEARCHPAGE";
        }
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
                        element={<TopCharts flipState={flipTopListState} />}
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
