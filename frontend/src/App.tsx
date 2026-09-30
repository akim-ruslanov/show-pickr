import { Routes, Route } from 'react-router-dom';
import Home from './pages/Home';
import SessionPage from './pages/Session';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/s/:code" element={<SessionPage />} />
    </Routes>
  );
}
