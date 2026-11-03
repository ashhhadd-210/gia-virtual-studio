import { lazy, Suspense } from 'react';
import { Routes, Route, useLocation } from 'react-router-dom';
import HomePage from './pages/HomePage';
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
import LicenseGate from './components/LicenseGate';

// Lazy-load the Babylon-heavy showroom so its ~3 MB engine chunk only downloads
// when the user actually enters /studio — every other page loads instantly.
const StudioPage = lazy(() => import('./pages/StudioPage'));


function App() {
  // The /studio route is a full-screen immersive 3D experience — no site
  // footer (and chat panel docked at viewport edge). The global Footer was
  // appending below the canvas, making the page scrollable and pushing the
  // chat panel's bottom-pinned input below the document fold when the user
  // scrolled. Suppress the footer on /studio entirely.
  const location = useLocation();
  const isStudio = location.pathname.startsWith('/studio');

  return (
    <>
      <Navbar />
      <ScrollToTop />
      <Suspense fallback={<div style={{ minHeight: "100dvh", background: "#05070d" }} />}>
      <Routes>
        {/* <Route path="/" element={<HomePage />} /> */}
        <Route path="/" element={<ExplorePage />} />
        <Route path="/auth" element={<Auth />} />
        {/* Studio is the main deliverable — gated behind LicenseGate until the
            developer flips RELEASED=true in src/components/LicenseGate.jsx
            after final payment / delivery acceptance. Marketing pages stay
            open so the client can still preview the public surface. */}
        <Route path="/studio" element={<LicenseGate><StudioPage /></LicenseGate>} />
        <Route path="/blog" element={<Blog />} />
             {/* <Route path="/blog/:id" element={<BlogPost />} /> */}
        {/* <Route path="/login" element={<Login />} /> */}
        <Route path="/admin/dashboard" element={<AdminDashboard />} />
        <Route path="/pricing" element={<Pricing />} />
        <Route path="/user/dashboard" element={<UserDashboard />} />
        <Route path="/pricing/success" element={<PricingSuccess />} />

      </Routes>
      </Suspense>
      {!isStudio && <Footer />}
    </>
  );
}

export default App;