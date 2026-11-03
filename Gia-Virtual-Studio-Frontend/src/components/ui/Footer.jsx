// import React from 'react';
// import { Link } from 'react-router-dom';
// import { 
//   FaTelegramPlane, 
//   FaDiscord, 
//   // FaXTwitter, 
//   FaInstagram, 
//   FaLinkedin, 
//   FaYoutube 
// } from 'react-icons/fa';
// import { FaXTwitter } from 'react-icons/fa6';


// export default function Footer() {
//   return (
//     <footer className="bg-[#132531] text-white py-16 px-8 font-mono">
//       <div className="max-w-6xl mx-auto">
//         {/* Logo & Title */}
//         <div className="flex flex-col items-center text-center mb-12">
//           <div className="w-20 h-20  flex items-center justify-center mb-4">
//             <img src='/img/logo.png' />
//           </div>
//           <h2 className="text-2xl font-medium mb-1">GIA Generative Intelligent Assembly</h2>
//           <p className="text-gray-400 text-lg">Intelligent Fashion at a Glance</p>
//         </div>

//         {/* Main Footer Content */}
//         <div className="grid grid-cols-1 md:grid-cols-3 gap-10 text-sm">
//           {/* Address */}
//           <div className='flex justify-center items-center flex-col'>
           
//             <div className="space-y-3 text-gray-300 flex justify-center items-start flex-col">
//             <h1 className="text-white mb-2 text-2xl">Address</h1>
//               <p className='text-[18px]'>68 Circular Road #02-01<br />Singapore 049422</p>
//               <p className='text-[18px]'>
//                 Plaza 2000 Building, 10<br />
//                 Floor, 50 Street, Panama 5,<br />
//                 Republic of Panama
//               </p>
//             </div>
//           </div>

//           {/* Company */}
//           <div className='flex justify-center pl-12 md:pl-0 items-start md:items-center flex-col'>
            
//             <div className="space-y-3 text-gray-300 flex justify-center items-start flex-col">
//             <h3 className="text-white mb-2 text-2xl">Company</h3>
//               {/* <a href="#" className="block hover:text-white transition-colors">About Us</a> */}
//               <p className="block hover:text-white transition-colors text-[18px]">Contact us</p>
//               <a href="mailto:contact@giafashion.io" className="block hover:text-white transition-colors text-[18px]">
//                 contact@giafashion.io
//               </a>
//             </div>
//           </div>

//           {/* Policies */}
//           <div className='flex justify-center pl-12 md:pl-0 items-start md:items-center flex-col'>
            
//             <div className="space-y-3 text-gray-300 flex justify-center items-start flex-col">
//             <h3 className="text-white mb-2 text-2xl">Policies</h3>
//             <Link to="/tokensaleterms" className="block hover:text-white transition-colors text-[18px]">Token Sale Terms </Link>
//             <Link to="/privacypolicy" className="block hover:text-white transition-colors text-[18px]">Token Sale Privacy Policy </Link>
//             <Link to="/disclosure" className="block hover:text-white transition-colors text-[18px]">Token Risk Disclosure</Link>
//             </div>
//           </div>
//         </div>

//         {/* Social Media Icons */}
//         <div className="flex justify-center gap-6 mt-12 mb-8">
//           <a href="https://t.me/GIAFashion_Official" target='_blank' className="w-11 h-11 rounded-full border border-gray-600 hover:border-white flex items-center justify-center transition-all hover:scale-110">
//             <FaTelegramPlane className="text-2xl" />
//           </a>
//           <a href="https://discord.com/invite/RbfumtVeAJ" target='_blank' className="w-11 h-11 rounded-full border border-gray-600 hover:border-white flex items-center justify-center transition-all hover:scale-110">
//             <FaDiscord className="text-2xl" />
//           </a>
//           <a href="https://x.com/GIAFashionAI" target='_blank' className="w-11 h-11 rounded-full border border-gray-600 hover:border-white flex items-center justify-center transition-all hover:scale-110">
//             <FaXTwitter className="text-2xl" />
//           </a>
//           <a href="https://www.instagram.com/gia_ai_fashion/" target='_blank' className="w-11 h-11 rounded-full border border-gray-600 hover:border-white flex items-center justify-center transition-all hover:scale-110">
//             <FaInstagram className="text-2xl" />
//           </a>
//           <a href="https://www.linkedin.com/company/gia-generative-intelligent-assembly/" target='_blank' className="w-11 h-11 rounded-full border border-gray-600 hover:border-white flex items-center justify-center transition-all hover:scale-110">
//             <FaLinkedin className="text-2xl" />
//           </a>
//           <a href="https://www.youtube.com/@GenerativeIntelligentAssembly" target='_blank' className="w-11 h-11 rounded-full border border-gray-600 hover:border-white flex items-center justify-center transition-all hover:scale-110">
//             <FaYoutube className="text-2xl" />
//           </a>
//         </div>

//         {/* Copyright */}
//         <div className="text-center text-white text-[18px]">
//           © 2026 GIA. All rights reserved
//         </div>
//       </div>
//     </footer>
//   );
// }

import React from 'react';
import { Link } from 'react-router-dom';
import { 
  FaTelegramPlane, 
  FaDiscord, 
  // FaXTwitter, 
  FaInstagram, 
  FaLinkedin, 
  FaYoutube 
} from 'react-icons/fa';
import { FaXTwitter } from 'react-icons/fa6';


export default function Footer() {
  return (
    <footer className="bg-[#132531] text-white py-16 px-8 font-mono border-t border-white">
      <div className="max-w-6xl mx-auto">
        {/* Logo & Title */}
        <div className="flex flex-col items-center text-center mb-12">
          <div className="w-20 h-20  flex items-center justify-center mb-4">
            <img src='/img/logo.png' />
          </div>
          <h2 className="text-2xl font-medium mb-1">GIA Generative Intelligent Assembly</h2>
          <p className="text-gray-400 text-lg">Intelligent Fashion at a Glance</p>
        </div>

        {/* Main Footer Content */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-10 text-sm">
          {/* Address */}
          <div className='flex justify-center items-center flex-col'>
           
            <div className="space-y-3 text-gray-300 flex justify-center items-start flex-col">
            <h1 className="text-white mb-2 text-2xl">Address</h1>
              <p className='text-[18px]'>68 Circular Road #02-01<br />Singapore 049422</p>
              <p className='text-[18px]'>
                Plaza 2000 Building, 10<br />
                Floor, 50 Street, Panama 5,<br />
                Republic of Panama
              </p>
            </div>
          </div>

          {/* Company */}
          <div className='flex justify-center pl-12 md:pl-0 items-start md:items-center flex-col'>
            
            <div className="space-y-3 text-gray-300 flex justify-center items-start flex-col">
            <h3 className="text-white mb-2 text-2xl">Company</h3>
              {/* <a href="#" className="block hover:text-white transition-colors">About Us</a> */}
              <p className="block hover:text-white transition-colors text-[18px]">Contact us</p>
              <a href="mailto:contact@giafashion.io" className="block hover:text-white transition-colors text-[18px]">
                contact@giafashion.io
              </a>
            </div>
          </div>

          {/* Policies */}
          <div className='flex justify-center pl-12 md:pl-0 items-start md:items-center flex-col'>
            
            <div className="space-y-3 text-gray-300 flex justify-center items-start flex-col">
            <h3 className="text-white mb-2 text-2xl">Policies</h3>
            <Link to="/tokensaleterms" className="block hover:text-white transition-colors text-[18px]">Token Sale Terms </Link>
            <Link to="/privacypolicy" className="block hover:text-white transition-colors text-[18px]">Token Sale Privacy Policy </Link>
            <Link to="/disclosure" className="block hover:text-white transition-colors text-[18px]">Token Risk Disclosure</Link>
            </div>
          </div>
        </div>

        {/* Social Media Icons */}
        <div className="flex justify-center gap-6 mt-12 mb-8">
          <a href="https://t.me/GIAFashion_Official" target='_blank' className="w-11 h-11 rounded-full border border-gray-600 hover:border-white flex items-center justify-center transition-all hover:scale-110">
            <FaTelegramPlane className="text-2xl" />
          </a>
          <a href="https://discord.com/invite/RbfumtVeAJ" target='_blank' className="w-11 h-11 rounded-full border border-gray-600 hover:border-white flex items-center justify-center transition-all hover:scale-110">
            <FaDiscord className="text-2xl" />
          </a>
          <a href="https://x.com/GIAFashionAI" target='_blank' className="w-11 h-11 rounded-full border border-gray-600 hover:border-white flex items-center justify-center transition-all hover:scale-110">
            <FaXTwitter className="text-2xl" />
          </a>
          <a href="https://www.instagram.com/gia_ai_fashion/" target='_blank' className="w-11 h-11 rounded-full border border-gray-600 hover:border-white flex items-center justify-center transition-all hover:scale-110">
            <FaInstagram className="text-2xl" />
          </a>
          <a href="https://www.linkedin.com/company/gia-generative-intelligent-assembly/" target='_blank' className="w-11 h-11 rounded-full border border-gray-600 hover:border-white flex items-center justify-center transition-all hover:scale-110">
            <FaLinkedin className="text-2xl" />
          </a>
          <a href="https://www.youtube.com/@GenerativeIntelligentAssembly" target='_blank' className="w-11 h-11 rounded-full border border-gray-600 hover:border-white flex items-center justify-center transition-all hover:scale-110">
            <FaYoutube className="text-2xl" />
          </a>
        </div>

        {/* Copyright */}
        <div className="text-center text-white text-[18px]">
          © 2026 GIA. All rights reserved
        </div>
      </div>
    </footer>
  );
}

