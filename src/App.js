import './css/App.css';
import { Routes, Route } from 'react-router-dom';
import Home from './pages/Home';
import About from './pages/About'; 
import NavigationBar from './components/NavigationBar';


function App() {
  return (
    <div >
      <NavigationBar />
      <Routes className="App">
        <Route path="/" element={<Home />} />
        <Route path="/about" element={<About />} />
      </Routes>
    </div>
  );
}

export default App;
