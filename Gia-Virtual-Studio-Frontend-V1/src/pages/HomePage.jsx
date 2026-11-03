// import { useState } from 'react';
// import { Link } from 'react-router-dom';
// import { Sparkles, Users, Zap, TrendingUp, Award, ArrowRight, Play } from 'lucide-react';

// export default function HomePage() {
//   const [showVideo, setShowVideo] = useState(false);

//   return (
//     <div className="bg-slate-950 text-white overflow-hidden">
//       {/* HERO SECTION */}
//       <section className="min-h-screen relative flex items-center pt-20 font-mono">


//         <div className="max-w-7xl mx-auto px-4 md:px-6 grid md:grid-cols-2 gap-6 md:gap-16 items-center">
//           <div className="space-y-8">
//             <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-slate-700 bg-slate-900/60">
//               <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
//               <span className="text-xs font-medium tracking-widest text-emerald-400">AI-POWERED FASHION FUTURE</span>
//             </div>

//             <h1 className="text-6xl md:text-6xl font-bold tracking-tighter leading-none">
//               Fashion Reimagined<br />
//               by <span className=" bg-gradient-to-r from-indigo-400 via-purple-400 to-cyan-300 bg-clip-text text-transparent">Artificial Intelligence</span>
//             </h1>

//             <p className="text-lg text-slate-400 max-w-lg">
//               GIA fuses real-time fashion trends with intelligent memory and generative AI to create the next generation of fashion — every season, automatically.
//             </p>

//             <div className="flex flex-wrap gap-4">
//               <Link
//                 to="/studio"
//                 className="flex items-center gap-3 bg-white text-black px-8 py-4 rounded-2xl font-semibold hover:scale-105 transition-all group"
//               >
//                 Enter Virtual Showroom
//                 <ArrowRight className="group-hover:translate-x-1 transition" />
//               </Link>

//               <Link
//                 to="/blog"
//                 className="flex items-center gap-3 border border-slate-700 hover:border-white px-8 py-4 rounded-2xl font-medium transition-all"
//               >
//                 Read Blogs<ArrowRight className="group-hover:translate-x-1 transition" />
//               </Link>
//             </div>

//             <div className="flex items-center gap-3 md:gap-6 text-sm text-slate-500">
//               <div className='text-center'>Powered by Open AI</div>
//               <div className='text-center'>Closed-Loop Intelligence</div>
//               <div className='text-center'>150+ Designs per Collection</div>
//             </div>
//           </div>

//           {/* Hero Visual */}
//           <div className="relative hidden md:block">
//             <div className="aspect-square bg-gradient-to-br from-pink-500/10 via-violet-500/10 to-cyan-500/10 rounded-3xl overflow-hidden border border-slate-800">
//               <img
//                 src="/img/hero.jpg"
//                 alt="GIA AI Fashion"
//                 className="w-full h-full object-cover opacity-90"
//               />
//             </div>
//             <div className="absolute -bottom-6 -right-6 bg-slate-900 border border-slate-700 rounded-2xl p-6 shadow-2xl">
//               <div className="flex items-center gap-4">
//                 <div className="text-4xl font-bold text-emerald-400">150</div>
//                 <div className="text-sm leading-tight">
//                   Unique AI-generated<br />
//                   designs per collection
//                 </div>
//               </div>
//             </div>
//           </div>
//         </div>
//       </section>

//       {/* TRUST BAR */}
//       <div className="border-b border-slate-800 py-6 font-mono">
//         <div className="max-w-7xl mx-auto px-6 flex flex-wrap justify-center gap-x-12 gap-y-6 opacity-75">
//           <div className="flex items-center gap-3 text-slate-400 text-sm">
//             <span>Powered by</span>
//             <span className="font-semibold text-white">Open AI</span>
//           </div>
//           <div className="hidden md:flex items-center gap-3 text-slate-400 text-sm">
//             <span>Intelligent Memory with</span>
//             <span className="font-semibold text-white">RAG + Vector Search</span>
//           </div>
//           <div className="flex items-center gap-3 text-slate-400 text-sm">
//             <span>Multi-Agent System</span>
//           </div>
//         </div>
//       </div>

//       {/* HOW GIA WORKS - Closed Loop */}
//       <section className="py-24 bg-[#0A141F] font-mono">
//         <div className="max-w-7xl mx-auto px-6">
//           <div className="text-center mb-16">
//             <h2 className="text-5xl font-bold tracking-tighter mb-4">The Intelligent Fashion Loop</h2>
//             <p className="text-slate-400 max-w-2xl mx-auto">
//               Real trends → AI memory → Generative design → User feedback → Better designs. A self-improving fashion ecosystem.
//             </p>
//           </div>

//           <div className="grid md:grid-cols-3 gap-8">
//             {[
//               {
//                 icon: TrendingUp,
//                 title: "Trend Intelligence",
//                 desc: "Automated scraping from Vogue, Harper’s Bazaar & Pinterest + GPT trend extraction"
//               },
//               {
//                 icon: Sparkles,
//                 title: "AI Design Engine",
//                 desc: "Stability AI generates 150 unique designs per collection guided by intelligent memory"
//               },
//               {
//                 icon: Users,
//                 title: "Human Feedback Loop",
//                 desc: "Voting, liking, styling chats & proxy voting continuously train the next collection"
//               }
//             ].map((item, i) => (
//               <div key={i} className="bg-[#0E151D] border border-gray-400 rounded-3xl p-10 group hover:border-[#3f4870] transition-all">
//                 <item.icon className="w-12 h-12 text-[#798ad5] mb-6" />
//                 <h3 className="text-2xl font-semibold mb-4">{item.title}</h3>
//                 <p className="text-slate-400 leading-relaxed">{item.desc}</p>
//               </div>
//             ))}
//           </div>
//         </div>
//       </section>

//       {/* KEY FEATURES */}
//       <section className="relative py-24 font-mono overflow-hidden h-full md:h-[100vh]">
//         {/* Video Background */}
//         <video
//           autoPlay
//           loop
//           muted
//           playsInline
//           className="absolute inset-0 w-full h-full object-cover z-0 brightness-[0.4]"
//           style={{ pointerEvents: 'none' }}
//         >
//           <source src="/img/main-banner-1.mp4" type="video/mp4" />
//           {/* fallback message can go here */}
//         </video>
//         <div className="absolute inset-0 bg-gradient-to-b from-[#0A141F]/80 to-[#0A141F]/95 z-10 pointer-events-none" />

//         <div className="relative z-20 max-w-7xl mx-auto px-6">
//           <div className="text-center mb-16">
//             <h2 className="text-5xl font-bold tracking-tighter text-white drop-shadow-xl">Built for the Future of Fashion</h2>
//           </div>

//           <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
//             <div className="backdrop-blur-[10px] bg-white/10 border border-white/20 rounded-3xl p-10 hover:border-violet-500/30 transition-all group shadow-2xl shadow-violet-950/20">
//               <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center mb-8 shadow-lg shadow-fuchsia-700/20">
//                 <Award className="w-8 h-8 text-white drop-shadow" />
//               </div>
//               <h3 className="text-2xl font-semibold mb-3 text-white drop-shadow">Virtual Showroom</h3>
//               <p className="text-slate-200">Immersive 3D space showcasing AI-generated fashion. Vote, save, and interact with every piece.</p>
//               <Link to="/studio" className="mt-8 inline-flex items-center text-sm text-violet-300 hover:text-violet-100">
//                 Explore Showroom <ArrowRight className="ml-2" />
//               </Link>
//             </div>
//             <div className="backdrop-blur-[10px] bg-white/10 border border-white/20 rounded-3xl p-10 hover:border-pink-500/30 transition-all group shadow-2xl shadow-rose-950/20">
//               <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-pink-500 to-rose-500 flex items-center justify-center mb-8 shadow-lg shadow-pink-700/20">
//                 <Zap className="w-8 h-8 text-white drop-shadow" />
//               </div>
//               <h3 className="text-2xl font-semibold mb-3 text-white drop-shadow">AI Blog & Trends</h3>
//               <p className="text-slate-200">Daily curated fashion intelligence turned into beautiful editorial content by our Trend Curation Agent.</p>
//               <Link to="/blog" className="mt-8 inline-flex items-center text-sm text-pink-300 hover:text-pink-100">
//                 Read Latest Trends <ArrowRight className="ml-2" />
//               </Link>
//             </div>
//             <div className="backdrop-blur-[10px] bg-white/10 border border-white/20 rounded-3xl p-10 hover:border-cyan-400/30 transition-all group shadow-2xl shadow-cyan-950/20">
//               <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-cyan-500 to-teal-500 flex items-center justify-center mb-8 shadow-lg shadow-cyan-700/20">
//                 <Users className="w-8 h-8 text-white drop-shadow" />
//               </div>
//               <h3 className="text-2xl font-semibold mb-3 text-white drop-shadow">GSNowGPT Assistant</h3>
//               <p className="text-slate-200">Your personal AI styling companion. Get outfit recommendations, trend insights, and design feedback in real time.</p>
//               <div className="mt-8 text-sm text-cyan-300">Coming Soon • Premium Access</div>
//             </div>
//           </div>
//         </div>
//       </section>

//       {/* MULTI-AGENT SYSTEM */}
//       <section className="py-24 bg-[#0A141F] font-mono">
//         <div className="max-w-7xl mx-auto px-6">
//           <div className="max-w-3xl mx-auto text-center mb-16">
//             <h2 className="text-5xl font-bold tracking-tighter mb-4">10 Intelligent Agents Working Together</h2>
//             <p className="text-slate-400">A sophisticated multi-agent architecture that makes GIA truly self-improving.</p>
//           </div>

//           <div className="grid md:grid-cols-2 gap-6 text-sm">
//             <div className="bg-slate-950 border border-slate-800 p-8 rounded-3xl  hover:scale-105 transition-all">
//               <span className="text-emerald-400 font-mono text-xs tracking-widest">AGENT-1 • ON DEMAND</span>
//               <h4 className="text-xl font-semibold mt-4 mb-2">Styling Agent</h4>
//               <p className="text-slate-400">Gives personalized styling recommendations based on any design you're viewing.</p>
//             </div>
//             <div className="bg-slate-950 border border-slate-800 p-8 rounded-3xl  hover:scale-105 transition-all">
//               <span className="text-amber-400 font-mono text-xs tracking-widest">AGENT-2 • CRON</span>
//               <h4 className="text-xl font-semibold mt-4 mb-2">Trend Curation Agent</h4>
//               <p className="text-slate-400">Scrapes fashion publications and turns raw trends into structured data + editorial blogs.</p>
//             </div>
//             <div className="bg-slate-950 border border-slate-800 p-8 rounded-3xl  hover:scale-105 transition-all">
//               <span className="text-sky-400 font-mono text-xs tracking-widest">AGENT-7 • EVENT</span>
//               <h4 className="text-xl font-semibold mt-4 mb-2">Design Coordination Agent</h4>
//               <p className="text-slate-400">Orchestrates generation of 150 new designs using Stability AI powered by memory.</p>
//             </div>
//             <div className="bg-slate-950 border border-slate-800 p-8 rounded-3xl  hover:scale-105 transition-all">
//               <span className="text-rose-400 font-mono text-xs tracking-widest">AGENT-9 • CRON (Core)</span>
//               <h4 className="text-xl font-semibold mt-4 mb-2">Cycle Integrity Agent</h4>
//               <p className="text-slate-400">The brain of the system — ensures the entire closed loop runs correctly every cycle.</p>
//             </div>
//           </div>
//         </div>
//       </section>

//       {/* CALL TO ACTION - SHOWROOM */}
//       <section className="py-28 border-t border-b border-slate-800 bg-[#0A141F] font-mono">
//         <div className="max-w-4xl mx-auto text-center px-6">
//           <h2 className="text-5xl font-bold tracking-tighter mb-6">
//             Step into the Future<br className='hidden md:flex' /> of Fashion
//           </h2>
//           <p className="text-lg text-slate-400 mb-12">
//             Explore 150+ AI-generated designs in our immersive Virtual Showroom
//           </p>

//           <Link
//             to="/studio"
//             className="inline-flex bg-transparent items-center gap-4 border border-slate-700 hover:border-white text-white hover:text-black hover:bg-white  text-xl font-semibold 
//             px-6 md:px-16 py-6 rounded-3xl transition-all hover:scale-105 shadow-2xl"
//           >
//             Enter Virtual Showroom
//             <Sparkles className="w-7 h-7" />
//           </Link>
//         </div>
//       </section>

//     </div>
//   );
// }



import { useState } from 'react';
import { Link } from 'react-router-dom';
import {Sparkles, Users, Zap, TrendingUp, Award, ArrowRight, Play, 
  Cpu, Database, RefreshCcw, Plus, BookOpen, Monitor, Eye } from 'lucide-react';
  import { useArticles } from '../hooks/useArticles';

export default function HomePage() {

  const { blogs, loading, error, parseJsonField } = useArticles();
  return (
    <div className="bg-[#020617] text-white selection:bg-emerald-500/30 overflow-x-hidden">
      
      {/* HERO SECTION */}
      <section className="relative min-h-screen flex items-center pt-30 pb-12 font-mono">
        {/* Subtle Background Glows */}
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-indigo-600/10 blur-[120px] pointer-events-none" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-emerald-600/10 blur-[120px] pointer-events-none" />

        <div className="max-w-7xl mx-auto px-4 sm:px-6 grid lg:grid-cols-2 gap-10 lg:gap-16 items-center relative z-10">
          <div className="space-y-5 sm:space-y-6">
            <div className="inline-flex items-center gap-3 px-4 py-2 rounded-full border border-slate-800 bg-slate-900/40 backdrop-blur-md">
              <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse shadow-[0_0_8px_#34d399]" />
              <span className="text-[10px] font-bold tracking-[0.3em] text-emerald-400 uppercase">AI-POWERED FASHION FUTURE</span>
            </div>

            <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold tracking-tighter leading-[0.95] sm:leading-[0.9]">
              Fashion Reimagined<br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 via-purple-400 to-cyan-300">
                by Artificial Intelligence
              </span>
            </h1>

            <p className="text-base sm:text-lg md:text-xl text-slate-400 max-w-lg leading-relaxed">
              GIA fuses real-time fashion trends with intelligent memory and generative AI to create the next generation of fashion — every season, automatically.
            </p>

            <div className="flex flex-wrap gap-3 sm:gap-5">
              <Link
                to="/studio"
                className="flex items-center gap-3 bg-white text-black px-6 py-3 sm:px-10 sm:py-5 rounded-2xl text-sm sm:text-base font-bold transition-all group"
              >
                Enter Virtual Showroom
                <ArrowRight className="group-hover:translate-x-1 transition-transform" />
              </Link>

              <Link
                to="/blog"
                className="flex items-center gap-3 border border-slate-700 bg-slate-900/20 backdrop-blur-sm hover:border-white px-6 py-3 sm:px-10 sm:py-5 rounded-2xl text-sm sm:text-base font-medium transition-all group"
              >
                Read Blogs
                <ArrowRight className="group-hover:translate-x-1 transition-transform" />
              </Link>
            </div>

            <div className="flex flex-wrap items-center gap-x-8 gap-y-4 pt-4 text-[11px] uppercase tracking-widest text-slate-500 font-bold">
              <div className="flex items-center gap-2"><Cpu className="w-4 h-4"/> Powered by Open AI</div>
              <div className="flex items-center gap-2"><RefreshCcw className="w-4 h-4"/> Closed-Loop Intelligence</div>
              <div className="flex items-center gap-2"><Sparkles className="w-4 h-4"/> 150+ Designs per Collection</div>
            </div>
          </div>

          {/* Hero Visual */}
          <div className="relative group">
            <div className="absolute -inset-1 bg-gradient-to-r from-indigo-500 to-cyan-500 rounded-[2rem] blur opacity-20 group-hover:opacity-40 transition duration-1000"></div>
            <div className="relative aspect-square bg-slate-900 rounded-[2rem] overflow-hidden border border-white/10">
              <img
                src="/img/hero.jpg"
                alt="GIA AI Fashion"
                className="w-full h-full object-cover opacity-80 group-hover:scale-105 transition-transform duration-700"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-transparent to-transparent" />
            </div>
            
            {/* Stat card overlay — sits at -bottom-8 -right-8 on lg+ so it kisses the
                image edge. On mobile that position pushes off-screen, so we let it
                sit inline at the bottom of the image area for smaller layouts. */}
            <div className="mt-4 lg:mt-0 lg:absolute lg:-bottom-8 lg:-right-8 bg-slate-900/90 backdrop-blur-xl border border-slate-700 rounded-3xl p-5 sm:p-8 shadow-2xl">
              <div className="flex items-center gap-4 sm:gap-5">
                <div className="text-4xl sm:text-5xl font-black text-emerald-400">150</div>
                <div className="text-xs uppercase tracking-tighter leading-tight font-bold text-slate-300">
                  Unique AI-generated<br />
                  designs per collection
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* TRUST BAR */}
      <div className="border-y border-white/5 py-10 bg-white/[0.02] font-mono opacity-60 hover:opacity-100 transition-opacity">
        <div className="max-w-7xl mx-auto px-6 flex flex-wrap justify-center md:justify-between gap-8  ">
          <div className="flex items-center gap-4">
            <span className="text-[10px] uppercase tracking-widest text-slate-500">Processing Engine</span>
            <span className="font-bold text-white">Open AI</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-[10px] uppercase tracking-widest text-slate-500">Memory Architecture</span>
            <span className="font-bold text-white flex items-center gap-2">
              <Database className="w-4 h-4" /> RAG + Vector Search
            </span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-[10px] uppercase tracking-widest text-slate-500">Core Logic</span>
            <span className="font-bold text-white">Multi-Agent System</span>
          </div>
        </div>
      </div>

     

      {/* ==================== NEW: VIRTUAL STUDIO SECTION ==================== */}
      <section className="py-32 bg-[#020617] font-mono relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(at_center,#4f46e520_0%,transparent_50%)]" />
        
        <div className="max-w-7xl mx-auto px-6 z-[9999]">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <div className='flex justify-center items-center md:items-start flex-col'>
              <div className="inline-flex justify-center items-center gap-3 px-5 py-2 rounded-full border border-violet-500/30 bg-violet-950/30 text-violet-400 text-xs font-bold tracking-widest mb-6">
                <Monitor className="w-4 h-4" />
                IMMERSIVE EXPERIENCE
              </div>
              
              <h2 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold tracking-tighter leading-none mb-6 text-center md:text-start">
                Virtual Showroom
              </h2>
              <p className="text-2xl text-slate-300 mb-8 text-center md:text-start">
                Step into a living, breathing 3D fashion universe powered by AI.
              </p>
              <p className="text-slate-400 max-x-full md:max-w-lg text-lg leading-relaxed mb-10 text-center md:text-start">
                Explore hundreds of AI-generated designs in real-time. Vote on your favorites, 
                mix & match outfits, and watch trends evolve with community feedback.
              </p>

              <div className="flex flex-wrap gap-4">
                <Link
                  to="/studio"
                  className="relative z-10 flex items-center gap-3 bg-white hover:bg-white/90 text-black px-10 py-5 rounded-2xl font-bold transition-all group text-lg"
                >
                  Enter Virtual Showroom
                  <ArrowRight className="group-hover:translate-x-1 transition-transform" />
                </Link>
                
              </div>

              <div className="mt-12 grid grid-cols-3 gap-8 text-center">
                <div>
                  <div className="text-xl md:text-3xl font-black text-violet-400">150+</div>
                  <div className="text-xs uppercase tracking-widest text-slate-500 mt-1">AI Designs</div>
                </div>
                <div>
                  <div className="text-xl md:text-3xl font-black text-violet-400">3D</div>
                  <div className="text-xs uppercase tracking-widest text-slate-500 mt-1">Interactive Space</div>
                </div>
                <div>
                  <div className="text-xl md:text-3xl font-black text-violet-400">Real-time</div>
                  <div className="text-xs uppercase tracking-widest text-slate-500 mt-1">Voting System</div>
                </div>
              </div>
            </div>

            {/* Visual */}
            <div className="relative group">
              <div className="absolute -inset-4 rounded-[3rem] blur-sm opacity-20 group-hover:opacity-40 transition-all duration-700" />
              <div className="relative bg-slate-900 rounded-3xl overflow-hidden border border-white/10 aspect-video">
                <img
                  src="/img/showroom.jpeg"
                  alt="Virtual Showroom"
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />
                
                {/* <div className="absolute bottom-6 left-6 right-6 bg-black/70 backdrop-blur-md border border-white/10 rounded-2xl p-5">
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2 text-emerald-400">
                      <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
                      LIVE VOTING ACTIVE
                    </div>
                    <span className="text-slate-400 text-xs">234 people voting right now</span>
                  </div>
                </div> */}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ==================== NEW: BLOG SECTION ==================== */}
      {/* <section className="py-32 border-t border-white/5 font-mono">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex flex-col md:flex-row justify-between items-end mb-16">
            <div>
              <div className="inline-flex items-center gap-2 text-rose-400 text-sm font-bold tracking-widest mb-3">
                <BookOpen className="w-5 h-5" />
                TREND INTELLIGENCE
              </div>
              <h2 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold tracking-tighter">AI-Powered Fashion Blog</h2>
            </div>
            
            <Link 
              to="/blog" 
              className="flex items-center gap-3 group text-lg font-medium hover:text-white text-slate-400 transition-colors"
            >
              View All Articles 
              <ArrowRight className="group-hover:translate-x-1 transition-transform" />
            </Link>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                title: "The Rise of Liquid Glass: 2026's Most Radical Aesthetic",
                excerpt: "How AI is predicting and accelerating the shift toward translucent, refractive materials in high fashion.",
                category: "Trend Forecast",
                readTime: "8 min",
                image: "/img/blog-liquid-glass.jpg"
              },
              {
                title: "How Our Multi-Agent System Created This Season's Color Palette",
                excerpt: "Behind the scenes: How 10 specialized agents collaborate to define the emotional tone of each collection.",
                category: "Inside GIA",
                readTime: "12 min",
                image: "/img/blog-multi-agent.jpg"
              },
              {
                title: "From Prompt to Runway: The Complete AI Fashion Generation Process",
                excerpt: "A deep dive into our closed-loop intelligence system that turns raw trends into wearable collections.",
                category: "Technology",
                readTime: "15 min",
                image: "/img/blog-process.jpg"
              }
            ].map((post, i) => (
              <Link 
                key={i} 
                to="/blog"
                className="group bg-slate-950 border border-white/5 hover:border-white/20 rounded-3xl overflow-hidden transition-all hover:-translate-y-2"
              >
                <div className="aspect-video overflow-hidden">
                  <img 
                    src={post.image} 
                    alt={post.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" 
                  />
                </div>
                <div className="p-8">
                  <div className="flex justify-between text-xs uppercase tracking-widest text-slate-500 mb-4">
                    <span>{post.category}</span>
                    <span>{post.readTime}</span>
                  </div>
                  <h3 className="text-2xl font-bold leading-tight mb-4 group-hover:text-violet-400 transition-colors">
                    {post.title}
                  </h3>
                  <p className="text-slate-400 text-sm leading-relaxed line-clamp-3">
                    {post.excerpt}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section> */}

      {/* ==================== BLOG SECTION (Latest 3) ==================== */}
      <section className="py-32 border-t border-white/5 font-mono bg-[#020617]">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex flex-col md:flex-row justify-between items-end mb-16">
            <div className='flex justify-center md:justify-start items-center md:items-start flex-col'>
              <div className="inline-flex items-center gap-2 text-rose-400 text-sm font-bold tracking-widest mb-3 ">
                <BookOpen className="w-5 h-5" />
                LATEST FROM GIA INTELLIGENCE
              </div>
              <h2 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold tracking-tighter text-center md:text-start">AI-Powered Fashion Blog</h2>
            </div>
            
            <Link 
              to="/blog" 
              className="flex items-center gap-3 group text-lg font-medium hover:text-white text-slate-400 transition-colors mt-6 md:mt-0"
            >
              View All Articles 
              <ArrowRight className="group-hover:translate-x-1 transition-transform" />
            </Link>
          </div>

          {loading ? (
            <div className="text-center py-20 text-slate-400 font-mono">
              Loading latest fashion intelligence...
            </div>
          ) : error ? (
            <div className="text-center py-20 text-red-400">
              Failed to load articles. Please try again later.
            </div>
          ) : (
            <div className="grid md:grid-cols-3 gap-8">
              {blogs.slice(0, 3).map((blog) => {
                const content = blog.content || blog.body || '';
                const excerpt = blog.excerpt || (content.length > 220 
                  ? content.substring(0, 220) + '...' 
                  : content);

                const articleUrls = parseJsonField(blog.article_urls);
                const sources = parseJsonField(blog.sources);
                const sourceUrl = articleUrls[0] || null;
                const sourceName = sources[0] || null;

                return (
                  <Link
                    key={blog.id}
                    to={`/blog`}   // Change to "/blog" if you don't have individual post routes yet
                    className="group bg-[#101828] border border-gray-700 hover:border-gray-500 rounded-2xl overflow-hidden transition-all hover:-translate-y-1 flex flex-col h-full"
                  >
                    

                    {/* Content */}
                    <div className="p-8 flex flex-col flex-1">
                      <h3 className="text-2xl font-semibold leading-tight mb-5 text-[#436891] group-hover:text-[#81a6cf] transition-colors line-clamp-3">
                        {blog.title}
                      </h3>

                      <p className="text-gray-400 text-[15px] leading-relaxed flex-1">
                        {excerpt}
                      </p>

                      {/* Image */}
                    <div className="relative overflow-hidden aspect-[16/10] pt-4">
                      <img
                        src={blog.image_url || blog.image || "https://via.placeholder.com/800x500/18181b/52525b?text=GIA+Fashion"}
                        alt={blog.title}
                        className="w-full h-full object-cover transition-transform duration-700 rounded-xl"
                        onError={(e) => {
                          e.target.src = "https://via.placeholder.com/800x500/18181b/52525b?text=Fashion+Image";
                        }}
                      />
                    </div>

                      <div className="mt-6 pt-6 border-t border-gray-700 text-blue-400 hover:text-blue-300 text-sm font-medium flex justify-center items-center gap-2 transition">
                        Read full article 
                        <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition" />
                      </div>

                      {/* Source */}
                      {/* {(sourceUrl || sourceName) && (
                        <div className="mt-6 text-xs text-gray-500 flex items-center justify-center gap-2">
                          <span>Source:</span>
                          {sourceUrl ? (
                            <a
                              href={sourceUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="hover:text-blue-400 underline underline-offset-2 truncate"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {sourceName || new URL(sourceUrl).hostname.replace('www.', '')}
                            </a>
                          ) : (
                            <span>{sourceName}</span>
                          )}
                        </div>
                      )} */}
                    </div>

                    
                  </Link>
                );
              })}

              {blogs.length === 0 && (
                <div className="col-span-3 text-center py-12 text-slate-400">
                  No articles found yet.
                </div>
              )}
            </div>
          )}
        </div>
      </section>

          {/* GS GPT */}
      <section className="py-24 bg-[#020617]">
        <div className="max-w-7xl mx-auto px-6">
          <div className="bg-gradient-to-br from-cyan-900/20 to-slate-900 border border-cyan-500/20 rounded-[3rem] p-12 flex flex-col md:flex-row items-center gap-16">
            
            <div className="flex-1">
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 text-[10px] font-bold tracking-widest mb-8 uppercase">
                <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
                AI Neural Link Active
              </div>
              <h2 className="text-5xl font-bold text-white tracking-tighter mb-6 text-center md:text-start">Your Personal <br/>Styling Co-Pilot.</h2>
              <p className="text-slate-400 text-lg mb-8 leading-relaxed text-center md:text-start" >
                GSNowGPT doesn't just suggest clothes; it understands your aesthetic DNA. From real-time design feedback to trend forecasting, your assistant is always one step ahead.
              </p>
              <ul className="space-y-4 mb-10 text-sm text-slate-300">
                <li className="flex items-center gap-3"><div className="w-1.5 h-1.5 bg-cyan-500 rounded-full" /> Instant Outfit Coordination</li>
                <li className="flex items-center gap-3"><div className="w-1.5 h-1.5 bg-cyan-500 rounded-full" /> Real-time Fabric Analysis</li>
                <li className="flex items-center gap-3"><div className="w-1.5 h-1.5 bg-cyan-500 rounded-full" /> Aesthetic Market Predictions</li>
              </ul>
              <button
                className="bg-cyan-500 hover:bg-cyan-400 text-[#020617] px-8 py-4 rounded-full font-bold text-xs tracking-[0.2em] transition-all"
                onClick={() => alert("Coming soon!")}
              >
                JOIN THE WAITLIST
              </button>
        
            </div>

            <div className="flex-1 w-full max-w-md">
              {/* Mock Chat UI */}
              <div className="bg-[#020617]/50 backdrop-blur-2xl border border-white/10 rounded-3xl p-6 shadow-2xl">
                <div className="flex items-center gap-4 mb-8">
                  <div className="h-10 w-10 rounded-full bg-cyan-500 flex items-center justify-center">
                    <Sparkles className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <p className="text-white text-sm font-bold">GSNowGPT</p>
                    <p className="text-cyan-400 text-[10px]">Processing Style Inquiry...</p>
                  </div>
                </div>
                <div className="space-y-4">
                  <div className="bg-white/5 rounded-2xl p-4 ml-8">
                    <p className="text-xs text-slate-300">"I need an avant-garde look for a digital fashion week. Think glass and liquid metal."</p>
                  </div>
                  <div className="bg-cyan-500/10 border border-cyan-500/20 rounded-2xl p-4 mr-8">
                    <p className="text-xs text-cyan-100 leading-relaxed">"Analyzing 'Liquid-Glass' aesthetics... I recommend the **Gen_Z04 Core Set** with refractive transparency layers. Shall I generate a preview?"</p>
                  </div>
                </div>

              </div>
            </div>

          </div>
        </div>
      </section>


       {/* HOW GIA WORKS */}
       <section className="py-32 relative font-mono">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-20">
            <h2 className="text-5xl font-bold tracking-tighter mb-6">The Intelligent Fashion Loop</h2>
            <p className="text-slate-400 max-w-2xl mx-auto text-lg">
              Real trends → AI memory → Generative design → User feedback → Better designs. <span className="text-emerald-400">A self-improving fashion ecosystem.</span>
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-1px bg-slate-800 border border-slate-800 rounded-[2.5rem] overflow-hidden shadow-2xl">
            {[
              {
                icon: TrendingUp,
                title: "Trend Intelligence",
                desc: "Automated scraping from Vogue, Harper’s Bazaar & Pinterest + GPT trend extraction",
                color: "group-hover:text-indigo-400"
              },
              {
                icon: Sparkles,
                title: "AI Design Engine",
                desc: "Stability AI generates 150 unique designs per collection guided by intelligent memory",
                color: "group-hover:text-emerald-400"
              },
              {
                icon: Users,
                title: "Human Feedback Loop",
                desc: "Voting, liking, styling chats & proxy voting continuously train the next collection",
                color: "group-hover:text-purple-400"
              }
            ].map((item, i) => (
              <div key={i} className="bg-[#020617] p-12 group transition-all hover:bg-slate-900/50">
                <item.icon className={`w-12 h-12 mb-8 transition-colors duration-500 ${item.color}`} />
                <h3 className="text-2xl font-bold mb-4">{item.title}</h3>
                <p className="text-slate-400 leading-relaxed text-sm">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* KEY FEATURES (VIDEO SECTION) */}
      {/* <section className="relative py-32 font-mono min-h-[800px] flex items-center overflow-hidden">
        <video
          autoPlay loop muted playsInline
          className="absolute inset-0 w-full h-full object-cover z-0 brightness-[0.3] scale-105 transition-transform duration-[10s] hover:scale-100"
        >
          <source src="/img/main-banner-1.mp4" type="video/mp4" />
        </video>
        <div className="absolute inset-0 bg-gradient-to-b from-[#020617] via-transparent to-[#020617] z-10" />

        <div className="relative z-20 max-w-7xl mx-auto px-6 w-full">
          <div className="text-center mb-20">
            <h2 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold tracking-tighter text-white drop-shadow-2xl">Built for the Future of Fashion</h2>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            <div className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-[2rem] p-10 hover:bg-white/10 transition-all">
              <div className="h-14 w-14 rounded-2xl bg-indigo-500 flex items-center justify-center mb-8 shadow-lg shadow-indigo-500/20">
                <Award className="w-8 h-8 text-white" />
              </div>
              <h3 className="text-2xl font-bold mb-4">Virtual Showroom</h3>
              <p className="text-slate-300 mb-8 text-sm leading-relaxed">Immersive 3D space showcasing AI-generated fashion. Vote, save, and interact with every piece.</p>
              <Link to="/studio" className="inline-flex items-center text-xs font-bold tracking-widest text-indigo-400 hover:text-white transition-colors">
                EXPLORE SHOWROOM <ArrowRight className="ml-2 w-4 h-4" />
              </Link>
            </div>

            <div className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-[2rem] p-10 hover:bg-white/10 transition-all">
              <div className="h-14 w-14 rounded-2xl bg-pink-500 flex items-center justify-center mb-8 shadow-lg shadow-pink-500/20">
                <Zap className="w-8 h-8 text-white" />
              </div>
              <h3 className="text-2xl font-bold mb-4">AI Blog & Trends</h3>
              <p className="text-slate-300 mb-8 text-sm leading-relaxed">Daily curated fashion intelligence turned into beautiful editorial content by our Trend Curation Agent.</p>
              <Link to="/blog" className="inline-flex items-center text-xs font-bold tracking-widest text-pink-400 hover:text-white transition-colors">
                READ LATEST TRENDS <ArrowRight className="ml-2 w-4 h-4" />
              </Link>
            </div>

            <div className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-[2rem] p-10 hover:bg-white/10 transition-all">
              <div className="h-14 w-14 rounded-2xl bg-cyan-500 flex items-center justify-center mb-8 shadow-lg shadow-cyan-500/20">
                <Users className="w-8 h-8 text-white" />
              </div>
              <h3 className="text-2xl font-bold mb-4">GSNowGPT Assistant</h3>
              <p className="text-slate-300 mb-8 text-sm leading-relaxed">Your personal AI styling companion. Get outfit recommendations, trend insights, and design feedback in real time.</p>
              <div className="text-[10px] font-bold tracking-[0.2em] text-cyan-400 uppercase">Coming Soon • Premium Access</div>
            </div>
          </div>
        </div>
      </section> */}

      {/* MULTI-AGENT SYSTEM */}
      <section className="py-32 bg-[#020617] font-mono relative">

      <div className="absolute top-0 left-1/4 w-96 h-96 bg-indigo-600/10 blur-[120px] pointer-events-none" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-emerald-600/10 blur-[120px] pointer-events-none" />
        <div className="max-w-7xl mx-auto px-6">
          <div className="max-w-3xl mb-20">
            <h2 className="text-5xl text-center md:text-start font-bold tracking-tighter mb-6">10 Intelligent Agents Working Together</h2>
            <p className="text-slate-400 text-lg text-center md:text-start">A sophisticated multi-agent architecture that makes GIA truly self-improving.</p>
          </div>

          <div className="grid md:grid-cols-2 gap-px bg-slate-800 border border-slate-800 rounded-[2rem] overflow-hidden">
            {[
              { tag: "AGENT-1 • ON DEMAND", tagColor: "text-emerald-400", title: "Styling Agent", desc: "Gives personalized styling recommendations based on any design you're viewing." },
              { tag: "AGENT-2 • CRON", tagColor: "text-amber-400", title: "Trend Curation Agent", desc: "Scrapes fashion publications and turns raw trends into structured data + editorial blogs." },
              { tag: "AGENT-7 • EVENT", tagColor: "text-sky-400", title: "Design Coordination Agent", desc: "Orchestrates generation of 150 new designs using Stability AI powered by memory." },
              { tag: "AGENT-9 • CRON (Core)", tagColor: "text-rose-400", title: "Cycle Integrity Agent", desc: "The brain of the system — ensures the entire closed loop runs correctly every cycle." }
            ].map((agent, i) => (
              <div key={i} className="bg-slate-950 p-10 hover:bg-slate-900 transition-colors group">
                <span className={`text-[10px] font-bold tracking-[0.2em] ${agent.tagColor}`}>{agent.tag}</span>
                <h4 className="text-2xl font-bold mt-4 mb-4 group-hover:translate-x-2 transition-transform">{agent.title}</h4>
                <p className="text-slate-400 text-sm leading-relaxed max-w-sm">{agent.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CALL TO ACTION */}
      <section className="py-40 bg-gradient-to-b from-[#020617] to-indigo-950/30 font-mono">
        <div className="max-w-4xl mx-auto text-center px-6">
          <h2 className="text-3xl sm:text-5xl md:text-6xl lg:text-7xl font-bold tracking-tighter mb-8 italic">
            Step into the Future<br /> of Fashion
          </h2>
          <p className="text-xl text-slate-400 mb-16 font-light">
            Explore 150+ AI-generated designs in our immersive Virtual Showroom
          </p>

          <Link
            to="/studio"
            className="group relative inline-flex items-center gap-6 bg-white text-black px-4 md:px-12  py-4 md:py-7 rounded-full font-black text-xl transition-all hover:scale-105 active:scale-95"
          >
            Enter Virtual Showroom
            <Sparkles className="w-8 h-8 animate-pulse" />
          </Link>
        </div>
      </section>
    </div>
  );
}





