import './css/App.css';
import { Routes, Route } from 'react-router-dom';
import Home from './pages/Home';
import About from './pages/About'; 
import Citation from './pages/Citation';
import NavigationBar from './components/NavigationBar';


function App() {
  return (
    <div >
      <NavigationBar />
      <Routes className="App">
        <Route path="/" element={<Home />} />
        <Route path="/citation" element={<Citation />} />
      </Routes>
    </div>
  );
}
 // can add between home and citation: <Route path="/about" element={<About />} />
export default App;
