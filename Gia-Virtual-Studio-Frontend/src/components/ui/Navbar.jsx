// import { useState } from "react";
// import { Link, useNavigate } from "react-router-dom";
// import { Menu, X, LogOut, Shield, User } from "lucide-react";
// import { useAuth } from "../../Context/AuthContext"; // adjust path as needed

// export default function Navbar() {
//   const [isOpen, setIsOpen] = useState(false);
//   const navigate = useNavigate();

//   // Get auth state from context
//   const { isLoggedIn, isAdmin, logout, user } = useAuth();

//   const handleLogout = () => {
//     logout();
//     navigate("/auth");
//     setIsOpen(false);
//   };

//   return (
//     <>
//       <nav className="fixed inset-x-0 top-0 z-50 border-b border-red-900/30 bg-slate-950/70 backdrop-blur-2xl">
//         <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          
//           {/* Logo */}
//           <Link to="/" className="flex items-center gap-3 hover:opacity-90 transition-all">
//             <img src="/img/logo.png" alt="GIA Logo" className="w-10 h-10" />
//           </Link>

//           {/* Desktop Navigation */}
//           <div className="hidden md:flex items-center gap-10">
//             <Link
//               to="/"
//               className="text-sm font-medium text-slate-400 hover:text-white transition-all duration-200"
//             >
//               Home
//             </Link>

//             <Link
//               to="/blog"
//               className="text-sm font-medium text-slate-400 hover:text-white transition-all duration-200"
//             >
//               AI Blog
//             </Link>

//             <Link
//               to="/studio"
//               className="text-sm font-medium text-slate-400 hover:text-white transition-all duration-200"
//             >
//               Virtual Showroom
//             </Link>
//           </div>

//           {/* Right Side */}
//           <div className="flex items-center gap-4">
//             {isLoggedIn ? (
//               <div className="flex items-center gap-3">

//                 {/* User Name */}
//                 <span className="hidden md:block text-sm text-slate-300">
//                   Hi, {user?.firstName}
//                 </span>

//                 <Link
//                   to="/user/dashboard"
//                   className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 border border-slate-700
//                              hover:border-slate-600 px-5 py-2.5 rounded-full text-sm font-medium
//                              text-slate-300 text-white transition-all duration-200 active:scale-95"
//                 >
//                   <User size={18} />
//                   Dashboard
//                 </Link>

//                 {/* Admin Panel */}
//                 {isAdmin && (
//                   <Link
//                     to="/admin/dashboard"
//                     className="flex items-center gap-2 bg-gradient-to-r from-red-600 to-pink-600 hover:from-red-500 hover:to-pink-500 
//                                text-white px-5 py-2.5 rounded-full text-sm font-medium transition-all duration-200 
//                                shadow-lg shadow-red-900/30 active:scale-95"
//                   >
//                     <Shield size={18} />
//                     Admin Panel
//                   </Link>
//                 )}

//                 {/* Logout */}
//                 <button
//                   onClick={handleLogout}
//                   className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 
//                              hover:border-slate-600 px-5 py-2.5 rounded-full text-sm font-medium 
//                              text-slate-300 hover:text-white transition-all duration-200 active:scale-95"
//                 >
//                   <LogOut size={18} />
//                   Logout
//                 </button>
//               </div>
//             ) : (
//               <Link
//                 to="/auth"
//                 className="flex items-center gap-2 px-6 py-2.5 rounded-full text-sm font-semibold 
//                            border border-white text-white backdrop-blur-md bg-white/10 
//                            hover:bg-white hover:text-black transition-all duration-200 active:scale-95"
//               >
//                 Sign In
//               </Link>
//             )}

//             {/* Mobile Menu Button */}
//             <button
//               onClick={() => setIsOpen(!isOpen)}
//               className="md:hidden p-2 text-slate-300 hover:text-white transition-colors"
//             >
//               {isOpen ? <X size={28} /> : <Menu size={28} />}
//             </button>
//           </div>
//         </div>

//         {/* Mobile Menu */}
//         <div
//           className={`md:hidden overflow-hidden transition-all duration-300 ease-in-out 
//           ${isOpen ? "max-h-[420px] opacity-100" : "max-h-0 opacity-0"}`}
//         >
//           <div className="px-6 pt-2 pb-8 bg-slate-950/90 border-t border-red-900/20">
//             <div className="flex flex-col gap-2">

//               <Link
//                 to="/"
//                 className="px-4 py-3 text-sm font-medium text-slate-300 hover:text-white hover:bg-slate-800/50 rounded-xl transition-all"
//                 onClick={() => setIsOpen(false)}
//               >
//                 Home
//               </Link>

//               <Link
//                 to="/blog"
//                 className="px-4 py-3 text-sm font-medium text-slate-300 hover:text-white hover:bg-slate-800/50 rounded-xl transition-all"
//                 onClick={() => setIsOpen(false)}
//               >
//                 AI Blog
//               </Link>

//               <Link
//                 to="/studio"
//                 className="px-4 py-3 text-sm font-medium text-slate-300 hover:text-white hover:bg-slate-800/50 rounded-xl transition-all"
//                 onClick={() => setIsOpen(false)}
//               >
//                 Virtual Showroom
//               </Link>

//               {isLoggedIn && isAdmin && (
//                 <Link
//                   to="/admin/dashboard"
//                   className="px-4 py-3 text-sm font-medium text-red-400 hover:text-red-300 
//                              hover:bg-red-900/20 rounded-xl transition-all flex items-center gap-2"
//                   onClick={() => setIsOpen(false)}
//                 >
//                   <Shield size={20} />
//                   Admin Panel
//                 </Link>
//               )}

//               {isLoggedIn && (
//                 <button
//                   onClick={handleLogout}
//                   className="mt-4 w-full py-3 text-sm font-medium text-red-400 hover:text-red-300 
//                              hover:bg-red-900/30 rounded-xl border border-red-400/30 transition-all"
//                 >
//                   Logout
//                 </button>
//               )}
//             </div>
//           </div>
//         </div>
//       </nav>
//     </>
//   );
// }





import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Menu, X, LogOut, Shield, User } from "lucide-react";
import { useAuth } from "../../Context/AuthContext"; // adjust path as needed

export default function Navbar() {
  const [isOpen, setIsOpen] = useState(false);
  const navigate = useNavigate();

  // Get auth state from context
  const { isLoggedIn, isAdmin, logout, user } = useAuth();

  const handleLogout = () => {
    logout();
    navigate("/auth");
    setIsOpen(false);
  };

  return (
    <>
      <nav className="fixed inset-x-0 top-0 z-50 border-b border-red-900/30 bg-slate-950/70 backdrop-blur-2xl">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          
          {/* Logo */}
          <Link to="/" className="flex items-center gap-3 hover:opacity-90 transition-all">
            <img src="/img/logo.png" alt="GIA Logo" className="w-10 h-10" />
          </Link>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center gap-10">
           

            {/* <Link
              to="/"
              className="text-sm font-medium text-slate-400 hover:text-white transition-all duration-200"
            >
              Home
            </Link> */}
              <Link
              to="/studio"
              className="text-sm font-medium text-slate-400 hover:text-white transition-all duration-200"
            >
              Virtual Showroom
            </Link>
            <Link
              to="/blog"
              className="text-sm font-medium text-slate-400 hover:text-white transition-all duration-200"
            >
              AI Blog
            </Link>

            
          </div>

          {/* Right Side */}
          <div className="flex items-center gap-4">
            {isLoggedIn ? (
              <div className="flex items-center gap-3">

                {/* User Name */}
                <span className="hidden md:block text-sm text-slate-300">
                  Hi, {user?.firstName}
                </span>

                <Link
                  to="/user/dashboard"
                  className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 border border-slate-700
                             hover:border-slate-600 px-5 py-2.5 rounded-full text-sm font-medium
                             text-slate-300 text-white transition-all duration-200 active:scale-95"
                >
                  <User size={18} />
                  Dashboard
                </Link>

                {/* Admin Panel */}
                {isAdmin && (
                  <Link
                    to="/admin/dashboard"
                    className="flex items-center gap-2 bg-gradient-to-r from-red-600 to-pink-600 hover:from-red-500 hover:to-pink-500 
                               text-white px-5 py-2.5 rounded-full text-sm font-medium transition-all duration-200 
                               shadow-lg shadow-red-900/30 active:scale-95"
                  >
                    <Shield size={18} />
                    Admin Panel
                  </Link>
                )}

                {/* Logout */}
                <button
                  onClick={handleLogout}
                  className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 
                             hover:border-slate-600 px-5 py-2.5 rounded-full text-sm font-medium 
                             text-slate-300 hover:text-white transition-all duration-200 active:scale-95"
                >
                  <LogOut size={18} />
                  Logout
                </button>
              </div>
            ) : (
              <Link
                to="/auth"
                className="flex items-center gap-2 px-6 py-2.5 rounded-full text-sm font-semibold 
                           border border-white text-white backdrop-blur-md bg-white/10 
                           hover:bg-white hover:text-black transition-all duration-200 active:scale-95"
              >
                Sign In
              </Link>
            )}

            {/* Mobile Menu Button */}
            <button
              onClick={() => setIsOpen(!isOpen)}
              className="md:hidden p-2 text-slate-300 hover:text-white transition-colors"
            >
              {isOpen ? <X size={28} /> : <Menu size={28} />}
            </button>
          </div>
        </div>

        {/* Mobile Menu */}
        <div
          className={`md:hidden overflow-hidden transition-all duration-300 ease-in-out 
          ${isOpen ? "max-h-[420px] opacity-100" : "max-h-0 opacity-0"}`}
        >
          <div className="px-6 pt-2 pb-8 bg-slate-950/90 border-t border-red-900/20">
            <div className="flex flex-col gap-2">

              {/* <Link
                to="/"
                className="px-4 py-3 text-sm font-medium text-slate-300 hover:text-white hover:bg-slate-800/50 rounded-xl transition-all"
                onClick={() => setIsOpen(false)}
              >
                Home
              </Link> */}

               <Link
                to="/studio"
                className="px-4 py-3 text-sm font-medium text-slate-300 hover:text-white hover:bg-slate-800/50 rounded-xl transition-all"
                onClick={() => setIsOpen(false)}
              >
                Virtual Showroom
              </Link>


              <Link
                to="/blog"
                className="px-4 py-3 text-sm font-medium text-slate-300 hover:text-white hover:bg-slate-800/50 rounded-xl transition-all"
                onClick={() => setIsOpen(false)}
              >
                AI Blog
              </Link>

             

              {isLoggedIn && isAdmin && (
                <Link
                  to="/admin/dashboard"
                  className="px-4 py-3 text-sm font-medium text-red-400 hover:text-red-300 
                             hover:bg-red-900/20 rounded-xl transition-all flex items-center gap-2"
                  onClick={() => setIsOpen(false)}
                >
                  <Shield size={20} />
                  Admin Panel
                </Link>
              )}

              {isLoggedIn && (
                <button
                  onClick={handleLogout}
                  className="mt-4 w-full py-3 text-sm font-medium text-red-400 hover:text-red-300 
                             hover:bg-red-900/30 rounded-xl border border-red-400/30 transition-all"
                >
                  Logout
                </button>
              )}
            </div>
          </div>
        </div>
      </nav>
    </>
  );
}