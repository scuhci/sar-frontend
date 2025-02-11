import './css/App.css';
import { Routes, Route } from 'react-router-dom';
import Home from './pages/Home';
import About from './pages/About'; 
import NavigationBar from './components/NavigationBar';
import UserGuide from './pages/UserGuide';
import TopCharts from './pages/TopCharts';

function App() {
  let curHomeState = 'HOMEPAGE'
  let curTopListState = 'SEARCHPAGE'
  
  const refresh = () => {
    if (curHomeState === 'SEARCH_RESULTS') {
      window.location.reload()
    }
  }

  const refreshTopLists = () => {
    if (curTopListState === 'RESULTSPAGE') {
      window.location.reload()
    }
  }

  const flipState = () => {
    if (curHomeState === 'HOMEPAGE') {
      curHomeState = 'SEARCH_RESULTS'
    } else {
      curHomeState = 'HOMEPAGE'
    }
  }

  const flipTopListState = () => {
    if (curTopListState === 'SEARCHPAGE') {
      curTopListState = 'RESULTSPAGE'
    } else {
      curTopListState = 'SEARCHPAGE'
    }
  }

  return (
    <div >
      <NavigationBar refresh={refresh} refreshTopLists={refreshTopLists}/>
      <Routes className="App">
        <Route path="/" element={<Home flipState={flipState}/>} />
        <Route path="/toplists" element={<TopCharts flipState={flipTopListState}/>} />
        <Route path="/userguide" element={<UserGuide />} />
        <Route path="/about" element={<About />} />

      </Routes>
    </div>
  );
}
 // can add between home and citation: <Route path="/about" element={<About />} />
export default App;
