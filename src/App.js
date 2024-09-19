import './css/App.css';
import { Routes, Route } from 'react-router-dom';
import Home from './pages/Home';
import About from './pages/About'; 
import Citation from './pages/Citation';
import NavigationBar from './components/NavigationBar';
import UserGuide from './pages/UserGuide';

function App() {
  return (
    <div >
      <NavigationBar />
      <Routes className="App">
        <Route path="/" element={<Home />} />
        <Route path="/about" element={<About />} />
        <Route path="/citation" element={<Citation />} />
        <Route path="/userguide" element={<UserGuide />} />
      </Routes>
    </div>
  );
}

export default App;
