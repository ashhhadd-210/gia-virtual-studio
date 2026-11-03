import os
import json
import base64
import asyncio
import httpx
import uuid
import math
import random
import hashlib
from datetime import datetime
from typing import List, Dict, Optional, Set, Tuple

# ── Config ────────────────────────────────────────────────────────────────────
STABILITY_API_KEY     = os.getenv("STABILITY_API_KEY")
SUPABASE_URL          = os.getenv("SUPABASE_URL")
SUPABASE_KEY          = os.getenv("SUPABASE_SERVICE_KEY")
SUPABASE_BUCKET       = os.getenv("SUPABASE_BUCKET", "gia-designs")
OPENAI_API_KEY        = os.getenv("OPENAI_API_KEY")
MAX_DESIGNS_PER_CYCLE = int(os.getenv("MAX_DESIGNS_PER_CYCLE", 150))
BATCH_BRIEF_SIZE      = int(os.getenv("BATCH_BRIEF_SIZE", 10))
DESIGN_MIN_SIGNAL     = int(os.getenv("DESIGN_MIN_SIGNAL", 1))
VISION_PASS_SCORE     = float(os.getenv("VISION_PASS_SCORE", 4.0))
MIN_COSINE_DISTANCE   = float(os.getenv("MIN_COSINE_DISTANCE", 0.15))
MAX_CONCURRENT_IMAGES = int(os.getenv("MAX_CONCURRENT_IMAGES", 3))


STABILITY_IMAGE_ENDPOINT = "https://api.stability.ai/v2beta/stable-image/generate/sd3"
STABILITY_IMAGE_MODEL    = "sd3-large"
STABILITY_3D_ENDPOINT    = "https://api.stability.ai/v2beta/3d/stable-point-aware-3d"


VECTOR_SEARCH_POOL_SIZE    = int(os.getenv("VECTOR_SEARCH_POOL_SIZE", 500))
VECTOR_SEARCH_MIN_SIM      = float(os.getenv("VECTOR_SEARCH_MIN_SIM", 0.20))


INTERACTION_EVENT_WEIGHTS: Dict[str, int] = {
    "paid_feature_use": 5,
    "blog_comment":     4,
    "vote_cast":        3,
    "blog_like":        2,
    "save_look":        2,
    "chat_query":       1,
    "design_view":      1,
}

CATEGORIES = ["apparel", "accessories", "footwear", "jewelry"]

SILHOUETTE_ARCHETYPES = [
    "voluminous A-line with dramatic flare",
    "sleek column with sculptural cutouts",
    "oversized cocoon with asymmetric hem",
    "fitted bodycon with 3D appliqué",
    "deconstructed blazer silhouette",
    "wrap dress with cascading layers",
    "architectural peplum with sharp angles",
    "balloon sleeve top with tapered base",
    "floor-length cape with structured shoulders",
    "corset-boned bodice with tiered skirt",
    "minimalist shift with bold geometric seams",
    "exaggerated shoulder jacket with cropped length",
    "bias-cut slip dress with raw edges",
    "utility jumpsuit with sculptural pockets",
    "asymmetric one-shoulder gown",
]

COLOR_PALETTES = [
    ["ivory", "gold", "champagne"],
    ["midnight black", "silver", "onyx"],
    ["cobalt blue", "white", "chrome"],
    ["deep burgundy", "rose gold", "blush"],
    ["forest green", "bronze", "cognac"],
    ["electric violet", "black", "holographic"],
    ["burnt orange", "terracotta", "sand"],
    ["dusty lavender", "pale pink", "lilac"],
    ["jade green", "ivory", "copper"],
    ["ink navy", "sky blue", "pearl"],
    ["cherry red", "black", "white"],
    ["caramel", "cream", "tobacco"],
    ["slate grey", "charcoal", "ash"],
    ["hot pink", "fuchsia", "magenta"],
    ["sage green", "nude", "butter yellow"],
    ["rust", "mustard", "dark brown"],
    ["teal", "gold", "cream"],
    ["powder blue", "white", "silver"],
    ["emerald", "black", "gold"],
    ["coral", "peach", "ivory"],
]

MATERIAL_COMBINATIONS = [
    ["liquid satin", "hand-stitched beading"],
    ["bonded neoprene", "laser-cut mesh"],
    ["duchess satin", "Chantilly lace"],
    ["felted wool", "leather trim"],
    ["organza", "3D floral appliqué"],
    ["jacquard brocade", "velvet"],
    ["technical scuba", "reflective panels"],
    ["hand-painted silk", "metallic embroidery"],
    ["raw denim", "distressed cotton"],
    ["pleated chiffon", "structured crinoline"],
    ["burnout velvet", "sheer georgette"],
    ["recycled PET fabric", "bio-resin hardware"],
    ["double-faced cashmere", "suede"],
    ["stretch jersey", "crystal embellishment"],
    ["tulle layers", "duchess satin base"],
    ["hammered silk", "hand-rolled hems"],
    ["ponte knit", "faux leather"],
    ["mikado silk", "sculptural boning"],
    ["tweed", "contrast grosgrain trim"],
    ["mesh", "metallic chain-link overlay"],
]

ERA_INFLUENCES = [
    "futuristic 2050s utopia",
    "1970s Studio 54 glamour",
    "Edwardian corsetry reimagined",
    "1990s minimalist grunge",
    "1950s couture femininity",
    "cyberpunk dystopia",
    "ancient Roman drapery modernised",
    "1980s power dressing",
    "Japanese wabi-sabi aesthetics",
    "Art Nouveau organic curves",
    "Bauhaus geometric modernism",
    "Medieval Renaissance opulence",
    "1960s Space Age mod",
    "Victorian mourning dress reinterpreted",
    "contemporary streetwear elevated",
]

MOOD_ARCHETYPES = [
    "bold and commanding",
    "ethereal and otherworldly",
    "rebellious and subversive",
    "opulent and decadent",
    "serene and meditative",
    "playful and irreverent",
    "dark and mysterious",
    "romantic and sensual",
    "architectural and cerebral",
    "raw and deconstructed",
    "futuristic and cold",
    "nostalgic and wistful",
    "maximalist and exuberant",
    "understated and refined",
    "tribal and ritualistic",
]

DESIGN_DETAILS = [
    "sculptural 3D petal construction",
    "hand-painted abstract pattern",
    "laser-cut negative space panels",
    "cascading crystal fringe",
    "origami-fold structural pleating",
    "macro-scale floral embroidery",
    "heat-pressed metallic foiling",
    "trompe l'oeil optical illusion seams",
    "architectural boning exposed as design element",
    "gradient ombré dye technique",
    "asymmetric raw-edge deconstruction",
    "oversized jewel embellishment cluster",
    "woven ribbon lattice structure",
    "deep-relief quilting pattern",
    "holographic iridescent finish",
    "hand-knotted macramé panels",
    "sculptural foam padding creating dimensional volume",
    "contrast topstitching as graphic element",
    "smocking creating dimensional texture",
    "feather trim at strategic hemline",
]

GARMENT_TYPES = [
    "evening gown",
    "structured blazer",
    "avant-garde coat",
    "couture ball skirt",
    "sculptural top",
    "wide-leg trouser",
    "cocktail dress",
    "statement jacket",
    "corset bodice",
    "editorial jumpsuit",
    "cape",
    "midi dress",
    "asymmetric skirt",
    "longline vest",
    "dramatic sleeve blouse",
]

# ── Logging helpers ───────────────────────────────────────────────────────────
def log_sep(label: str): print(f"\n{'='*65}\n  {label}\n{'='*65}")
def log_sec(label: str): print(f"\n{'─'*55}\n  {label}\n{'─'*55}")


# ══════════════════════════════════════════════════════════════════════════════
# UTILITY — Cosine similarity (pure Python, no pgvector needed)
# ══════════════════════════════════════════════════════════════════════════════

def cosine_similarity(a: List[float], b: List[float]) -> float:
    if not a or not b or len(a) != len(b):
        return 0.0
    dot    = sum(x * y for x, y in zip(a, b))
    norm_a = math.sqrt(sum(x * x for x in a))
    norm_b = math.sqrt(sum(x * x for x in b))
    if norm_a == 0.0 or norm_b == 0.0:
        return 0.0
    return dot / (norm_a * norm_b)


def cosine_distance(a: List[float], b: List[float]) -> float:
    """1 - cosine_similarity.  0 = identical, 2 = perfectly opposite."""
    return 1.0 - cosine_similarity(a, b)


# ══════════════════════════════════════════════════════════════════════════════
# CYCLE NUMBER HELPERS
# ══════════════════════════════════════════════════════════════════════════════

async def get_current_cycle_number(pool) -> int:
    """
    Returns the current active cycle number.
    Cycles are stored in the design_cycles table.
    Returns 0 if no cycle exists yet.
    """
    async with pool.acquire() as conn:
        row = await conn.fetchrow("""
            SELECT cycle_number FROM design_cycles
            ORDER BY cycle_number DESC
            LIMIT 1
        """)
    return row["cycle_number"] if row else 0


async def get_or_create_active_cycle(pool) -> int:
    """
    Returns the current active (incomplete) cycle number.
    Creates cycle 1 if none exists.
    """
    async with pool.acquire() as conn:
        row = await conn.fetchrow("""
            SELECT cycle_number FROM design_cycles
            WHERE completed_at IS NULL
            ORDER BY cycle_number DESC
            LIMIT 1
        """)
        if row:
            return row["cycle_number"]

        max_row = await conn.fetchrow("""
            SELECT MAX(cycle_number) AS max_num FROM design_cycles
        """)
        next_num = (max_row["max_num"] or 0) + 1

        await conn.execute("""
            INSERT INTO design_cycles (cycle_number, started_at)
            VALUES ($1, NOW())
        """, next_num)
        print(f"[CYCLE] Created new cycle #{next_num}")
        return next_num


async def mark_cycle_complete(pool, cycle_number: int):
    """Mark a cycle as fully complete so the CIA can start the next one."""
    async with pool.acquire() as conn:
        await conn.execute("""
            UPDATE design_cycles
            SET completed_at = NOW()
            WHERE cycle_number = $1
        """, cycle_number)
    print(f"[CYCLE] ✓ Cycle #{cycle_number} marked complete")


# ══════════════════════════════════════════════════════════════════════════════
# FIX B — COLLECTION HELPERS
# Ensure a collection exists for the active cycle and return its id.
# ══════════════════════════════════════════════════════════════════════════════

async def get_or_create_cycle_collection(pool, cycle_number: int) -> int:
    """
    FIX B: Collections are first-class objects.
    Each design cycle maps to one collection. Returns the collection id.
    Lifecycle starts as 'active' and moves to 'published' once the showroom
    gate passes (handled externally by the CIA).
    """
    async with pool.acquire() as conn:
        row = await conn.fetchrow("""
            SELECT id FROM collections
            WHERE cycle_number = $1
            LIMIT 1
        """, cycle_number)

        if row:
            return row["id"]

        coll_id = await conn.fetchval("""
            INSERT INTO collections (name, description, lifecycle, cycle_number, created_at)
            VALUES ($1, $2, 'active', $3, NOW())
            RETURNING id
        """,
            f"Cycle {cycle_number} Collection",
            f"AI-generated fashion designs from design cycle #{cycle_number}",
            cycle_number,
        )
        print(f"[COLLECTION] ✓ Created collection #{coll_id} for cycle #{cycle_number}")
        return coll_id


# ══════════════════════════════════════════════════════════════════════════════
# FIX C — SIGNAL AGGREGATION (SINGLE NORMALIZED PIPELINE)
# ══════════════════════════════════════════════════════════════════════════════

async def aggregate_signals(pool) -> List[Dict]:
    """
    FIX C (SINGLE PIPELINE): Read from the already-normalized design_signals table.

    main.py's run_feedback_loop_processor() is the SOLE writer of design_signals.
    This function is a READ-ONLY consumer of design_signals.
    It never touches interaction_events, item_votes, article_likes, or
    article_comments. Those tables are owned by the feedback loop processor.

    BOOTSTRAP: If design_signals is empty, falls back to reading trend keywords
    from memory_entries (type='trend') — never from raw source tables.
    """
    log_sep("SIGNAL AGGREGATION (FIX C — reads design_signals only, single pipeline)")
    print(
        "[SIGNALS] ARCHITECTURE: reading from design_signals table. "
        "main.py run_feedback_loop_processor() is the sole event→signal writer."
    )

    async with pool.acquire() as conn:
        rows = await conn.fetch("""
            SELECT DISTINCT ON (tag)
                tag, category, vote_score, like_score,
                comment_score, trend_score, total_score, computed_at
            FROM design_signals
            ORDER BY tag, computed_at DESC
        """)

    if rows:
        signals = []
        for r in rows:
            signals.append({
                "tag":           r["tag"],
                "category":      r["category"],
                "vote_score":    r["vote_score"],
                "like_score":    r["like_score"],
                "comment_score": r["comment_score"],
                "trend_score":   r["trend_score"],
                "total_score":   r["total_score"],
            })
        signals.sort(key=lambda x: x["total_score"], reverse=True)
        print(f"[SIGNALS] ✓ {len(signals)} signal rows from design_signals. Top 10:")
        for s in signals[:10]:
            print(
                f"  {s['tag']:30s}  total={s['total_score']}  "
                f"(v={s['vote_score']} l={s['like_score']} "
                f"c={s['comment_score']} t={s['trend_score']})"
            )
        return signals

    # ── Bootstrap path: design_signals empty — seed from memory_entries ───────
    print(
        "[SIGNALS] ⚠  BOOTSTRAP MODE — design_signals is empty. "
        "Seeding from memory_entries (type='trend') only."
    )
    return await _bootstrap_signals_from_memory(pool)


async def _bootstrap_signals_from_memory(pool) -> List[Dict]:
    """
    Bootstrap seed: derive initial signals from memory_entries (type='trend').
    Used ONLY when design_signals table is empty (first boot).
    NEVER reads interaction_events, votes, likes, or comments.
    """
    print("[SIGNALS-BOOTSTRAP] Reading trend keywords from memory_entries (type='trend') …")

    async with pool.acquire() as conn:
        trend_rows = await conn.fetch("""
            SELECT content, payload
            FROM memory_entries
            WHERE type = 'trend'
            ORDER BY created_at DESC
            LIMIT 50
        """)

    if not trend_rows:
        print("[SIGNALS-BOOTSTRAP] ✗ No trend memory entries found.")
        return []

    tag_scores: Dict[str, int] = {}
    for r in trend_rows:
        p = r["payload"] or {}
        if isinstance(p, str):
            try:
                p = json.loads(p)
            except Exception:
                p = {}

        tags: List[str] = p.get("related_tags", p.get("tags", []))
        if isinstance(tags, str):
            try:
                tags = json.loads(tags)
            except Exception:
                tags = [tags]

        title = p.get("title", "")
        if title:
            words = [w.lower().strip(".,!?'\"") for w in title.split() if len(w) > 4]
            tags.extend(words[:4])

        for tag in tags:
            if tag and len(tag) > 2:
                tag_scores[tag.lower().strip()] = tag_scores.get(tag.lower().strip(), 0) + 1

    signals = [
        {
            "tag":           tag,
            "category":      None,
            "vote_score":    0,
            "like_score":    0,
            "comment_score": 0,
            "trend_score":   score,
            "total_score":   score,
        }
        for tag, score in sorted(tag_scores.items(), key=lambda x: x[1], reverse=True)
        if score > 0
    ]

    print(f"[SIGNALS-BOOTSTRAP] ✓ {len(signals)} seed tags from trend memory. Top 10:")
    for s in signals[:10]:
        print(f"  {s['tag']:30s}  trend_score={s['trend_score']}")

    return signals


# ══════════════════════════════════════════════════════════════════════════════
# STEP 2 — DIVERSITY SEED BUILDER
# ══════════════════════════════════════════════════════════════════════════════

def build_diversity_seeds(
    count: int,
    used_combos: Set[str],
) -> List[Dict]:
    """
    Build `count` structurally diverse seed dicts.
    Uses a hash of the combination to avoid duplicates within the same cycle.
    """
    seeds: List[Dict] = []
    attempts = 0
    max_attempts = count * 20

    sil_pool    = SILHOUETTE_ARCHETYPES.copy();  random.shuffle(sil_pool)
    color_pool  = COLOR_PALETTES.copy();         random.shuffle(color_pool)
    mat_pool    = MATERIAL_COMBINATIONS.copy();  random.shuffle(mat_pool)
    era_pool    = ERA_INFLUENCES.copy();         random.shuffle(era_pool)
    mood_pool   = MOOD_ARCHETYPES.copy();        random.shuffle(mood_pool)
    detail_pool = DESIGN_DETAILS.copy();         random.shuffle(detail_pool)
    garment_pool = GARMENT_TYPES.copy();         random.shuffle(garment_pool)
    cat_pool    = CATEGORIES.copy();             random.shuffle(cat_pool)

    idx = 0
    while len(seeds) < count and attempts < max_attempts:
        attempts += 1
        i = idx % len(sil_pool)
        seed = {
            "category":        cat_pool[idx % len(cat_pool)],
            "garment_type":    garment_pool[idx % len(garment_pool)],
            "silhouette":      sil_pool[i],
            "color_palette":   color_pool[idx % len(color_pool)],
            "materials":       mat_pool[idx % len(mat_pool)],
            "era_influence":   era_pool[idx % len(era_pool)],
            "mood":            mood_pool[idx % len(mood_pool)],
            "design_detail":   detail_pool[idx % len(detail_pool)],
        }
        combo_key = hashlib.md5(
            f"{seed['garment_type']}|{seed['silhouette']}|{seed['color_palette']}|{seed['era_influence']}".encode()
        ).hexdigest()

        if combo_key not in used_combos:
            used_combos.add(combo_key)
            seed["_combo_key"] = combo_key
            seeds.append(seed)

        idx += 1

    print(f"[SEEDS] Generated {len(seeds)} diverse seeds (attempts={attempts})")
    return seeds


# ══════════════════════════════════════════════════════════════════════════════
# FIX D (REVISED) — LOCAL VECTOR SEARCH HELPER
#
# Cannot import vector_search_memory() from main.py (circular import — main.py
# imports design_agent).  This local implementation is a direct mirror of the
# main.py function, using the embed_text() and cosine_similarity() helpers that
# already exist in this module.
#
# Algorithm (identical to main.py):
#   1. Fetch up to VECTOR_SEARCH_POOL_SIZE rows of the requested memory type,
#      ordered by recency, as the candidate pool.
#   2. Embed the query string with embed_text().
#   3. Compute cosine similarity between the query vector and each row's stored
#      embedding.  Rows without an embedding score 0.0.
#   4. Filter rows whose similarity >= min_similarity.
#   5. Return the top_k highest-scoring rows as plain dicts.
#   6. If embed_text() fails (no API key, network error), fall back to returning
#      the top_k most-recent rows from the candidate pool unchanged.
# ══════════════════════════════════════════════════════════════════════════════

async def _vector_search_memory(
    pool,
    query_text: str,
    memory_type: str,
    top_k: int = 10,
    min_similarity: float = VECTOR_SEARCH_MIN_SIM,
) -> List[Dict]:
    """
    Local mirror of main.py's vector_search_memory().

    Reads from memory_entries for the given type, re-ranks the candidate pool
    by cosine similarity to query_text, and returns the top_k results.

    Falls back to recency order when embed_text() is unavailable.
    """
    log_sec(
        f"[VECTOR-SEARCH-LOCAL] type={memory_type!r} "
        f"query='{query_text[:60]}' top_k={top_k}"
    )

    # ── 1. Fetch candidate pool (recency-ordered, bounded) ────────────────────
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT id, content, payload, embedding, created_at
            FROM   memory_entries
            WHERE  type = $1
            ORDER  BY created_at DESC
            LIMIT  $2
            """,
            memory_type,
            VECTOR_SEARCH_POOL_SIZE,
        )

    if not rows:
        print(f"[VECTOR-SEARCH-LOCAL] No rows found for type={memory_type!r}")
        return []

    # ── 2. Embed the query ────────────────────────────────────────────────────
    query_vec = await embed_text(query_text)

    # ── 3 & 4. Score and filter ───────────────────────────────────────────────
    if query_vec:
        scored: List[Tuple[float, dict]] = []
        for row in rows:
            raw = row["embedding"]
            if isinstance(raw, str):
                try:
                    row_vec = json.loads(raw)
                except Exception:
                    row_vec = []
            elif isinstance(raw, list):
                row_vec = raw
            else:
                row_vec = []

            sim = cosine_similarity(query_vec, row_vec) if row_vec else 0.0
            if sim >= min_similarity:
                scored.append((sim, dict(row)))

        scored.sort(key=lambda x: x[0], reverse=True)
        results = [r for _, r in scored[:top_k]]
        print(
            f"[VECTOR-SEARCH-LOCAL] {len(results)} results "
            f"above min_similarity={min_similarity} "
            f"(pool={len(rows)}, type={memory_type!r})"
        )
    else:
        # ── 6. Fallback: no embedding available — return recency top_k ────────
        print(
            f"[VECTOR-SEARCH-LOCAL] ⚠ embed_text() unavailable — "
            f"falling back to recency order for type={memory_type!r}"
        )
        results = [dict(r) for r in rows[:top_k]]

    # ── Normalise payload and timestamp fields ────────────────────────────────
    for item in results:
        if isinstance(item.get("payload"), str):
            try:
                item["payload"] = json.loads(item["payload"])
            except Exception:
                item["payload"] = {}
        if hasattr(item.get("created_at"), "isoformat"):
            item["created_at"] = item["created_at"].isoformat()

    return results


# ══════════════════════════════════════════════════════════════════════════════
# FIX D (REVISED) — SINGLE CONTEXT ASSEMBLER for brief generation
#
# CHANGE vs original: _assemble_brief_context() now uses _vector_search_memory()
# (semantic similarity re-ranking) instead of plain recency SQL for every
# memory type it reads.  The query string is built from the top signal tags so
# that each batch retrieves the memory entries most relevant to the current
# audience signals.
#
# Memory types consumed (unchanged from FIX D original):
#   - 'trend'            : external trend signals
#   - 'feedback_summary' : normalized summaries from run_feedback_loop_processor()
#   - 'rag_context'      : pre-computed RAG retrieval snapshots
#   - 'design_brief'     : past cycle briefs for variety differentiation
#   - 'design_signal'    : semantic signal store (supplements sparse arg signals)
#
# NEVER reads blog_articles, trends, item_votes, article_likes, article_comments.
# ══════════════════════════════════════════════════════════════════════════════

async def _assemble_brief_context(pool, signals: List[Dict]) -> Dict[str, str]:
    """
    FIX D (REVISED): Single context assembler — reads ONLY from memory_entries
    (RAG store) via vector similarity search, not plain recency SQL.

    The semantic query is derived from the top signal tags so that all five
    memory-type retrievals are anchored to the current audience signals rather
    than whichever entries happen to be newest.
    """
    log_sec("[CONTEXT-ASSEMBLER] Building brief context via vector search (FIX D revised)")

    # ── Build semantic query from top signal tags ─────────────────────────────
    # Use the top 8 signal tags as the retrieval anchor.  If no signals are
    # available yet (bootstrap), fall back to a generic fashion design query.
    top_tags = [s["tag"] for s in signals[:8] if s.get("tag")]
    if top_tags:
        semantic_query = (
            "fashion design trends audience preferences: "
            + ", ".join(top_tags)
        )
    else:
        semantic_query = "luxury fashion design trends materials silhouette mood"

    print(f"[CONTEXT-ASSEMBLER] Semantic query: '{semantic_query[:120]}'")

    # ── Retrieve each memory type via vector search ───────────────────────────
    # top_k values mirror the original recency limits so downstream
    # prompt length stays consistent.

    trend_results = await _vector_search_memory(
        pool, semantic_query, memory_type="trend",
        top_k=12,
        min_similarity=VECTOR_SEARCH_MIN_SIM,
    )

    feedback_summary_results = await _vector_search_memory(
        pool, semantic_query, memory_type="feedback_summary",
        top_k=8,
        min_similarity=VECTOR_SEARCH_MIN_SIM,
    )

    rag_context_results = await _vector_search_memory(
        pool, semantic_query, memory_type="rag_context",
        top_k=6,
        min_similarity=VECTOR_SEARCH_MIN_SIM,
    )

    brief_results = await _vector_search_memory(
        pool, semantic_query, memory_type="design_brief",
        top_k=6,
        min_similarity=VECTOR_SEARCH_MIN_SIM,
    )

    signal_memory_results = await _vector_search_memory(
        pool, semantic_query, memory_type="design_signal",
        top_k=15,
        min_similarity=VECTOR_SEARCH_MIN_SIM,
    )

    # ── Build signal summary (from normalized design_signals arg) ─────────────
    top_signals = signals[:12]
    signal_lines = []
    for s in top_signals:
        signal_lines.append(
            f"  - {s['tag']} (score={s['total_score']},"
            f" v={s['vote_score']}, l={s['like_score']},"
            f" c={s['comment_score']}, t={s['trend_score']})"
        )

    # Supplement with semantic signal memory if arg signals are sparse
    if len(signal_lines) < 5:
        for row in signal_memory_results:
            p = row.get("payload") or {}
            tag   = p.get("tag", "")
            score = p.get("total_score", 0)
            if tag:
                signal_lines.append(f"  - {tag} (memory score={score})")

    signal_summary = (
        "\n".join(signal_lines) if signal_lines
        else "  (no signals available yet)"
    )

    # ── Build trend summary from vector-retrieved trend entries ───────────────
    trend_lines = []
    for row in trend_results:
        p = row.get("payload") or {}
        title = p.get("title", "")
        desc  = p.get("description", "")
        tags  = p.get("related_tags", p.get("tags", []))
        if title:
            line = f"  - {title}"
            if desc:
                line += f": {desc[:100]}"
            if tags:
                line += f" [tags: {', '.join(tags[:3])}]"
            trend_lines.append(line)
        elif row.get("content"):
            trend_lines.append(f"  - {row['content'][:120]}")

    trend_summary = (
        "\n".join(trend_lines) if trend_lines
        else "  (no trend memory available yet)"
    )

    # ── Feedback summary block ────────────────────────────────────────────────
    feedback_lines = []
    for row in feedback_summary_results:
        p = row.get("payload") or {}
        content  = row.get("content") or ""
        top_tags_fb = p.get("top_tags", [])
        if content:
            line = f"  - {content[:150]}"
            if top_tags_fb:
                line += f" [top: {', '.join(top_tags_fb[:4])}]"
            feedback_lines.append(line)

    feedback_context = "\n".join(feedback_lines) if feedback_lines else ""

    # ── RAG context block ─────────────────────────────────────────────────────
    rag_lines = []
    for row in rag_context_results:
        p = row.get("payload") or {}
        content = row.get("content") or ""
        source  = p.get("source", "")
        if content:
            line = f"  - {content[:150]}"
            if source:
                line += f" [src: {source}]"
            rag_lines.append(line)

    rag_context = "\n".join(rag_lines) if rag_lines else ""

    # ── Past brief context for variety differentiation ────────────────────────
    brief_lines = []
    for row in brief_results:
        p = row.get("payload") or {}
        title = p.get("title", (row.get("content") or "")[:60])
        if title:
            brief_lines.append(f"  - Past brief: {title}")

    brief_context = "\n".join(brief_lines) if brief_lines else ""

    print(
        f"[CONTEXT-ASSEMBLER] ✓ vector search results: "
        f"{len(trend_results)} trend | "
        f"{len(feedback_summary_results)} feedback_summary | "
        f"{len(rag_context_results)} rag_context | "
        f"{len(signal_lines)} signal lines | "
        f"{len(brief_results)} past briefs"
    )

    return {
        "signal_summary":    signal_summary,
        "trend_summary":     trend_summary,
        "feedback_context":  feedback_context,
        "rag_context":       rag_context,
        "brief_context":     brief_context,
    }


# ══════════════════════════════════════════════════════════════════════════════
# STEP 3 — BATCH BRIEF GENERATION (GPT-4o — BATCH_BRIEF_SIZE at once)
# ══════════════════════════════════════════════════════════════════════════════

async def generate_brief_batch(
    pool,
    signals: List[Dict],
    seeds: List[Dict],
    batch_index: int,
) -> List[Dict]:
    """
    FIX D (REVISED): Uses _assemble_brief_context() which now retrieves all
    five memory types via _vector_search_memory() (semantic similarity) instead
    of plain recency SQL.
    """
    log_sec(f"BATCH BRIEF GENERATION — batch {batch_index+1} ({len(seeds)} briefs)")

    context = await _assemble_brief_context(pool, signals)

    seed_block_lines = []
    for i, seed in enumerate(seeds):
        colors = ", ".join(seed["color_palette"])
        mats   = ", ".join(seed["materials"])
        seed_block_lines.append(
            f"Design {i+1}:\n"
            f"  category={seed['category']} | garment={seed['garment_type']}\n"
            f"  silhouette={seed['silhouette']}\n"
            f"  colors={colors}\n"
            f"  materials={mats}\n"
            f"  era={seed['era_influence']}\n"
            f"  mood={seed['mood']}\n"
            f"  key_detail={seed['design_detail']}"
        )
    seed_block = "\n\n".join(seed_block_lines)

    variety_note = ""
    if context["brief_context"]:
        variety_note = f"\nPAST BRIEFS TO DIFFERENTIATE FROM:\n{context['brief_context']}\n"

    feedback_block = ""
    if context["feedback_context"]:
        feedback_block = f"\nFEEDBACK SUMMARY (from normalized interaction signals):\n{context['feedback_context']}\n"

    rag_block = ""
    if context["rag_context"]:
        rag_block = f"\nRAG CONTEXT (retrieved knowledge for this cycle):\n{context['rag_context']}\n"

    prompt = f"""You are the creative director of the world's most celebrated 3D luxury fashion house.

Generate exactly {len(seeds)} COMPLETELY DISTINCT award-winning design briefs.
Each brief MUST be anchored to its corresponding seed below — do NOT swap or mix seeds.
Every brief must have a unique title, concept, and visual identity.

TOP AUDIENCE SIGNALS (from normalized user interaction data):
{context['signal_summary']}

CURRENT FASHION TRENDS (from semantic memory store):
{context['trend_summary']}
{feedback_block}{rag_block}{variety_note}
DIVERSITY SEEDS (one per brief — follow these exactly):
{seed_block}

Rules for ALL briefs:
1. Each design is a SINGLE ISOLATED GARMENT on a PURE WHITE background.
2. No human model, no mannequin, no background props.
3. The stability_prompt must be 100-140 words, opening with the garment type.
4. Must include in every stability_prompt: "fashion photography, 3D render, studio lighting, ultra high resolution, luxury fashion editorial, photorealistic, pure white background, centred, fully visible"
5. Designs must be wearable and commercially viable, not pure concept art.
6. Make each one VISUALLY UNMISTAKABLE from the others — different garment type, different colour story, different mood.

Respond ONLY with a valid JSON object (no markdown) with this exact schema:
{{
  "designs": [
    {{
      "title": "Poetic, evocative, unique name",
      "category": "apparel|accessories|footwear|jewelry",
      "style": "One sentence — the overall aesthetic direction",
      "silhouette": "Precise shape, volume, structure, drape",
      "color_palette": ["color1", "color2", "color3"],
      "materials": ["material1", "material2"],
      "mood": "Emotional tone",
      "era_influence": "Historical/cultural reference",
      "top_tags": ["tag1","tag2","tag3","tag4","tag5"],
      "stability_prompt": "Full 100-140 word Stability AI prompt...",
      "negative_prompt": "blurry, low quality, distorted, cartoon, anime, flat, 2D illustration, sketch, watermark, text, logo, human model, mannequin, background props, busy background, multiple garments, cropped, partial view, dark background shadows"
    }}
  ]
}}"""

    try:
        async with httpx.AsyncClient(timeout=120) as client:
            res = await client.post(
                "https://api.openai.com/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {OPENAI_API_KEY}",
                    "Content-Type":  "application/json",
                },
                json={
                    "model":           "gpt-4o",
                    "max_tokens":      4096,
                    "temperature":     0.95,
                    "messages": [
                        {
                            "role":    "system",
                            "content": (
                                "You are a world-class luxury fashion creative director. "
                                "Every brief you write produces an iconic, award-winning, "
                                "visually unique design. Respond only with valid JSON."
                            ),
                        },
                        {"role": "user", "content": prompt},
                    ],
                    "response_format": {"type": "json_object"},
                },
            )
        res.raise_for_status()
        data    = res.json()
        content = json.loads(data["choices"][0]["message"]["content"])
        briefs  = content.get("designs", [])

        for i, brief in enumerate(briefs):
            if i < len(seeds):
                brief["_combo_key"] = seeds[i].get("_combo_key", "")

        print(f"[BATCH-BRIEF] ✓ {len(briefs)} briefs returned")
        return briefs

    except Exception as e:
        print(f"[BATCH-BRIEF] ✗ {type(e).__name__}: {e}")
        return []


# ══════════════════════════════════════════════════════════════════════════════
# STEP 4 — EMBEDDING-BASED DEDUPLICATION
# ══════════════════════════════════════════════════════════════════════════════

async def embed_text(text: str) -> List[float]:
    """Generate an OpenAI text-embedding-3-small vector."""
    if not OPENAI_API_KEY:
        return []
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            res = await client.post(
                "https://api.openai.com/v1/embeddings",
                headers={
                    "Authorization": f"Bearer {OPENAI_API_KEY}",
                    "Content-Type":  "application/json",
                },
                json={"model": "text-embedding-3-small", "input": text[:2000]},
            )
            res.raise_for_status()
            return res.json()["data"][0]["embedding"]
    except Exception as e:
        print(f"[EMBED] ✗ {type(e).__name__}: {e}")
        return []


async def deduplicate_briefs(
    briefs: List[Dict],
    existing_embeddings: List[List[float]],
    min_distance: float = MIN_COSINE_DISTANCE,
) -> Tuple[List[Dict], List[List[float]]]:
    """
    For each brief:
      1. Embed its style+silhouette+prompt fingerprint.
      2. Compare against ALL previously accepted embeddings (current cycle + history).
      3. Accept only if cosine distance to every existing embedding >= min_distance.
    """
    accepted: List[Dict]   = []
    session_embeddings     = list(existing_embeddings)

    for brief in briefs:
        fingerprint = (
            f"{brief.get('title','')} "
            f"{brief.get('style','')} "
            f"{brief.get('silhouette','')} "
            f"{brief.get('mood','')} "
            f"{brief.get('era_influence','')} "
            f"{' '.join(brief.get('color_palette', []))} "
            f"{brief.get('stability_prompt','')[:300]}"
        )

        vec = await embed_text(fingerprint)

        if session_embeddings and vec:
            distances = [cosine_distance(vec, ev) for ev in session_embeddings if ev]
            min_dist  = min(distances) if distances else 1.0
            if min_dist < min_distance:
                print(f"[DEDUP] ✗ '{brief.get('title','?')}' too similar "
                      f"(min_dist={min_dist:.3f} < {min_distance}) — skipped")
                continue

        brief["_embedding"] = vec
        session_embeddings.append(vec)
        accepted.append(brief)
        print(f"[DEDUP] ✓ '{brief.get('title','?')}' accepted")

    return accepted, session_embeddings


async def load_cycle_embeddings(pool, cycle_number: int) -> List[List[float]]:
    """
    Load embeddings for dedup seeding.
    Loads from ALL cycles to prevent cross-cycle duplicate designs.
    """
    async with pool.acquire() as conn:
        current_rows = await conn.fetch("""
            SELECT embedding FROM memory_entries
            WHERE type = 'design_brief'
              AND payload->>'cycle_number' = $1
            ORDER BY created_at DESC
        """, str(cycle_number))

        history_rows = await conn.fetch("""
            SELECT embedding FROM memory_entries
            WHERE type = 'design_brief'
              AND (payload->>'cycle_number' IS NULL
                   OR payload->>'cycle_number' != $1)
            ORDER BY created_at DESC
            LIMIT 200
        """, str(cycle_number))

    def parse_embedding(raw) -> Optional[List[float]]:
        if isinstance(raw, str):
            try:
                vec = json.loads(raw)
                return vec if vec else None
            except Exception:
                return None
        elif isinstance(raw, list) and raw:
            return raw
        return None

    embeddings = []
    for r in current_rows:
        vec = parse_embedding(r["embedding"])
        if vec:
            embeddings.append(vec)
    for r in history_rows:
        vec = parse_embedding(r["embedding"])
        if vec:
            embeddings.append(vec)

    print(
        f"[DEDUP] Loaded {len(list(current_rows))} current-cycle + "
        f"up to 200 history embeddings for dedup "
        f"(total={len(embeddings)})"
    )
    return embeddings


async def store_brief_embedding(pool, brief: Dict, cycle_number: int):
    """Persist a brief's embedding to memory_entries for future dedup."""
    vec = brief.get("_embedding", [])
    content_text = (
        f"Design brief: {brief.get('title','')}. "
        f"{brief.get('style','')} "
        f"Silhouette: {brief.get('silhouette','')}. "
        f"Mood: {brief.get('mood','')}."
    )
    payload = {
        "title":        brief.get("title"),
        "category":     brief.get("category"),
        "combo_key":    brief.get("_combo_key", ""),
        "cycle_number": str(cycle_number),
    }
    async with pool.acquire() as conn:
        await conn.execute("""
            INSERT INTO memory_entries (type, content, payload, embedding, created_at)
            VALUES ($1, $2, $3::jsonb, $4::jsonb, NOW())
        """,
            "design_brief",
            content_text,
            json.dumps(payload),
            json.dumps(vec),
        )


# ══════════════════════════════════════════════════════════════════════════════
# STEP 5 — IMAGE GENERATION (Stability AI sd3-large)
# ══════════════════════════════════════════════════════════════════════════════

async def generate_image(brief: Dict, semaphore: asyncio.Semaphore) -> Optional[bytes]:
    """Generate ONE fashion image via Stability AI sd3-large."""
    async with semaphore:
        if not STABILITY_API_KEY:
            raise RuntimeError("STABILITY_API_KEY not set in .env")

        prompt   = brief["stability_prompt"]
        negative = brief.get(
            "negative_prompt",
            "blurry, low quality, distorted, cartoon, anime, flat, 2D illustration, "
            "sketch, watermark, text, logo, human model, mannequin, background props, "
            "busy background, multiple garments, cropped, partial view"
        )

        print(f"[IMAGE] Generating: '{brief.get('title','?')}' …")
        try:
            async with httpx.AsyncClient(timeout=120) as client:
                res = await client.post(
                    STABILITY_IMAGE_ENDPOINT,
                    headers={
                        "Authorization": f"Bearer {STABILITY_API_KEY}",
                        "Accept":        "image/*",
                    },
                    files={
                        "prompt":          (None, prompt),
                        "negative_prompt": (None, negative),
                        "model":           (None, STABILITY_IMAGE_MODEL),
                        "aspect_ratio":    (None, "2:3"),
                        "output_format":   (None, "png"),
                    },
                )
            if res.status_code == 200:
                print(f"[IMAGE] ✓ '{brief.get('title','?')}' — {len(res.content):,} bytes")
                return res.content
            else:
                print(f"[IMAGE] ✗ HTTP {res.status_code} for '{brief.get('title','?')}': {res.text[:300]}")
                return None
        except Exception as e:
            print(f"[IMAGE] ✗ {type(e).__name__}: {e}")
            return None


# ══════════════════════════════════════════════════════════════════════════════
# STEP 6 — 3D MODEL GENERATION (Stability AI stable-point-aware-3d)
# ══════════════════════════════════════════════════════════════════════════════

async def generate_3d_model(image_bytes: bytes, title: str = "") -> Optional[bytes]:
    """Convert a PNG image to a .glb 3D model via Stability AI."""
    if not STABILITY_API_KEY:
        raise RuntimeError("STABILITY_API_KEY not set in .env")

    print(f"[3D] Converting image to .glb: '{title}' ({len(image_bytes):,} bytes)")
    try:
        async with httpx.AsyncClient(timeout=300) as client:
            res = await client.post(
                STABILITY_3D_ENDPOINT,
                headers={"Authorization": f"Bearer {STABILITY_API_KEY}"},
                files={"image": ("design.png", image_bytes, "image/png")},
                data={},
            )
        if res.status_code == 200:
            print(f"[3D] ✓ '{title}' — {len(res.content):,} bytes (.glb)")
            return res.content
        else:
            print(f"[3D] ✗ HTTP {res.status_code} for '{title}': {res.text[:300]}")
            return None
    except Exception as e:
        print(f"[3D] ✗ {type(e).__name__}: {e}")
        return None


# ══════════════════════════════════════════════════════════════════════════════
# STEP 7 — SUPABASE UPLOAD (image + 3D model)
# ══════════════════════════════════════════════════════════════════════════════

async def upload_to_supabase(
    image_bytes: bytes,
    glb_bytes: Optional[bytes],
    cycle_number: int,
) -> Dict[str, Optional[str]]:
    """Upload PNG + optional .glb to Supabase Storage. Returns public URLs."""
    if not SUPABASE_URL or not SUPABASE_KEY:
        raise RuntimeError("SUPABASE_URL or SUPABASE_SERVICE_KEY not set in .env")

    base      = SUPABASE_URL.rstrip("/")
    file_uuid = str(uuid.uuid4())
    results   = {"image_url": None, "model_url": None}
    folder    = f"cycle-{cycle_number}"

    async with httpx.AsyncClient(timeout=120) as client:

        # ── Image ──────────────────────────────────────────────────────────────
        image_path = f"designs/{folder}/{file_uuid}.png"
        img_res = await client.post(
            f"{base}/storage/v1/object/{SUPABASE_BUCKET}/{image_path}",
            headers={
                "Authorization": f"Bearer {SUPABASE_KEY}",
                "Content-Type":  "image/png",
                "x-upsert":      "true",
            },
            content=image_bytes,
        )
        if img_res.status_code in (200, 201):
            results["image_url"] = (
                f"{base}/storage/v1/object/public/{SUPABASE_BUCKET}/{image_path}"
            )
        else:
            print(f"[UPLOAD] ✗ Image HTTP {img_res.status_code}: {img_res.text[:200]}")

        # ── 3D Model ───────────────────────────────────────────────────────────
        if glb_bytes:
            model_path = f"designs/{folder}/{file_uuid}.glb"
            glb_res = await client.post(
                f"{base}/storage/v1/object/{SUPABASE_BUCKET}/{model_path}",
                headers={
                    "Authorization": f"Bearer {SUPABASE_KEY}",
                    "Content-Type":  "model/gltf-binary",
                    "x-upsert":      "true",
                },
                content=glb_bytes,
            )
            if glb_res.status_code in (200, 201):
                results["model_url"] = (
                    f"{base}/storage/v1/object/public/{SUPABASE_BUCKET}/{model_path}"
                )
            else:
                print(f"[UPLOAD] ✗ Model HTTP {glb_res.status_code}: {glb_res.text[:200]}")

    return results


# ══════════════════════════════════════════════════════════════════════════════
# STEP 8 — VISION SCORING (GPT-4o vision)
# ══════════════════════════════════════════════════════════════════════════════

async def score_image_with_vision(
    image_bytes: bytes,
    image_url: str,
    brief: Dict,
) -> Dict:
    """Score the generated image for quality and brief alignment."""
    if not OPENAI_API_KEY:
        return {"url": image_url, "score": 5.0, "notes": "scoring skipped", "publishable": True}

    brief_context = (
        f"Style: {brief.get('style','')}\n"
        f"Silhouette: {brief.get('silhouette','')}\n"
        f"Colors: {', '.join(brief.get('color_palette', []))}\n"
        f"Materials: {', '.join(brief.get('materials', []))}\n"
        f"Mood: {brief.get('mood','')}\n"
        f"Era: {brief.get('era_influence','')}"
    )

    scoring_prompt = f"""You are a luxury fashion art director evaluating an AI-generated fashion image
for a premium 3D showroom.

Design brief:
{brief_context}

Score 0.0-10.0 across five dimensions (2 pts each):
  - Technical quality    : sharpness, lighting, realism, clean background
  - Fashion appeal       : wearability, luxury feel, commercial readiness
  - Brief alignment      : matches style, mood, colors, silhouette
  - 3D conversion ready  : clear silhouette, isolated subject, no bg clutter
  - Originality          : distinctive, memorable, show-stopping

Respond ONLY with valid JSON (no markdown):
{{
  "score": 7.5,
  "technical_quality": 1.8,
  "fashion_appeal": 2.0,
  "brief_alignment": 1.5,
  "three_d_readiness": 1.5,
  "originality": 0.7,
  "notes": "One sentence of honest, specific feedback.",
  "publishable": true
}}

publishable = true if score >= {VISION_PASS_SCORE}"""

    b64 = base64.b64encode(image_bytes).decode("utf-8")
    try:
        async with httpx.AsyncClient(timeout=60) as client:
            res = await client.post(
                "https://api.openai.com/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {OPENAI_API_KEY}",
                    "Content-Type":  "application/json",
                },
                json={
                    "model":      "gpt-4o",
                    "max_tokens": 300,
                    "messages": [{
                        "role":    "user",
                        "content": [
                            {
                                "type":      "image_url",
                                "image_url": {
                                    "url":    f"data:image/png;base64,{b64}",
                                    "detail": "high",
                                },
                            },
                            {"type": "text", "text": scoring_prompt},
                        ],
                    }],
                    "response_format": {"type": "json_object"},
                },
            )
        res.raise_for_status()
        result = json.loads(res.json()["choices"][0]["message"]["content"])
        result["url"]         = image_url
        result["publishable"] = result.get("score", 0) >= VISION_PASS_SCORE
        print(f"[VISION] '{brief.get('title','?')}' score={result.get('score')}/10  "
              f"publishable={result['publishable']}  {result.get('notes','')}")
        return result
    except Exception as e:
        print(f"[VISION] ✗ {type(e).__name__}: {e}")
        return {"url": image_url, "score": 4.0, "notes": f"error: {e}", "publishable": False}


# ══════════════════════════════════════════════════════════════════════════════
# STEP 9 — PERSIST + PUBLISH TO SHOWROOM
# ══════════════════════════════════════════════════════════════════════════════

async def persist_and_publish(
    pool,
    brief: Dict,
    upload_result: Dict,
    score: Dict,
    top_signals: List[Dict],
    cycle_number: int,
    collection_id: Optional[int] = None,
) -> Optional[Dict]:
    """
    FIX B: Saves generated_designs row with collection_id set.
    Publishes to showroom (also with collection_id) + upserts product_catalog
    with is_active=TRUE and collection_id if design passes the vision gate.
    """
    image_url   = upload_result.get("image_url")
    model_url   = upload_result.get("model_url")
    raw_score   = score.get("score", 0.0)
    publishable = bool(image_url) and raw_score >= VISION_PASS_SCORE
    status      = "published" if publishable else "scored"
    top_tags    = [s["tag"] for s in top_signals[:8]]

    async with pool.acquire() as conn:
        design_id = await conn.fetchval("""
            INSERT INTO generated_designs
                (cycle_number, collection_id, prompt_used, brief_json, image_url, model_url,
                 score_json, publishable, top_tags, status, created_at)
            VALUES ($1,$2,$3,$4::jsonb,$5,$6,$7::jsonb,$8,$9::jsonb,$10,NOW())
            RETURNING id
        """,
            cycle_number,
            collection_id,
            brief.get("stability_prompt", ""),
            json.dumps({k: v for k, v in brief.items() if not k.startswith("_")}),
            image_url,
            model_url,
            json.dumps(score),
            publishable,
            json.dumps(top_tags),
            status,
        )

        print(f"[PERSIST] Design #{design_id} | cycle={cycle_number} | "
              f"collection={collection_id} | status={status} | "
              f"score={raw_score:.1f} | 3D={'✓' if model_url else '✗'}")

        showroom_id = None
        if publishable and image_url:
            await conn.execute(
                "UPDATE generated_designs SET published_at=NOW() WHERE id=$1",
                design_id
            )
            showroom_id = await conn.fetchval("""
                INSERT INTO showroom
                    (design_id, collection_id, title, description, image_url, model_url,
                     tags, vision_score, created_at)
                VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,NOW())
                RETURNING id
            """,
                design_id,
                collection_id,
                brief.get("title", "Untitled Design"),
                brief.get("style", ""),
                image_url,
                model_url,
                json.dumps(top_tags),
                raw_score,
            )

            product_item_id = f"design-{design_id}"

            await conn.execute("""
                INSERT INTO product_catalog
                    (item_id, name, description, price, category, tags, is_active, collection_id, created_at)
                VALUES ($1, $2, $3, $4, $5, $6::jsonb, TRUE, $7, NOW())
                ON CONFLICT (item_id) DO UPDATE SET
                    name          = EXCLUDED.name,
                    description   = EXCLUDED.description,
                    category      = EXCLUDED.category,
                    tags          = EXCLUDED.tags,
                    is_active     = TRUE,
                    collection_id = EXCLUDED.collection_id
            """,
                product_item_id,
                brief.get("title", "AI Design"),
                brief.get("style", ""),
                "N/A",
                brief.get("category", "apparel"),
                json.dumps(top_tags),
                collection_id,
            )
            print(
                f"[PUBLISH] ✓ Showroom #{showroom_id} | "
                f"product_catalog item={product_item_id} | "
                f"collection={collection_id} | is_active=TRUE"
            )

    return {
        "design_id":     design_id,
        "showroom_id":   showroom_id,
        "collection_id": collection_id,
        "status":        status,
        "publishable":   publishable,
        "image_url":     image_url,
        "model_url":     model_url,
        "title":         brief.get("title"),
        "score":         raw_score,
        "cycle_number":  cycle_number,
    }


# ══════════════════════════════════════════════════════════════════════════════
# SINGLE DESIGN PIPELINE (image → 3D → upload → score → publish)
# ══════════════════════════════════════════════════════════════════════════════

async def process_single_design(
    pool,
    brief: Dict,
    top_signals: List[Dict],
    semaphore: asyncio.Semaphore,
    design_number: int,
    total_designs: int,
    cycle_number: int,
    collection_id: Optional[int] = None,
) -> Optional[Dict]:
    """End-to-end pipeline for one brief. Returns result dict or None on failure."""
    title = brief.get("title", f"Design #{design_number}")
    print(f"\n[DESIGN {design_number}/{total_designs}] ── {title} "
          f"(cycle #{cycle_number}, collection #{collection_id}) ──")

    # 5. Image
    image_bytes = await generate_image(brief, semaphore)
    if not image_bytes:
        print(f"[DESIGN {design_number}] ✗ Image generation failed — recording as rejected")
        async with pool.acquire() as conn:
            await conn.execute("""
                INSERT INTO generated_designs
                    (cycle_number, collection_id, prompt_used, brief_json, status, created_at)
                VALUES ($1,$2,$3,$4::jsonb,'rejected',NOW())
            """, cycle_number, collection_id,
                 brief.get("stability_prompt", ""),
                 json.dumps({k: v for k, v in brief.items() if not k.startswith("_")}))
        return None

    # 6. 3D model (non-fatal if it fails)
    glb_bytes = await generate_3d_model(image_bytes, title)
    if not glb_bytes:
        print(f"[DESIGN {design_number}] ⚠ 3D failed — continuing image-only")

    # 7. Upload
    upload_result = await upload_to_supabase(image_bytes, glb_bytes, cycle_number)
    if not upload_result.get("image_url"):
        print(f"[DESIGN {design_number}] ✗ Upload failed — aborting this design")
        return None

    # 8. Score
    score = await score_image_with_vision(image_bytes, upload_result["image_url"], brief)

    # 9. Persist + publish
    result = await persist_and_publish(
        pool, brief, upload_result, score, top_signals, cycle_number, collection_id
    )

    # Store brief embedding for future dedup (all cycles)
    await store_brief_embedding(pool, brief, cycle_number)

    return result


# ══════════════════════════════════════════════════════════════════════════════
# STEP 10 — DIVERSITY REPORT
# ══════════════════════════════════════════════════════════════════════════════

def log_diversity_report(results: List[Dict], briefs_accepted: int, briefs_rejected_dedup: int):
    log_sep("DIVERSITY REPORT")
    successful  = [r for r in results if r]
    published   = [r for r in successful if r.get("publishable")]
    scored_only = [r for r in successful if not r.get("publishable")]
    failed      = results.count(None)
    scores      = [r["score"] for r in successful if r.get("score") is not None]

    avg_score = sum(scores) / len(scores) if scores else 0
    print(f"  Briefs generated (accepted) : {briefs_accepted}")
    print(f"  Briefs rejected (dedup)     : {briefs_rejected_dedup}")
    print(f"  Designs attempted           : {len(results)}")
    print(f"  Designs successful          : {len(successful)}")
    print(f"  Published to showroom       : {len(published)}")
    print(f"  Scored only (below gate)    : {len(scored_only)}")
    print(f"  Failed (image/upload error) : {failed}")
    print(f"  Average vision score        : {avg_score:.2f}/10")
    if scores:
        print(f"  Score range                 : {min(scores):.1f} – {max(scores):.1f}")


# ══════════════════════════════════════════════════════════════════════════════
# MAIN ENTRY POINT
# ══════════════════════════════════════════════════════════════════════════════

async def run_design_agent(pool, designs_needed: int = MAX_DESIGNS_PER_CYCLE) -> Optional[Dict]:
    """
    Full pipeline for generating up to `designs_needed` unique 3D fashion designs.

    FIX C (SINGLE PIPELINE): aggregate_signals() reads ONLY from the already-
    normalized design_signals table. main.py's run_feedback_loop_processor() is
    the sole event consumer and signal writer.

    FIX B: get_or_create_cycle_collection() called once at start; collection_id
    propagated to every generated_designs, showroom, and product_catalog row.
    product_catalog upserted with is_active=TRUE (ON CONFLICT DO UPDATE).

    FIX D (REVISED): generate_brief_batch() → _assemble_brief_context() now
    uses _vector_search_memory() (semantic cosine similarity re-ranking) for
    all five memory types (trend, feedback_summary, rag_context, design_brief,
    design_signal), replacing the original recency-only SQL ORDER BY created_at.
    The semantic query is derived from the current top signal tags so that
    context retrieved is maximally relevant to what audiences care about now.

    DEDUP: load_cycle_embeddings() loads current cycle + all history (capped at
    200) to prevent cross-cycle duplicate designs.
    """
    log_sep(f"DESIGN COORDINATION AGENT — {datetime.utcnow().isoformat()}Z")
    print(f"[AGENT] Designs needed this run  : {designs_needed}")
    print(f"[AGENT] Batch brief size         : {BATCH_BRIEF_SIZE}")
    print(f"[AGENT] Min cosine distance      : {MIN_COSINE_DISTANCE}")
    print(f"[AGENT] Max concurrent images    : {MAX_CONCURRENT_IMAGES}")
    print(f"[AGENT] Vision pass score        : {VISION_PASS_SCORE}")
    print(f"[AGENT] Vector search pool size  : {VECTOR_SEARCH_POOL_SIZE}")
    print(f"[AGENT] Vector search min sim    : {VECTOR_SEARCH_MIN_SIM}")
    print(
        f"[AGENT] Signal pipeline          : reading design_signals table "
        f"(written by main.py run_feedback_loop_processor — single normalized hub)"
    )
    print(
        f"[AGENT] Context assembly         : vector similarity search via "
        f"_vector_search_memory() (FIX D revised — no recency SQL)"
    )

    if designs_needed <= 0:
        print("[AGENT] designs_needed=0 — nothing to do.")
        return {"total_attempted": 0, "total_successful": 0, "total_published": 0,
                "briefs_accepted": 0, "briefs_rejected_dedup": 0, "designs": []}

    try:
        # ── Resolve cycle and collection ──────────────────────────────────────
        cycle_number = await get_or_create_active_cycle(pool)
        print(f"[AGENT] Active cycle number      : #{cycle_number}")

        collection_id = await get_or_create_cycle_collection(pool, cycle_number)
        print(f"[AGENT] Active collection id     : #{collection_id}")

        # ── Step 1: Signals ───────────────────────────────────────────────────
        signals = await aggregate_signals(pool)
        if not signals:
            print(
                "[AGENT] No signals found. design_signals is empty AND "
                "memory_entries has no trend data. Run the scraping pipeline first "
                "or trigger POST /events/feedback-loop/run after some interactions."
            )
            return None

        top_score = signals[0]["total_score"] if signals else 0
        if top_score < DESIGN_MIN_SIGNAL:
            print(f"[AGENT] ✗ Top signal {top_score} < minimum {DESIGN_MIN_SIGNAL}. Aborting.")
            return None

        # ── Load cycle's existing embeddings + history ────────────────────────
        existing_embeddings = await load_cycle_embeddings(pool, cycle_number)

        # ── Tracking ──────────────────────────────────────────────────────────
        used_combos: Set[str]       = set()
        session_embeddings          = list(existing_embeddings)
        all_results: List[Dict]     = []
        designs_completed           = 0
        briefs_accepted_total       = 0
        briefs_rejected_dedup_total = 0
        semaphore = asyncio.Semaphore(MAX_CONCURRENT_IMAGES)

        print(f"[AGENT] Starting generation — will attempt {designs_needed} designs for cycle #{cycle_number}")

        # ── Main loop ─────────────────────────────────────────────────────────
        while designs_completed < designs_needed:
            batch_size = min(BATCH_BRIEF_SIZE, designs_needed - designs_completed)
            batch_idx  = designs_completed // BATCH_BRIEF_SIZE

            log_sec(f"BATCH {batch_idx + 1} | completed={designs_completed}/{designs_needed}")

            seeds = build_diversity_seeds(batch_size, used_combos)
            if not seeds:
                print("[AGENT] ✗ Could not build more unique seeds — stopping.")
                break

            # FIX D (REVISED): brief generation via vector-search context assembler
            raw_briefs = await generate_brief_batch(pool, signals, seeds, batch_idx)
            if not raw_briefs:
                print("[AGENT] ✗ Brief batch failed — stopping run.")
                break

            # Deduplication
            accepted_briefs, session_embeddings = await deduplicate_briefs(
                raw_briefs, session_embeddings, min_distance=MIN_COSINE_DISTANCE,
            )
            briefs_accepted_total       += len(accepted_briefs)
            briefs_rejected_dedup_total += (len(raw_briefs) - len(accepted_briefs))

            if not accepted_briefs:
                print("[AGENT] All briefs in batch rejected by dedup — trying new seeds")
                continue

            for i, brief in enumerate(accepted_briefs):
                if designs_completed >= designs_needed:
                    break

                result = await process_single_design(
                    pool, brief, signals[:8], semaphore,
                    design_number=designs_completed + 1,
                    total_designs=designs_needed,
                    cycle_number=cycle_number,
                    collection_id=collection_id,
                )

                if result is None:
                    print(f"[AGENT] ✗ Design failed — halting run to prevent cascade errors.")
                    log_diversity_report(all_results, briefs_accepted_total, briefs_rejected_dedup_total)
                    return {
                        "cycle_number":          cycle_number,
                        "collection_id":         collection_id,
                        "total_attempted":       len(all_results) + 1,
                        "total_successful":      len([r for r in all_results if r]),
                        "total_published":       len([r for r in all_results if r and r.get("publishable")]),
                        "briefs_accepted":       briefs_accepted_total,
                        "briefs_rejected_dedup": briefs_rejected_dedup_total,
                        "designs":               [r for r in all_results if r],
                        "stopped_early":         True,
                        "stop_reason":           "design_generation_failed",
                    }

                all_results.append(result)
                designs_completed += 1

            print(f"[BATCH {batch_idx+1}] ✓ {designs_completed}/{designs_needed} completed so far")

            if designs_completed < designs_needed:
                await asyncio.sleep(3)

        # ── Final Report ──────────────────────────────────────────────────────
        log_diversity_report(all_results, briefs_accepted_total, briefs_rejected_dedup_total)

        successful = [r for r in all_results if r]
        published  = [r for r in successful if r.get("publishable")]

        log_sep(
            f"DESIGN AGENT DONE — cycle #{cycle_number} | collection #{collection_id} | "
            f"{len(successful)}/{designs_needed} designs processed | "
            f"{len(published)} published | "
            f"{briefs_rejected_dedup_total} dedup-rejected"
        )

        return {
            "cycle_number":          cycle_number,
            "collection_id":         collection_id,
            "total_attempted":       len(all_results),
            "total_successful":      len(successful),
            "total_published":       len(published),
            "briefs_accepted":       briefs_accepted_total,
            "briefs_rejected_dedup": briefs_rejected_dedup_total,
            "designs":               successful,
            "stopped_early":         False,
        }

    except Exception as e:
        print(f"[AGENT] ✗ Fatal: {type(e).__name__}: {e}")
        import traceback
        traceback.print_exc()
        return None






