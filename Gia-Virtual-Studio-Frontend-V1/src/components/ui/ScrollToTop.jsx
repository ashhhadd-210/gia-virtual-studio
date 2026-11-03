import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

export default function ScrollToTop() {
  const { pathname } = useLocation();

  useEffect(() => {
    // window.scrollTo(0, 0);        // instant scroll
    window.scrollTo({ top: 0, behavior: 'smooth' }); // if you want smooth
  }, [pathname]);

  return null; // This component renders nothing
}