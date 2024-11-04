import './css/App.css';
import { Routes, Route } from 'react-router-dom';
import Home from './pages/Home';
import About from './pages/About'; 
import NavigationBar from './components/NavigationBar';
import UserGuide from './pages/UserGuide';

function App() {
  let curHomeState = 'HOMEPAGE'
  const refresh = () => {
    if (curHomeState === 'SEARCH_RESULTS') {
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

  return (
    <div >
      <NavigationBar refresh={refresh}/>
      <Routes className="App">
        <Route path="/" element={<Home flipState={flipState}/>} />
        <Route path="/citation" element={<Citation />} />
        <Route path="/userguide" element={<UserGuide />} />
        <Route path="/about" element={<About />} />
      </Routes>
    </div>
  );
}
 // can add between home and citation: <Route path="/about" element={<About />} />
export default App;
