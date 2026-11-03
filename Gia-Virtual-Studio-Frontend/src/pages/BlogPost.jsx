import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { MessageCircle, User, Heart, Lock } from 'lucide-react';
import { fetchArticles, fetchComments, postComment, likeArticle, fetchLikeStatus } from '../Api/api';
import { useAuth } from '../Context/AuthContext';
import Footer from '../components/ui/Footer';

// ── Deterministic seeded hash (djb2-style) ─────────────────────────────────────
function seededInt(seed) {
  const str = String(seed);
  let h = 5381;
  for (let i = 0; i < str.length; i++) {
    h = (Math.imul(h, 33) ^ str.charCodeAt(i)) >>> 0;
  }
  return h;
}

/**
 * For a list of ids, return a map { id → unique integer in [20, 80] }.
 * The mapping is fully deterministic — same ids always produce the same numbers.
 * No two ids share a number (up to 61 ids; beyond that uniqueness wraps gracefully).
 */
function generateUniqueLikes(ids) {
  const pool = Array.from({ length: 61 }, (_, i) => i + 20);
  const SHUFFLE_SEED = 0xdeadbeef;
  for (let i = pool.length - 1; i > 0; i--) {
    const j = (seededInt(i * SHUFFLE_SEED) % (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const sorted = [...ids].sort((a, b) => seededInt(a) - seededInt(b));
  const result = {};
  sorted.forEach((id, idx) => {
    result[id] = pool[idx % pool.length];
  });
  return result;
}

export default function Blog() {
  const [blogs, setBlogs] = useState([]);
  const [commentCounts, setCommentCounts] = useState({});
  const [commentsMap, setCommentsMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  const [expandedContent, setExpandedContent] = useState({});
  const [openComments, setOpenComments] = useState({});
  const [loadingComments, setLoadingComments] = useState({});
  const [commentTextMap, setCommentTextMap] = useState({});
  const [submittingMap, setSubmittingMap] = useState({});
  const [likesMap, setLikesMap] = useState({});
  const [likedMap, setLikedMap] = useState({});
  const [likeLoadingMap, setLikeLoadingMap] = useState({});
  // Store the dummy base per article so handleLike can reference it reliably
  const [dummyLikesBase, setDummyLikesBase] = useState({});

  const { isLoggedIn, user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        setError(null);

        const response = await fetchArticles();
        let articlesArray = [];
        if (Array.isArray(response)) articlesArray = response;
        else if (response?.success && Array.isArray(response?.articles)) articlesArray = response.articles;
        else if (response?.articles) articlesArray = response.articles;

        setBlogs(articlesArray);
        if (!articlesArray.length) { setLoading(false); return; }

        // Fetch comment counts
        const countsRes = await fetch(`${import.meta.env.VITE_BACKEND_API_URL}/articles/comment-counts`);
        const { counts } = await countsRes.json();
        const countsMap = {};
        for (const article of articlesArray) {
          countsMap[article.id] = counts[String(article.id)] ?? 0;
        }
        setCommentCounts(countsMap);

        // Fetch like statuses (returns { liked: bool, count?: number } per article)
        const likeResults = await Promise.all(
          articlesArray.map(a => fetchLikeStatus(a.id).catch(() => ({ liked: false, count: 0 })))
        );

        // Generate deterministic dummy base counts (20–80, no repeats)
        const dummyLikes = generateUniqueLikes(articlesArray.map(a => a.id));
        setDummyLikesBase(dummyLikes);

        const likesInit = {};
        const likedInit = {};

        articlesArray.forEach((a, i) => {
          const dummy = dummyLikes[a.id];

          // Real like count: prefer the value returned by fetchLikeStatus,
          // fall back to the `likes` field on the article object itself.
          const realCount =
            likeResults[i]?.count ??  // if your API returns a count field
            a.likes ??                // field already on the article from fetchArticles
            0;

          // ✅ THE FIX: displayed count = deterministic dummy base + real backend count
          likesInit[a.id] = dummy + realCount;
          likedInit[a.id] = likeResults[i]?.liked ?? false;
        });

        setLikesMap(likesInit);
        setLikedMap(likedInit);
      } catch (err) {
        setError(err.message || 'Failed to load articles.');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const totalPages = Math.ceil(blogs.length / itemsPerPage);

  const paginatedBlogs = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return blogs.slice(start, start + itemsPerPage);
  }, [blogs, currentPage, itemsPerPage]);

  const getPaginationNumbers = () => {
    const pages = [];
    const maxVisible = 5;
    if (totalPages <= maxVisible) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      let start = Math.max(1, currentPage - 2);
      let end = Math.min(totalPages, currentPage + 2);
      if (currentPage <= 3) end = 5;
      if (currentPage >= totalPages - 2) start = totalPages - 4;
      if (start > 1) { pages.push(1); if (start > 2) pages.push('...'); }
      for (let i = start; i <= end; i++) pages.push(i);
      if (end < totalPages) { if (end < totalPages - 1) pages.push('...'); pages.push(totalPages); }
    }
    return pages;
  };

  const handlePageChange = (page) => {
    if (page < 1 || page > totalPages) return;
    setCurrentPage(page);
    window.scrollTo({ top: 100, behavior: 'smooth' });
  };

  const handleLike = async (articleId) => {
    if (!isLoggedIn) { navigate('/auth'); return; }
    if (likeLoadingMap[articleId]) return;

    const wasLiked = likedMap[articleId];

    // Optimistic update: just ±1 on whatever is currently displayed
    setLikedMap(prev => ({ ...prev, [articleId]: !wasLiked }));
    setLikesMap(prev => ({ ...prev, [articleId]: (prev[articleId] || 0) + (wasLiked ? -1 : 1) }));
    setLikeLoadingMap(prev => ({ ...prev, [articleId]: true }));

    try {
      const res = await likeArticle(articleId);

      // Server confirms the new liked state.
      // If the server also returns the updated real count, recalculate properly.
      if (res.count !== undefined) {
        // ✅ Recalculate using dummy base + fresh server count so we stay in sync
        const dummy = dummyLikesBase[articleId] ?? 0;
        setLikesMap(prev => ({ ...prev, [articleId]: dummy + res.count }));
      }
      setLikedMap(prev => ({ ...prev, [articleId]: res.liked }));
    } catch {
      // Roll back optimistic update on failure
      setLikedMap(prev => ({ ...prev, [articleId]: wasLiked }));
      setLikesMap(prev => ({ ...prev, [articleId]: (prev[articleId] || 0) + (wasLiked ? 1 : -1) }));
    } finally {
      setLikeLoadingMap(prev => ({ ...prev, [articleId]: false }));
    }
  };

  const toggleContent = (id) =>
    setExpandedContent(prev => ({ ...prev, [id]: !prev[id] }));

  const toggleComments = async (id) => {
    const isOpen = openComments[id] || false;
    setOpenComments(prev => ({ ...prev, [id]: !isOpen }));

    if (!isOpen && !commentsMap[id]) {
      setLoadingComments(prev => ({ ...prev, [id]: true }));
      try {
        const realRes = await fetchComments(id);
        const realComments = realRes.comments ?? [];

        const aiRes = await fetch(
          `${import.meta.env.VITE_BACKEND_API_URL}/generate-comments`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify({ article_id: Number(id), article_title: '', article_content: '', count: 0 }),
          }
        );
        const aiData = aiRes.ok ? await aiRes.json() : { comments: [] };
        const aiComments = aiData.comments ?? [];

        const combined = interleaveComments(realComments, aiComments);
        setCommentsMap(prev => ({ ...prev, [id]: combined }));
      } catch (err) {
        console.error(`Failed to load comments for article ${id}:`, err);
        setCommentsMap(prev => ({ ...prev, [id]: [] }));
      } finally {
        setLoadingComments(prev => ({ ...prev, [id]: false }));
      }
    }
  };

  const interleaveComments = (real, ai) => {
    if (!ai.length) return real;
    if (!real.length) return ai;
    const result = [];
    const longer  = real.length >= ai.length ? [...real]  : [...ai];
    const shorter = real.length >= ai.length ? [...ai]    : [...real];
    const step = Math.ceil(longer.length / (shorter.length + 1));
    let si = 0;
    longer.forEach((item, i) => {
      result.push(item);
      if (si < shorter.length && (i + 1) % step === 0) {
        result.push(shorter[si++]);
      }
    });
    while (si < shorter.length) result.push(shorter[si++]);
    return result;
  };

  const handleCommentSubmit = async (e, articleId) => {
    e.preventDefault();
    if (!isLoggedIn) { navigate('/auth'); return; }
    const trimmed = commentTextMap[articleId]?.trim();
    if (!trimmed) return;

    const optimistic = {
      id: `temp-${Date.now()}`,
      user: `${user?.firstName || ''} ${user?.lastName || ''}`.trim() || 'You',
      text: trimmed,
      time: 'Just now',
    };

    setCommentsMap(prev => ({ ...prev, [articleId]: [optimistic, ...(prev[articleId] || [])] }));
    setCommentCounts(prev => ({ ...prev, [articleId]: (prev[articleId] || 0) + 1 }));
    setCommentTextMap(prev => ({ ...prev, [articleId]: '' }));
    setSubmittingMap(prev => ({ ...prev, [articleId]: true }));

    try {
      const saved = await postComment(articleId, trimmed);
      if (saved) {
        setCommentsMap(prev => ({
          ...prev,
          [articleId]: prev[articleId].map(c => c.id === optimistic.id ? saved : c),
        }));
      }
    } catch {
      setCommentsMap(prev => ({
        ...prev,
        [articleId]: prev[articleId].filter(c => c.id !== optimistic.id),
      }));
      setCommentCounts(prev => ({ ...prev, [articleId]: Math.max(0, (prev[articleId] || 1) - 1) }));
    } finally {
      setSubmittingMap(prev => ({ ...prev, [articleId]: false }));
    }
  };

  const parseJsonField = (field) => {
    if (!field) return [];
    if (Array.isArray(field)) return field;
    try { return JSON.parse(field); } catch { return []; }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0f1c] text-white flex items-center justify-center font-mono">
        <p className="text-gray-400 text-xl animate-pulse">Loading GIA Fashion Intelligence...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[#0a0f1c] text-white flex flex-col items-center justify-center gap-4 font-mono">
        <p className="text-red-400 text-lg">{error}</p>
        <button onClick={() => window.location.reload()} className="bg-pink-600 hover:bg-pink-500 px-8 py-3 rounded-2xl transition">
          Retry
        </button>
      </div>
    );
  }

  return (
    <>
    <div className="min-h-screen bg-[#132531] text-white py-20 font-mono">
      <div className="bg-[#132531] border-b border-zinc-800 py-10">
        <div className="max-w-6xl mx-auto font-mono">
          <div className="rounded-2xl border border-gray-700/80 bg-gradient-to-r from-[#183855] to-[#041A31] px-5 py-6 shadow-md">
            <p className="text-white text-md mb-4">
              AI Blog is our first live MVP. A fully automated scraping engine captures emerging trends from reputable fashion outlets, and an LLM turns those signals into refined, image-sourced articles - moving effortlessly from insight to publication.
            </p>
            <p className="text-white text-md">
              Live and interactive, it's built for users to engage now. It marks the first functional layer of GIA, evolving into a trained fashion intelligence platform.
            </p>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto pt-0">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-10 bg-[#121D2C] py-4 px-5 rounded-xl border border-zinc-700">
          <div className="flex items-center gap-6 text-md text-gray-300">
            <div className="flex items-center gap-3">
              <span className="text-gray-400">Blogs Per Page:</span>
              <select
                value={itemsPerPage}
                onChange={(e) => { setItemsPerPage(Number(e.target.value)); setCurrentPage(1); }}
                className="bg-zinc-900 border border-zinc-700 text-white rounded-xl px-4 py-2 focus:outline-none focus:border-white transition cursor-pointer"
              >
                <option value={5}>5</option>
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={30}>30</option>
              </select>
            </div>
            <span>Total: <span className="text-white font-medium">{blogs.length}</span> Blogs</span>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center gap-3">
              <button onClick={() => handlePageChange(currentPage - 1)} disabled={currentPage === 1} className="px-4 py-2 disabled:opacity-50 rounded-xl border border-white/80 transition cursor-pointer">←</button>
              <div className="flex items-center gap-1 px-4">
                {getPaginationNumbers().map((pageNum, index) => (
                  <button
                    key={index}
                    onClick={() => typeof pageNum === 'number' && handlePageChange(pageNum)}
                    disabled={pageNum === '...'}
                    className={`w-9 h-9 rounded-full flex items-center justify-center border transition ${
                      currentPage === pageNum ? 'border-white text-white' : pageNum === '...' ? 'border-gray-500 text-gray-500 cursor-default' : 'border-gray-500 hover:border-white text-gray-300'
                    }`}
                  >
                    {pageNum}
                  </button>
                ))}
              </div>
              <button onClick={() => handlePageChange(currentPage + 1)} disabled={currentPage === totalPages} className="px-4 py-2 disabled:opacity-50 rounded-xl border border-white/80 transition cursor-pointer">→</button>
            </div>
          )}
        </div>

        <div className="columns-1 lg:columns-2 gap-10 space-y-16">
          {paginatedBlogs.map((blog) => {
            const isContentExpanded = expandedContent[blog.id] || false;
            const isCommentsOpen    = openComments[blog.id]    || false;
            const comments          = commentsMap[blog.id]     || [];
            const isLoadingComments = loadingComments[blog.id] || false;
            const commentText       = commentTextMap[blog.id]  || '';
            const isSubmitting      = submittingMap[blog.id]   || false;

            const content = blog.content || blog.body || '';
            const excerpt = blog.excerpt || (content ? content.substring(0, 280) + '...' : '');

            const articleUrls = parseJsonField(blog.article_urls);
            const sources     = parseJsonField(blog.sources);
            const sourceUrl   = articleUrls[0] || null;
            const sourceName  = sources[0]     || null;

            const displayCount = Math.max(commentCounts[blog.id] ?? 0, 2);

            return (
              <div key={blog.id} className="group block bg-[#101828] px-5 py-6 rounded-xl border border-gray-600 break-inside-avoid mb-8">
                <div className="space-y-6">
                  <h2 className="text-2xl text-[#436891] font-semibold leading-tight mb-4 group-hover:text-[#81a6cf] transition line-clamp-3">
                    {blog.title}
                  </h2>

                  <div>
                    <p className="text-gray-400 text-[15px] leading-relaxed">
                      {isContentExpanded ? content : excerpt}
                    </p>
                    <button
                      onClick={(e) => { e.preventDefault(); toggleContent(blog.id); }}
                      className="text-blue-400 hover:text-blue-300 text-sm font-medium mt-3 transition cursor-pointer"
                    >
                      {isContentExpanded ? 'Show less ↑' : 'Show more...'}
                    </button>

                    <div className="relative overflow-hidden rounded-2xl aspect-[16/10] bg-zinc-900 mt-6">
                      <img
                        src={blog.image_url || blog.image}
                        alt={blog.title}
                        className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                        onError={(e) => { e.target.src = 'https://via.placeholder.com/800x500/18181b/52525b?text=Fashion+Image'; }}
                      />
                    </div>

                    {(sourceUrl || sourceName) && (
                      <div className="flex items-center justify-center gap-2 mt-4 text-sm">
                        <span className="text-gray-500">Source:</span>
                        {sourceUrl ? (
                          <a href={sourceUrl} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300 underline underline-offset-2 transition truncate max-w-[260px]" title={sourceUrl}>
                            {sourceName || sourceUrl}
                          </a>
                        ) : (
                          <span className="text-gray-300">{sourceName}</span>
                        )}
                      </div>
                    )}

                    <div className="border-t border-gray-600 mt-6"></div>

                    <div className="flex items-center justify-between mt-1">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={(e) => { e.preventDefault(); handleLike(blog.id); }}
                          disabled={likeLoadingMap[blog.id]}
                          className={`flex items-center gap-2 px-3 py-2 rounded-lg transition disabled:opacity-60 hover:bg-white/5 ${likedMap[blog.id] ? 'text-pink-500' : 'text-gray-400 hover:text-white'}`}
                        >
                          <Heart className={`w-[18px] h-[18px] ${likedMap[blog.id] ? 'fill-current' : ''}`} />
                          <span className="text-sm">{likesMap[blog.id] ?? 0}</span>
                          {!isLoggedIn && <Lock size={11} className="opacity-60" />}
                        </button>

                        <button
                          onClick={(e) => { e.preventDefault(); toggleComments(blog.id); }}
                          className="flex items-center gap-2 px-3 py-2 rounded-lg text-gray-400 hover:text-white hover:bg-white/5 transition"
                        >
                          <MessageCircle className="w-[18px] h-[18px]" />
                          <span className="text-sm">{displayCount} comments</span>
                        </button>
                      </div>

                      <button
                        onClick={(e) => { e.preventDefault(); toggleComments(blog.id); }}
                        className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-white/5 transition"
                      >
                        <span className="block text-xs transition-transform duration-200" style={{ transform: isCommentsOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}>▼</span>
                      </button>
                    </div>

                    {isCommentsOpen && (
                      <div className="mt-4 px-2 py-5">
                        {isLoadingComments ? (
                          <p className="text-gray-500 text-center py-8">Loading comments...</p>
                        ) : comments.length === 0 ? (
                          <p className="text-gray-500 text-center py-8">No comments yet. Be the first!</p>
                        ) : (
                          <ul className="space-y-5 max-h-80 overflow-y-auto pr-2 custom-scrollbar">
                            {comments.map((comment) => (
                              <li key={comment.id} className="bg-[#1A2434] border border-gray-700 rounded-2xl p-4">
                                <div className="flex items-center gap-3 mb-3">
                                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-pink-500 to-violet-600 flex items-center justify-center flex-shrink-0">
                                    <User size={15} className="text-white" />
                                  </div>
                                  <div className="flex justify-between items-center flex-wrap w-full">
                                    <span className="font-medium text-sm">{comment.user || comment.username || 'Anonymous'}</span>
                                    <span className="text-xs text-gray-500">{comment.time || 'Recently'}</span>
                                  </div>
                                </div>
                                <p className="text-gray-300 text-sm leading-relaxed">{comment.text}</p>
                              </li>
                            ))}
                          </ul>
                        )}

                        {!isLoggedIn ? (
                          <div className="text-center py-6 flex justify-start items-center flex-row my-3 px-3 rounded-xl gap-5 border border-gray-700">
                            <MessageCircle className="w-7 h-7" />
                            <div className="flex flex-col items-start">
                              <p className="text-gray-400">Join the conversation</p>
                              <p className="text-gray-400">Sign in to share your thoughts.</p>
                            </div>
                            <button onClick={() => navigate('/auth')} className="bg-transparent border border-white hover:bg-white/40 px-6 py-2 rounded-3xl text-sm transition">
                              <User className="w-3 h-3" />
                            </button>
                          </div>
                        ) : (
                          <form onSubmit={(e) => handleCommentSubmit(e, blog.id)} className="my-6">
                            <textarea
                              value={commentText}
                              onChange={(e) => setCommentTextMap(prev => ({ ...prev, [blog.id]: e.target.value }))}
                              placeholder="Share your thoughts on this trend..."
                              rows={3}
                              className="w-full bg-transparent border border-zinc-700 rounded-xl p-4 resize-none text-white placeholder-gray-500 focus:outline-none focus:border-white"
                            />
                            <div className="flex justify-end">
                              <button
                                type="submit"
                                disabled={isSubmitting || !commentText.trim()}
                                className="mt-3 w-36 bg-transparent hover:bg-white border-2 border-white disabled:opacity-50 px-4 py-2 rounded-2xl text-sm font-medium transition hover:text-black"
                              >
                                {isSubmitting ? 'Posting…' : 'Post Comment'}
                              </button>
                            </div>
                          </form>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>

     <Footer />
    </>
  );
}








// import { useState, useEffect } from "react";
// import { useParams, useNavigate } from "react-router-dom";
// import { Heart, MessageCircle, Share2, ArrowLeft, Clock, Lock, User } from "lucide-react";
// import { fetchArticleById, likeArticle, fetchLikeStatus, fetchComments, postComment } from "../Api/api";
// import { useAuth } from "../Context/AuthContext";

// const generateAIComments = async (articleId, articleTitle, articleContent, count = 4) => {
//   try {
//     const res = await fetch(`${import.meta.env.VITE_BACKEND_API_URL}/generate-comments`, {
//       method: "POST",
//       headers: { "Content-Type": "application/json", Accept: "application/json" },
//       body: JSON.stringify({
//         article_id: Number(articleId),
//         article_title: articleTitle,
//         article_content: articleContent?.slice(0, 1500) || "",
//         count,
//       }),
//     });
//     if (!res.ok) throw new Error("Failed to generate AI comments");
//     const data = await res.json();
//     return data.comments || [];
//   } catch (error) {
//     console.error("AI Comment generation failed:", error);
//     return [];
//   }
// };

// export default function BlogPost() {
//   const { id } = useParams();
//   const navigate = useNavigate();
//   const { isLoggedIn, user } = useAuth();

//   const [blog, setBlog] = useState(null);
//   const [loading, setLoading] = useState(true);
//   const [error, setError] = useState(null);

//   const [liked, setLiked] = useState(false);
//   const [likeCount, setLikeCount] = useState(0);
//   const [likeLoading, setLikeLoading] = useState(false);

//   const [comments, setComments] = useState([]);
//   const [commentText, setCommentText] = useState("");
//   const [submittingComment, setSubmittingComment] = useState(false);
//   const [commentError, setCommentError] = useState(null);
//   const [generatingAIComments, setGeneratingAIComments] = useState(false);

//   useEffect(() => {
//     const load = async () => {
//       try {
//         setLoading(true);
//         setError(null);
//         setGeneratingAIComments(false);

//         const [articleRes, commentsRes, likeRes] = await Promise.all([
//           fetchArticleById(id),
//           fetchComments(id),
//           fetchLikeStatus(id),
//         ]);

//         if (!articleRes.success || !articleRes.article) {
//           throw new Error("Article not found");
//         }

//         setBlog(articleRes.article);
//         setLikeCount(articleRes.article.likes ?? 0);
//         setLiked(likeRes.liked ?? false);

//         const realComments = commentsRes.comments ?? [];
//         const articleContent = articleRes.article.content || articleRes.article.body || "";
//         const articleTitle = articleRes.article.title;

//         let aiComments = [];
//         setGeneratingAIComments(true);

//         if (realComments.length === 0) {
//           // No real comments → generate 4 AI comments
//           aiComments = await generateAIComments(id, articleTitle, articleContent, 4);
//         } else if (realComments.length < 3) {
//           // 1–2 real comments → add 2 AI comments
//           aiComments = await generateAIComments(id, articleTitle, articleContent, 2);
//         } else {
//           // 3+ real comments → add 1 AI comment
//           aiComments = await generateAIComments(id, articleTitle, articleContent, 1);
//         }

//         setGeneratingAIComments(false);

//         // Real comments first, AI comments appended below
//         setComments([...realComments, ...aiComments]);

//       } catch (err) {
//         console.error(err);
//         if (err.message?.includes("404") || err.message?.toLowerCase().includes("not found")) {
//           navigate("/blog");
//         } else {
//           setError(err.message || "Failed to load article.");
//         }
//       } finally {
//         setLoading(false);
//         setGeneratingAIComments(false);
//       }
//     };

//     if (id) load();
//   }, [id, navigate]);

//   const handleLike = async () => {
//     if (!isLoggedIn) { navigate("/auth"); return; }
//     if (likeLoading) return;

//     const wasLiked = liked;
//     setLiked(!wasLiked);
//     setLikeCount((p) => (wasLiked ? p - 1 : p + 1));
//     setLikeLoading(true);

//     try {
//       const res = await likeArticle(id);
//       setLiked(res.liked);
//       setLikeCount(res.likes);
//     } catch {
//       setLiked(wasLiked);
//       setLikeCount((p) => (wasLiked ? p + 1 : p - 1));
//     } finally {
//       setLikeLoading(false);
//     }
//   };

//   const handleCommentSubmit = async (e) => {
//     e.preventDefault();
//     if (!isLoggedIn) { navigate("/auth"); return; }

//     const trimmed = commentText.trim();
//     if (!trimmed) return;

//     setCommentError(null);

//     const optimistic = {
//       id: `temp-${Date.now()}`,
//       user: `${user.firstName} ${user.lastName}`,
//       text: trimmed,
//       time: "Just now",
//     };

//     setComments((prev) => [optimistic, ...prev]);
//     setCommentText("");

//     try {
//       setSubmittingComment(true);
//       const saved = await postComment(id, trimmed);
//       if (saved) {
//         setComments((prev) => prev.map((c) => (c.id === optimistic.id ? saved : c)));
//       }
//     } catch (err) {
//       setComments((prev) => prev.filter((c) => c.id !== optimistic.id));
//       setCommentText(trimmed);
//       setCommentError(err.message || "Failed to post comment. Please try again.");
//     } finally {
//       setSubmittingComment(false);
//     }
//   };

//   if (loading) {
//     return (
//       <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
//         <p className="text-gray-400 text-lg animate-pulse">Loading article...</p>
//       </div>
//     );
//   }

//   if (error) {
//     return (
//       <div className="min-h-screen bg-zinc-950 text-white flex flex-col items-center justify-center gap-4">
//         <p className="text-red-400 text-lg">{error}</p>
//         <button onClick={() => navigate("/blog")} className="bg-pink-600 hover:bg-pink-500 px-6 py-2 rounded-xl transition">
//           Back to Blog
//         </button>
//       </div>
//     );
//   }

//   return (
//     <div className="min-h-screen bg-zinc-950 text-white">
//       {/* Back Button */}
//       <div className="sticky md:top-18.5 top-16 bg-zinc-950/80 backdrop-blur-md md:z-50 z-40 border-b border-zinc-800">
//         <div className="max-w-4xl mx-auto px-6 py-4">
//           <button
//             onClick={() => navigate("/blog")}
//             className="flex items-center gap-2 text-gray-400 hover:text-white transition"
//           >
//             <ArrowLeft size={20} />
//             Back to AI Blog
//           </button>
//         </div>
//       </div>

//       <article className="max-w-4xl mx-auto px-6 py-24">
//         {/* Image */}
//         <div className="relative h-[500px] rounded-3xl overflow-hidden mb-12">
//           <img src={blog.image} alt={blog.title} className="w-full h-full object-cover" />
//         </div>

//         {/* Meta */}
//         <div className="flex items-center gap-6 text-sm text-gray-400 mb-8">
//           <div className="flex items-center gap-2">
//             <Clock size={16} />
//             {blog.readTime ?? blog.read_time ?? "5 min read"}
//           </div>
//           <div>{blog.date}</div>
//         </div>

//         {/* Title */}
//         <h1 className="text-5xl md:text-6xl font-bold leading-tight mb-12">
//           {blog.title}
//         </h1>

//         {/* Content */}
//         <div
//           className="prose prose-invert prose-lg max-w-none text-gray-300 leading-relaxed"
//           dangerouslySetInnerHTML={{ __html: blog.content }}
//         />

//         {/* Interaction Bar */}
//         <div className="flex items-center justify-between border-t border-b border-zinc-800 py-8 my-16">
//           <div className="flex items-center gap-8">
//           <button
//               onClick={handleLike}
//               disabled={likeLoading}
//               className={`flex items-center gap-3 text-xl transition-colors ${
//                 liked ? "text-pink-500" : "text-gray-400 hover:text-pink-500"
//               } disabled:opacity-60`}
//             >
//               <Heart className={`w-7 h-7 ${liked ? "fill-current" : ""}`} />
//               <span>{likeCount}</span>
//               {!isLoggedIn && <Lock size={14} className="ml-1" />}
//             </button>

//             <div className="flex items-center gap-3 text-xl text-gray-400">
//               <MessageCircle className="w-7 h-7" />
//               <span>{comments.length}</span>
//             </div>
//           </div>

//           <button className="flex items-center gap-3 text-gray-400 hover:text-white transition">
//             <Share2 className="w-6 h-6" />
//             Share
//           </button>
//         </div>

//         {/* Comments Section */}
//         <div className="mt-16">
//           <h2 className="text-3xl font-semibold mb-8 flex items-center gap-3">
//             Discussion ({comments.length})
//             {generatingAIComments && (
//               <span className="text-sm text-pink-500 animate-pulse">• Generating AI insights...</span>
//             )}
//           </h2>

//           {/* Comment Form */}
//           {!isLoggedIn ? (
//             <div className="mb-12 bg-zinc-900 border border-zinc-700 rounded-2xl p-8 text-center">
//               <Lock size={28} className="mx-auto mb-3 text-gray-500" />
//               <p className="text-gray-400 mb-4">Sign in to join the discussion</p>
//               <button
//                 onClick={() => navigate("/auth")}
//                 className="bg-pink-600 hover:bg-pink-500 px-6 py-2 rounded-xl transition"
//               >
//                 Login / Sign Up
//               </button>
//             </div>
//           ) : (
//             <form onSubmit={handleCommentSubmit} className="mb-12">
//               <textarea
//                 value={commentText}
//                 onChange={(e) => setCommentText(e.target.value)}
//                 placeholder="Share your thoughts..."
//                 rows={4}
//                 className="w-full bg-zinc-900 border border-zinc-700 rounded-2xl p-6 resize-none text-white placeholder-gray-500 focus:outline-none focus:border-pink-500 transition"
//               />
//               {commentError && <p className="mt-2 text-sm text-red-400">{commentError}</p>}
//               <button
//                 type="submit"
//                 disabled={submittingComment || !commentText.trim()}
//                 className="mt-4 bg-pink-600 hover:bg-pink-500 disabled:opacity-50 disabled:cursor-not-allowed px-8 py-3 rounded-2xl font-medium transition"
//               >
//                 {submittingComment ? "Posting…" : "Post Comment"}
//               </button>
//             </form>
//           )}

//           {/* Comments List */}
//           {comments.length === 0 ? (
//             <p className="text-gray-500 text-center py-12">No comments yet. Be the first!</p>
//           ) : (
//             <ul className="space-y-6">
//               {comments.map((comment) => (
//                 <li
//                   key={comment.id}
//                   className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6"
//                 >
//                   <div className="flex items-center gap-3 mb-3">
//                     <div className="w-9 h-9 rounded-full bg-gradient-to-br from-pink-500 to-violet-600 flex items-center justify-center flex-shrink-0">
//                       <User size={16} className="text-white" />
//                     </div>
//                     <div className="flex flex-col">
//                       <span className="font-semibold text-white text-sm">
//                         {comment.user || comment.username || "Fashion Insider"}
//                       </span>
//                       <span className="text-xs text-gray-500">{comment.time || "Recently"}</span>
//                     </div>
//                   </div>

//                   <p className="text-gray-300 leading-relaxed">{comment.text}</p>

                 
//                 </li>
//               ))}
//             </ul>
//           )}
//         </div>
//       </article>
//     </div>
//   );
// }



// // import { useState, useEffect } from "react";
// // import { useParams, useNavigate } from "react-router-dom";
// // import { Heart, MessageCircle, Share2, ArrowLeft, Clock, Lock, User } from "lucide-react";
// // import { fetchArticleById, likeArticle, fetchLikeStatus, fetchComments, postComment } from "../Api/api";
// // import { useAuth } from "../Context/AuthContext";

// // const generateAIComments = async (articleId, articleTitle, articleContent, count = 4) => {
// //   try {
// //     const res = await fetch(`${import.meta.env.VITE_BACKEND_API_URL}/generate-comments`, {
// //       method: "POST",
// //       headers: { "Content-Type": "application/json", Accept: "application/json" },
// //       body: JSON.stringify({
// //         article_id: Number(articleId),
// //         article_title: articleTitle,
// //         article_content: articleContent?.slice(0, 1500) || "",
// //         count,
// //       }),
// //     });
// //     if (!res.ok) throw new Error("Failed to generate AI comments");
// //     const data = await res.json();
// //     return data.comments || [];
// //   } catch (error) {
// //     console.error("AI Comment generation failed:", error);
// //     return [];
// //   }
// // };

// // export default function BlogPost() {
// //   const { id } = useParams();
// //   const navigate = useNavigate();
// //   const { isLoggedIn, user } = useAuth();

// //   const [blog, setBlog] = useState(null);
// //   const [loading, setLoading] = useState(true);
// //   const [error, setError] = useState(null);

// //   const [liked, setLiked] = useState(false);
// //   const [likeCount, setLikeCount] = useState(0);
// //   const [likeLoading, setLikeLoading] = useState(false);

// //   const [comments, setComments] = useState([]);
// //   const [commentText, setCommentText] = useState("");
// //   const [submittingComment, setSubmittingComment] = useState(false);
// //   const [commentError, setCommentError] = useState(null);
// //   const [generatingAIComments, setGeneratingAIComments] = useState(false);

// //   useEffect(() => {
// //     const load = async () => {
// //       try {
// //         setLoading(true);
// //         setError(null);
// //         setGeneratingAIComments(false);

// //         const [articleRes, commentsRes, likeRes] = await Promise.all([
// //           fetchArticleById(id),
// //           fetchComments(id),
// //           fetchLikeStatus(id),
// //         ]);

// //         if (!articleRes.success || !articleRes.article) {
// //           throw new Error("Article not found");
// //         }

// //         setBlog(articleRes.article);
// //         setLikeCount(articleRes.article.likes ?? 0);
// //         setLiked(likeRes.liked ?? false);

// //         const realComments = commentsRes.comments ?? [];
// //         const articleContent = articleRes.article.content || articleRes.article.body || "";
// //         const articleTitle = articleRes.article.title;

// //         let aiComments = [];
// //         setGeneratingAIComments(true);

// //         if (realComments.length === 0) {
// //           // No real comments → generate 4 AI comments
// //           aiComments = await generateAIComments(id, articleTitle, articleContent, 4);
// //         } else if (realComments.length < 3) {
// //           // 1–2 real comments → add 2 AI comments
// //           aiComments = await generateAIComments(id, articleTitle, articleContent, 2);
// //         } else {
// //           // 3+ real comments → add 1 AI comment
// //           aiComments = await generateAIComments(id, articleTitle, articleContent, 1);
// //         }

// //         setGeneratingAIComments(false);

// //         // Real comments first, AI comments appended below
// //         setComments([...realComments, ...aiComments]);

// //       } catch (err) {
// //         console.error(err);
// //         if (err.message?.includes("404") || err.message?.toLowerCase().includes("not found")) {
// //           navigate("/blog");
// //         } else {
// //           setError(err.message || "Failed to load article.");
// //         }
// //       } finally {
// //         setLoading(false);
// //         setGeneratingAIComments(false);
// //       }
// //     };

// //     if (id) load();
// //   }, [id, navigate]);

// //   const handleLike = async () => {
// //     if (!isLoggedIn) { navigate("/auth"); return; }
// //     if (likeLoading) return;

// //     const wasLiked = liked;
// //     setLiked(!wasLiked);
// //     setLikeCount((p) => (wasLiked ? p - 1 : p + 1));
// //     setLikeLoading(true);

// //     try {
// //       const res = await likeArticle(id);
// //       setLiked(res.liked);
// //       setLikeCount(res.likes);
// //     } catch {
// //       setLiked(wasLiked);
// //       setLikeCount((p) => (wasLiked ? p + 1 : p - 1));
// //     } finally {
// //       setLikeLoading(false);
// //     }
// //   };

// //   const handleCommentSubmit = async (e) => {
// //     e.preventDefault();
// //     if (!isLoggedIn) { navigate("/auth"); return; }

// //     const trimmed = commentText.trim();
// //     if (!trimmed) return;

// //     setCommentError(null);

// //     const optimistic = {
// //       id: `temp-${Date.now()}`,
// //       user: `${user.firstName} ${user.lastName}`,
// //       text: trimmed,
// //       time: "Just now",
// //     };

// //     setComments((prev) => [optimistic, ...prev]);
// //     setCommentText("");

// //     try {
// //       setSubmittingComment(true);
// //       const saved = await postComment(id, trimmed);
// //       if (saved) {
// //         setComments((prev) => prev.map((c) => (c.id === optimistic.id ? saved : c)));
// //       }
// //     } catch (err) {
// //       setComments((prev) => prev.filter((c) => c.id !== optimistic.id));
// //       setCommentText(trimmed);
// //       setCommentError(err.message || "Failed to post comment. Please try again.");
// //     } finally {
// //       setSubmittingComment(false);
// //     }
// //   };

// //   if (loading) {
// //     return (
// //       <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
// //         <p className="text-gray-400 text-lg animate-pulse">Loading article...</p>
// //       </div>
// //     );
// //   }

// //   if (error) {
// //     return (
// //       <div className="min-h-screen bg-zinc-950 text-white flex flex-col items-center justify-center gap-4">
// //         <p className="text-red-400 text-lg">{error}</p>
// //         <button onClick={() => navigate("/blog")} className="bg-pink-600 hover:bg-pink-500 px-6 py-2 rounded-xl transition">
// //           Back to Blog
// //         </button>
// //       </div>
// //     );
// //   }

// //   return (
// //     <div className="min-h-screen bg-zinc-950 text-white">
// //       {/* Back Button */}
// //       <div className="sticky top-18.5 bg-zinc-950/80 backdrop-blur-md z-50 border-b border-zinc-800">
// //         <div className="max-w-4xl mx-auto px-6 py-4">
// //           <button
// //             onClick={() => navigate("/blog")}
// //             className="flex items-center gap-2 text-gray-400 hover:text-white transition"
// //           >
// //             <ArrowLeft size={20} />
// //             Back to AI Blog
// //           </button>
// //         </div>
// //       </div>

// //       <article className="max-w-4xl mx-auto px-6 py-24">
// //         {/* Image */}
// //         <div className="relative h-[500px] rounded-3xl overflow-hidden mb-12">
// //           <img src={blog.image} alt={blog.title} className="w-full h-full object-cover" />
// //         </div>

// //         {/* Meta */}
// //         <div className="flex items-center gap-6 text-sm text-gray-400 mb-8">
// //           <div className="flex items-center gap-2">
// //             <Clock size={16} />
// //             {blog.readTime ?? blog.read_time ?? "5 min read"}
// //           </div>
// //           <div>{blog.date}</div>
// //         </div>

// //         {/* Title */}
// //         <h1 className="text-5xl md:text-6xl font-bold leading-tight mb-12">
// //           {blog.title}
// //         </h1>

// //         {/* Content */}
// //         <div
// //           className="prose prose-invert prose-lg max-w-none text-gray-300 leading-relaxed"
// //           dangerouslySetInnerHTML={{ __html: blog.content }}
// //         />

// //         {/* Interaction Bar */}
// //         <div className="flex items-center justify-between border-t border-b border-zinc-800 py-8 my-16">
// //           <div className="flex items-center gap-8">
// //             <button
// //               onClick={handleLike}
// //               disabled={likeLoading}
// //               className={`flex items-center gap-3 text-xl transition-colors ${
// //                 liked ? "text-pink-500" : "text-gray-400 hover:text-pink-500"
// //               } disabled:opacity-60`}
// //             >
// //               <Heart className={`w-7 h-7 ${liked ? "fill-current" : ""}`} />
// //               <span>{likeCount}</span>
// //               {!isLoggedIn && <Lock size={14} className="ml-1" />}
// //             </button>

// //             <div className="flex items-center gap-3 text-xl text-gray-400">
// //               <MessageCircle className="w-7 h-7" />
// //               <span>{comments.length}</span>
// //             </div>
// //           </div>

// //           <button className="flex items-center gap-3 text-gray-400 hover:text-white transition">
// //             <Share2 className="w-6 h-6" />
// //             Share
// //           </button>
// //         </div>

// //         {/* Comments Section */}
// //         <div className="mt-16">
// //           <h2 className="text-3xl font-semibold mb-8 flex items-center gap-3">
// //             Discussion ({comments.length})
// //             {generatingAIComments && (
// //               <span className="text-sm text-pink-500 animate-pulse">• Generating AI insights...</span>
// //             )}
// //           </h2>

// //           {/* Comment Form */}
// //           {!isLoggedIn ? (
// //             <div className="mb-12 bg-zinc-900 border border-zinc-700 rounded-2xl p-8 text-center">
// //               <Lock size={28} className="mx-auto mb-3 text-gray-500" />
// //               <p className="text-gray-400 mb-4">Sign in to join the discussion</p>
// //               <button
// //                 onClick={() => navigate("/auth")}
// //                 className="bg-pink-600 hover:bg-pink-500 px-6 py-2 rounded-xl transition"
// //               >
// //                 Login / Sign Up
// //               </button>
// //             </div>
// //           ) : (
// //             <form onSubmit={handleCommentSubmit} className="mb-12">
// //               <textarea
// //                 value={commentText}
// //                 onChange={(e) => setCommentText(e.target.value)}
// //                 placeholder="Share your thoughts..."
// //                 rows={4}
// //                 className="w-full bg-zinc-900 border border-zinc-700 rounded-2xl p-6 resize-none text-white placeholder-gray-500 focus:outline-none focus:border-pink-500 transition"
// //               />
// //               {commentError && <p className="mt-2 text-sm text-red-400">{commentError}</p>}
// //               <button
// //                 type="submit"
// //                 disabled={submittingComment || !commentText.trim()}
// //                 className="mt-4 bg-pink-600 hover:bg-pink-500 disabled:opacity-50 disabled:cursor-not-allowed px-8 py-3 rounded-2xl font-medium transition"
// //               >
// //                 {submittingComment ? "Posting…" : "Post Comment"}
// //               </button>
// //             </form>
// //           )}

// //           {/* Comments List */}
// //           {comments.length === 0 ? (
// //             <p className="text-gray-500 text-center py-12">No comments yet. Be the first!</p>
// //           ) : (
// //             <ul className="space-y-6">
// //               {comments.map((comment) => (
// //                 <li
// //                   key={comment.id}
// //                   className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6"
// //                 >
// //                   <div className="flex items-center gap-3 mb-3">
// //                     <div className="w-9 h-9 rounded-full bg-gradient-to-br from-pink-500 to-violet-600 flex items-center justify-center flex-shrink-0">
// //                       <User size={16} className="text-white" />
// //                     </div>
// //                     <div className="flex flex-col">
// //                       <span className="font-semibold text-white text-sm">
// //                         {comment.user || comment.username || "Fashion Insider"}
// //                       </span>
// //                       <span className="text-xs text-gray-500">{comment.time || "Recently"}</span>
// //                     </div>
// //                   </div>

// //                   <p className="text-gray-300 leading-relaxed">{comment.text}</p>

                 
// //                 </li>
// //               ))}
// //             </ul>
// //           )}
// //         </div>
// //       </article>
// //     </div>
// //   );
// // }














// // import { useState, useEffect } from "react";
// // import { useParams, useNavigate } from "react-router-dom";
// // import { Heart, MessageCircle, Share2, ArrowLeft, Clock, Lock } from "lucide-react";
// // import { fetchArticleById, likeArticle, fetchLikeStatus, fetchComments, postComment } from "../Api/api";
// // import { useAuth } from "../Context/AuthContext";

// // export default function BlogPost() {

// //   const { id } = useParams();
// //   const navigate = useNavigate();
// //   const { isLoggedIn, user } = useAuth();

// //   const [blog, setBlog] = useState(null);
// //   const [loading, setLoading] = useState(true);
// //   const [error, setError] = useState(null);

// //   const [liked, setLiked] = useState(false);
// //   const [likeCount, setLikeCount] = useState(0);
// //   const [likeLoading, setLikeLoading] = useState(false);

// //   const [comments, setComments] = useState([]);
// //   const [commentText, setCommentText] = useState("");
// //   const [submittingComment, setSubmittingComment] = useState(false);
// //   const [commentError, setCommentError] = useState(null);


// //   // ───────────────────────── LOAD ARTICLE ─────────────────────────
// //   useEffect(() => {

// //     const load = async () => {
// //       try {

// //         setLoading(true);
// //         setError(null);

// //         const [articleRes, commentsRes, likeRes] = await Promise.all([
// //           fetchArticleById(id),
// //           fetchComments(id),
// //           fetchLikeStatus(id),
// //         ]);

// //         if (!articleRes.success || !articleRes.article) {
// //           throw new Error("Article not found");
// //         }

// //         setBlog(articleRes.article);
// //         setLikeCount(articleRes.article.likes ?? 0);
// //         setComments(commentsRes.comments ?? []);
// //         setLiked(likeRes.liked ?? false);

// //       } catch (err) {

// //         if (err.message.includes("404") || err.message.includes("not found")) {
// //           navigate("/blog");
// //         } else {
// //           setError(err.message || "Failed to load article.");
// //         }

// //       } finally {
// //         setLoading(false);
// //       }
// //     };

// //     load();

// //   }, [id, navigate]);


// //   // ───────────────────────── LIKE ARTICLE ─────────────────────────
// //   const handleLike = async () => {

// //     if (!isLoggedIn) {
// //       navigate("/auth");
// //       return;
// //     }

// //     if (likeLoading) return;

// //     const wasLiked = liked;

// //     setLiked(!wasLiked);
// //     setLikeCount((p) => (wasLiked ? p - 1 : p + 1));
// //     setLikeLoading(true);

// //     try {

// //       const res = await likeArticle(id);

// //       setLiked(res.liked);
// //       setLikeCount(res.likes);

// //     } catch {

// //       setLiked(wasLiked);
// //       setLikeCount((p) => (wasLiked ? p + 1 : p - 1));

// //     } finally {
// //       setLikeLoading(false);
// //     }
// //   };


// //   // ───────────────────────── POST COMMENT ─────────────────────────
// //   const handleCommentSubmit = async (e) => {

// //     e.preventDefault();

// //     if (!isLoggedIn) {
// //       navigate("/auth");
// //       return;
// //     }

// //     const trimmed = commentText.trim();
// //     if (!trimmed) return;

// //     setCommentError(null);

// //     const optimistic = {
// //       id: `temp-${Date.now()}`,
// //       user: `${user.firstName} ${user.lastName}`,
// //       text: trimmed,
// //       time: "Just now",
// //     };

// //     setComments((prev) => [optimistic, ...prev]);
// //     setCommentText("");

// //     try {

// //       setSubmittingComment(true);

// //       const saved = await postComment(id, trimmed);

// //       if (saved) {
// //         setComments((prev) =>
// //           prev.map((c) => (c.id === optimistic.id ? saved : c))
// //         );
// //       }

// //     } catch (err) {

// //       setComments((prev) => prev.filter((c) => c.id !== optimistic.id));
// //       setCommentText(trimmed);

// //       setCommentError(
// //         err.message || "Failed to post comment. Please try again."
// //       );

// //     } finally {
// //       setSubmittingComment(false);
// //     }
// //   };


// //   // ───────────────────────── LOADING STATE ─────────────────────────
// //   if (loading) {
// //     return (
// //       <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
// //         <p className="text-gray-400 text-lg animate-pulse">
// //           Loading article...
// //         </p>
// //       </div>
// //     );
// //   }


// //   // ───────────────────────── ERROR STATE ─────────────────────────
// //   if (error) {
// //     return (
// //       <div className="min-h-screen bg-zinc-950 text-white flex flex-col items-center justify-center gap-4">
// //         <p className="text-red-400 text-lg">{error}</p>

// //         <button
// //           onClick={() => navigate("/blog")}
// //           className="bg-pink-600 hover:bg-pink-500 px-6 py-2 rounded-xl transition"
// //         >
// //           Back to Blog
// //         </button>
// //       </div>
// //     );
// //   }


// //   // ───────────────────────── RENDER ─────────────────────────
// //   return (
// //     <div className="min-h-screen bg-zinc-950 text-white">

// //       {/* Back Button */}
// //       <div className="sticky top-18.5 bg-zinc-950/80 backdrop-blur-md z-50 border-b border-zinc-800">
// //         <div className="max-w-4xl mx-auto px-6 py-4">

// //           <button
// //             onClick={() => navigate("/blog")}
// //             className="flex items-center gap-2 text-gray-400 hover:text-white transition"
// //           >
// //             <ArrowLeft size={20} />
// //             Back to AI Blog
// //           </button>

// //         </div>
// //       </div>


// //       <article className="max-w-4xl mx-auto px-6 py-24">

// //         {/* Image */}
// //         <div className="relative h-[500px] rounded-3xl overflow-hidden mb-12">
// //           <img src={blog.image} alt={blog.title} className="w-full h-full object-cover" />
// //         </div>


// //         {/* Meta */}
// //         <div className="flex items-center gap-6 text-sm text-gray-400 mb-8">
// //           <div className="flex items-center gap-2">
// //             <Clock size={16} />
// //             {blog.readTime ?? blog.read_time}
// //           </div>

// //           <div>{blog.date}</div>
// //         </div>


// //         {/* Title */}
// //         <h1 className="text-5xl md:text-6xl font-bold leading-tight mb-12">
// //           {blog.title}
// //         </h1>


// //         {/* Content */}
// //         <div
// //           className="prose prose-invert prose-lg max-w-none text-gray-300 leading-relaxed"
// //           dangerouslySetInnerHTML={{ __html: blog.content }}
// //         />


// //         {/* Interaction Bar */}
// //         <div className="flex items-center justify-between border-t border-b border-zinc-800 py-8 my-16">

// //           <div className="flex items-center gap-8">

// //             {/* Like */}
// //             <button
// //               onClick={handleLike}
// //               disabled={likeLoading}
// //               className={`flex items-center gap-3 text-xl ${
// //                 liked ? "text-pink-500" : "text-gray-400 hover:text-pink-500"
// //               }`}
// //             >
// //               <Heart className={`w-7 h-7 ${liked ? "fill-current" : ""}`} />
// //               <span>{likeCount}</span>
// //               {!isLoggedIn && <Lock size={14} />}
// //             </button>


// //             {/* Comment count */}
// //             <div className="flex items-center gap-3 text-xl text-gray-400">
// //               <MessageCircle className="w-7 h-7" />
// //               <span>{comments.length}</span>
// //             </div>

// //           </div>


// //           <button className="flex items-center gap-3 text-gray-400 hover:text-white transition">
// //             <Share2 className="w-6 h-6" />
// //             Share
// //           </button>

// //         </div>


// //         {/* COMMENTS */}
// //         <div className="mt-16">

// //           <h2 className="text-3xl font-semibold mb-8">
// //             Discussion ({comments.length})
// //           </h2>


// //           {!isLoggedIn ? (

// //             <div className="mb-12 bg-zinc-900 border border-zinc-700 rounded-2xl p-8 text-center">

// //               <Lock size={28} className="mx-auto mb-3 text-gray-500" />

// //               <p className="text-gray-400 mb-4">
// //                 Sign in to join the discussion
// //               </p>

// //               <button
// //                 onClick={() => navigate("/auth")}
// //                 className="bg-pink-600 hover:bg-pink-500 px-6 py-2 rounded-xl transition"
// //               >
// //                 Login / Sign Up
// //               </button>

// //             </div>

// //           ) : (

// //             <form onSubmit={handleCommentSubmit} className="mb-12">

// //               <textarea
// //                 value={commentText}
// //                 onChange={(e) => setCommentText(e.target.value)}
// //                 placeholder="Share your thoughts..."
// //                 className="w-full bg-zinc-900 border border-zinc-700 rounded-2xl p-6 min-h-[140px]"
// //               />

// //               <button
// //                 type="submit"
// //                 className="mt-4 bg-pink-600 hover:bg-pink-500 px-8 py-3 rounded-2xl"
// //               >
// //                 Post Comment
// //               </button>

// //             </form>

// //           )}

// //         </div>
// //       </article>
// //     </div>
// //   );
// // }