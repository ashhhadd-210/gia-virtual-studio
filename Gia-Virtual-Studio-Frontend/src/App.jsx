import { Routes, Route } from 'react-router-dom';
import HomePage from './pages/HomePage';
import StudioPage from './pages/StudioPage';
import Navbar from './components/ui/Navbar';
import Footer from './components/ui/Footer';
import Blog from './pages/Blog';
import Auth from './pages/Auth';
import AdminDashboard from './pages/AdminDashboard';
import BlogPost from './pages/BlogPost';
import UserDashboard from './pages/UserDashboard';
import Pricing from './pages/Pricing';
import PricingSuccess from './pages/PricingSuccess';
import ScrollToTop from './components/ui/ScrollToTop';
import ExplorePage from './pages/ExplorePage';


function App() {

  return (
    <>
      <Navbar />
      <ScrollToTop />
      <Routes>
        {/* <Route path="/" element={<HomePage />} /> */}
        <Route path="/" element={<ExplorePage />} />
        <Route path="/auth" element={<Auth />} />
        <Route path="/studio" element={<StudioPage />} />
        <Route path="/blog" element={<Blog />} />
             {/* <Route path="/blog/:id" element={<BlogPost />} /> */}
        {/* <Route path="/login" element={<Login />} /> */}
        <Route path="/admin/dashboard" element={<AdminDashboard />} />
        <Route path="/pricing" element={<Pricing />} />
        <Route path="/user/dashboard" element={<UserDashboard />} />
        <Route path="/pricing/success" element={<PricingSuccess />} />
   
      </Routes>
      <Footer />
    </>
  );
}

export default App;