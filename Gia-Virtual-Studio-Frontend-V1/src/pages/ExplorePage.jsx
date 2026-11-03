import { Link } from 'react-router-dom';
import { ArrowRight, Monitor, BookOpen, Sparkles } from 'lucide-react';

export default function ExplorePage() {
  return (
    <div className="min-h-screen bg-[#020617] text-white flex flex-col items-center justify-center font-mono px-6 py-24 relative overflow-hidden selection:bg-emerald-500/30">

      {/* Background glows - larger and more vibrant */}
      <div className="absolute top-1/4 left-1/3 w-[700px] h-[700px] bg-indigo-600/10 blur-[160px] pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/3 w-[700px] h-[700px] bg-violet-600/10 blur-[160px] pointer-events-none" />

      {/* Header - Wider content */}
      <div className="text-center mb-20 relative z-10 max-w-6xl mt-5">
        <div className="inline-flex items-center gap-3 px-5 py-2 rounded-full border border-slate-800 bg-slate-900/50 backdrop-blur-md mb-8">
          <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse shadow-[0_0_8px_#34d399]" />
          <span className="text-[10px] font-bold tracking-[0.3em] text-emerald-400 uppercase">
            GIA — Where Would You Like to Go?
          </span>
        </div>

        <h1 className="text-3xl sm:text-5xl md:text-6xl lg:text-7xl font-bold tracking-tighter leading-[0.95] sm:leading-[0.9] mb-6">
          Choose Your
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 via-purple-400 to-cyan-300">
            Experience
          </span>
        </h1>

        <p className="text-base sm:text-lg text-slate-400 mx-auto leading-relaxed">
          Step into a breathtaking 3D Virtual Showroom or explore our AI-powered Fashion Intelligence Blog.
          Two worlds. One unforgettable journey.
        </p>
      </div>

      {/* Choice Cards - Improved Design */}
      <div className="grid md:grid-cols-2 gap-6 md:gap-8 w-full max-w-6xl relative z-10 px-4 sm:px-0">

        {/* Virtual Showroom Card - Enhanced */}
        <Link
          to="/studio"
          className="group relative bg-slate-900/70 border border-slate-700 hover:border-violet-500/70 rounded-3xl p-6 sm:p-12 flex flex-col gap-6 sm:gap-8 transition-all duration-500 hover:-translate-y-3 hover:shadow-2xl hover:shadow-violet-500/20 overflow-hidden"
        >
          {/* Dynamic hover glow */}
          <div className="absolute inset-0 bg-gradient-to-br from-violet-600/5 via-indigo-600/5 to-transparent group-hover:from-violet-600/20 group-hover:via-indigo-600/20 transition-all duration-700 rounded-3xl" />

          {/* Subtle grid pattern */}
          <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff05_1px,transparent_1px),linear-gradient(to_bottom,#ffffff05_1px,transparent_1px)] bg-[size:40px_40px] opacity-30 pointer-events-none" />

          <div className="relative z-10">
            {/* Icon with enhanced glow */}
            <div className="h-20 w-20 rounded-3xl bg-gradient-to-br from-violet-600 via-indigo-600 to-cyan-500 flex items-center justify-center mb-10 shadow-2xl shadow-violet-700/40 group-hover:scale-110 group-hover:rotate-6 transition-all duration-500">
              <Monitor className="w-10 h-10 text-white" />
            </div>

            {/* Badge */}
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-violet-500/10 border border-violet-500/30 text-violet-400 text-xs font-bold tracking-widest mb-6 uppercase">
              <Sparkles className="w-4 h-4" />
              Immersive 3D
            </div>

            <h2 className="text-4xl font-bold tracking-tighter mb-5 group-hover:text-violet-200 transition-colors">
              Virtual Showroom
            </h2>

            <p className="text-slate-400 text-[17px] leading-relaxed mb-12">
              Walk through a living 3D fashion universe. Explore 150+ AI-generated designs in real-time, 
              interact with garments, and vote on your favorites.
            </p>

            {/* Enhanced Stats */}
            <div className="grid grid-cols-3 gap-6 mb-12">
              <div className="text-center">
                <div className="text-3xl font-black text-violet-400">150+</div>
                <div className="text-xs uppercase tracking-widest text-slate-500 mt-1">AI Designs</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-black text-violet-400">3D</div>
                <div className="text-xs uppercase tracking-widest text-slate-500 mt-1">Interactive</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-black text-violet-400">Live</div>
                <div className="text-xs uppercase tracking-widest text-slate-500 mt-1">Voting</div>
              </div>
            </div>

            {/* Enhanced CTA */}
            <div className="flex items-center justify-between pt-6 border-t border-slate-800">
              <div className="flex items-center gap-3 text-violet-400 group-hover:text-white font-bold text-sm uppercase tracking-widest transition-all duration-300">
                Enter the Showroom
                <ArrowRight className="w-5 h-5 group-hover:translate-x-3 transition-transform duration-300" />
              </div>
              <div className="text-[10px] text-slate-500">⌘ + Click to explore</div>
            </div>
          </div>
        </Link>

        {/* Fashion Blog Card - Enhanced */}
        <Link
          to="/blog"
          className="group relative bg-slate-900/70 border border-slate-700 hover:border-rose-500/70 rounded-3xl p-6 sm:p-12 flex flex-col gap-6 sm:gap-8 transition-all duration-500 hover:-translate-y-3 hover:shadow-2xl hover:shadow-rose-500/20 overflow-hidden"
        >
          {/* Dynamic hover glow */}
          <div className="absolute inset-0 bg-gradient-to-br from-rose-600/5 via-pink-600/5 to-transparent group-hover:from-rose-600/20 group-hover:via-pink-600/20 transition-all duration-700 rounded-3xl" />

          {/* Subtle grid pattern */}
          <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff05_1px,transparent_1px),linear-gradient(to_bottom,#ffffff05_1px,transparent_1px)] bg-[size:40px_40px] opacity-30 pointer-events-none" />

          <div className="relative z-10">
            {/* Icon with enhanced glow */}
            <div className="h-20 w-20 rounded-3xl bg-gradient-to-br from-rose-600 via-pink-600 to-purple-500 flex items-center justify-center mb-10 shadow-2xl shadow-rose-700/40 group-hover:scale-110 group-hover:-rotate-6 transition-all duration-500">
              <BookOpen className="w-10 h-10 text-white" />
            </div>

            {/* Badge */}
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs font-bold tracking-widest mb-6 uppercase">
              <Sparkles className="w-4 h-4" />
              Trend Intelligence
            </div>

            <h2 className="text-4xl font-bold tracking-tighter mb-5 group-hover:text-rose-200 transition-colors">
              Fashion Blog
            </h2>

            <p className="text-slate-400 text-[17px] leading-relaxed mb-12">
              Daily AI-curated fashion intelligence. Deep editorial stories, trend forecasts, 
              and cultural analysis from runways to street style.
            </p>

            {/* Enhanced Stats */}
            <div className="grid grid-cols-3 gap-6 mb-12">
              <div className="text-center">
                <div className="text-3xl font-black text-rose-400">Daily</div>
                <div className="text-xs uppercase tracking-widest text-slate-500 mt-1">Updates</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-black text-rose-400">AI</div>
                <div className="text-xs uppercase tracking-widest text-slate-500 mt-1">Curated</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-black text-rose-400">Global</div>
                <div className="text-xs uppercase tracking-widest text-slate-500 mt-1">Trends</div>
              </div>
            </div>

            {/* Enhanced CTA */}
            <div className="flex items-center justify-between pt-6 border-t border-slate-800">
              <div className="flex items-center gap-3 text-rose-400 group-hover:text-white font-bold text-sm uppercase tracking-widest transition-all duration-300">
                Read the Latest
                <ArrowRight className="w-5 h-5 group-hover:translate-x-3 transition-transform duration-300" />
              </div>
              <div className="text-[10px] text-slate-500">⌘ + Click to explore</div>
            </div>
          </div>
        </Link>

      </div>

      {/* Back to home */}
      <div className="mt-20 relative z-10">
        <Link
          to="/"
          className="text-slate-500 hover:text-slate-300 text-xs uppercase tracking-widest font-bold transition-colors flex items-center gap-2"
        >
          ← Back to Home
        </Link>
      </div>

    </div>
  );
}