import os
import sys
import asyncio
import threading
import re
import string
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Header, Request, Depends
import asyncpg
import httpx
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from fastapi.middleware.cors import CORSMiddleware

try:
    from playwright.async_api import async_playwright
except ImportError:
    # Playwright is only used by the news-scraping design agent, which is not part
    # of the production web API. It's excluded from requirements.txt to keep the
    # container image slim (it pulls ~400 MB of browser binaries and needs a
    # separate `playwright install` step). The scrape code path below checks for
    # None and raises a clear error if invoked without it.
    async_playwright = None
from typing import List, Dict, Any, Set, Optional
from pydantic import BaseModel
from passlib.context import CryptContext
from jose import JWTError, jwt
import secrets
from urllib.parse import urljoin, urlparse
import random
import json
import math
import stripe
from datetime import timezone

# ── Email / OTP imports ────────────────────────────────────────────────────────
import smtplib
import ssl
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

load_dotenv(override=True)
print("[BOOT] .env loaded")

from design_agent import run_design_agent, mark_cycle_complete, get_current_cycle_number

POSTGRESQL_URI        = os.getenv("POSTGRESQL_URI")
OPENAI_API_KEY        = os.getenv("OPENAI_API_KEY")
PEXELS_API_KEY        = os.getenv("PEXELS_API_KEY")
SCRAPE_INTERVAL_HOURS = int(os.getenv("SCRAPE_INTERVAL_HOURS", 1))
MIN_SOURCE_ARTICLES   = int(os.getenv("MIN_SOURCE_ARTICLES",   1))
MAX_PER_SOURCE        = int(os.getenv("MAX_PER_SOURCE",        1))
CANDIDATE_LIMIT       = int(os.getenv("CANDIDATE_LIMIT",       40))
MAX_SCRAPE_RETRIES    = int(os.getenv("MAX_SCRAPE_RETRIES",     5))
RETRY_DELAY_SECONDS   = int(os.getenv("RETRY_DELAY_SECONDS",  30))
URL_REUSE_DAYS        = int(os.getenv("URL_REUSE_DAYS",        7))

CIA_MIN_TRENDS          = int(os.getenv("CIA_MIN_TRENDS",          3))
CIA_MIN_DESIGNS         = int(os.getenv("CIA_MIN_DESIGNS",        150))
CIA_MIN_SCORED_DESIGNS  = int(os.getenv("CIA_MIN_SCORED_DESIGNS", 100))
CIA_MIN_SHOWROOM_ITEMS  = int(os.getenv("CIA_MIN_SHOWROOM_ITEMS",   1))
CIA_MIN_VOTES           = int(os.getenv("CIA_MIN_VOTES",            1))
CIA_MIN_FEEDBACK_ITEMS  = int(os.getenv("CIA_MIN_FEEDBACK_ITEMS",   1))

JWT_SECRET      = os.getenv("JWT_SECRET", secrets.token_hex(32))
JWT_ALGORITHM   = "HS256"
JWT_EXPIRE_DAYS = int(os.getenv("JWT_EXPIRE_DAYS", 7))

# ── Proxy voting scheduling policy ─────────────────────────────────────────────
PROXY_VOTE_INTERVAL_HOURS = int(os.getenv("PROXY_VOTE_INTERVAL_HOURS", 24))
PROXY_VOTE_INTERVAL_MINUTES = int(os.getenv("PROXY_VOTE_INTERVAL_MINUTES", PROXY_VOTE_INTERVAL_HOURS * 60))

STRIPE_SECRET_KEY     = os.getenv("STRIPE_SECRET_KEY")
STRIPE_WEBHOOK_SECRET = os.getenv("STRIPE_WEBHOOK_SECRET")
STRIPE_PRICE_PREMIUM_MONTHLY = os.getenv("STRIPE_PRICE_PREMIUM_MONTHLY")  # Optional default Stripe Price ID
FREE_DEMO_MODE        = os.getenv("FREE_DEMO_MODE", "false").lower() == "true"  # Demo mode: premium features free
# FRONTEND_URL          = os.getenv("FRONTEND_URL", "https://giamvpv1.infinityquantumsolutions.com")
FRONTEND_URL          = os.getenv("FRONTEND_URL", "http://localhost:5173")

# ── CORS configuration (environment-specific allowed origins) ──────────────────
ALLOWED_ORIGINS = os.getenv("ALLOWED_ORIGINS", FRONTEND_URL).split(",")
ALLOWED_ORIGINS = [origin.strip() for origin in ALLOWED_ORIGINS if origin.strip()]
if not ALLOWED_ORIGINS:
    ALLOWED_ORIGINS = [FRONTEND_URL]

# ── Admin bootstrap secret (from environment ONLY — never hardcoded) ──────────
ADMIN_BOOTSTRAP_SECRET = os.getenv("ADMIN_BOOTSTRAP_SECRET")
if not ADMIN_BOOTSTRAP_SECRET:
    print("⚠️  ADMIN_BOOTSTRAP_SECRET not set — admin bootstrap is DISABLED. Set this in .env to use the bootstrap script.")

# ── GSNowGPT free-tier daily message limit ────────────────────────────────────
GPT_FREE_DAILY_LIMIT = int(os.getenv("GPT_FREE_DAILY_LIMIT", 10))   # Free users: N msgs/day
GPT_PAID_HOURLY_LIMIT = int(os.getenv("GPT_PAID_HOURLY_LIMIT", 200)) # Paid users: effectively unlimited
RATE_LIMIT_REQUESTS = {}  # In-memory rate limit tracking: {(ip, endpoint): [timestamps]}
RATE_LIMIT_WINDOW_SECONDS = 3600  # 1 hour window
RATE_LIMIT_MAX_REQUESTS = 5  # Max 5 requests per endpoint per hour

# ── Gmail / OTP config ─────────────────────────────────────────────────────────
GMAIL_SENDER_EMAIL    = os.getenv("GMAIL_SENDER_EMAIL")
GMAIL_APP_PASSWORD    = os.getenv("GMAIL_APP_PASSWORD")
OTP_EXPIRE_MINUTES    = int(os.getenv("OTP_EXPIRE_MINUTES", 10))
REQUIRE_EMAIL_VERIFICATION = os.getenv("REQUIRE_EMAIL_VERIFICATION", "true").lower() == "true"

if not GMAIL_SENDER_EMAIL or not GMAIL_APP_PASSWORD:
    print("⚠️  GMAIL_SENDER_EMAIL / GMAIL_APP_PASSWORD not set — email OTP will fail!")

if not STRIPE_SECRET_KEY:
    print("⚠️ STRIPE_SECRET_KEY is not set in .env — Stripe payments will fail!")

stripe.api_key = STRIPE_SECRET_KEY

# MVP – Stripe and secrets (Item 4): Production-safe secret handling
# CRITICAL: Key rotation policy – rotate Stripe keys quarterly via ADMIN_BOOTSTRAP_SECRET management
# TODO: Implement vault integration (e.g., HashiCorp Vault, AWS Secrets Manager) for production
if STRIPE_SECRET_KEY:
    env_mode = os.getenv('ENVIRONMENT', 'development').lower()
    if STRIPE_SECRET_KEY.startswith("sk_test_"):
        if env_mode == 'production':
            raise RuntimeError(
                "[FATAL] Test Stripe key (sk_test_*) detected in PRODUCTION environment. "
                "Set STRIPE_SECRET_KEY to a valid sk_live_* key immediately."
            )
        print("⚠️  STRIPE_SECRET_KEY is a TEST key — payments will not charge real cards.")
    elif STRIPE_SECRET_KEY.startswith("sk_live_"):
        print("✅ STRIPE_SECRET_KEY is a LIVE key — real payments enabled. [Key rotation: quarterly]")
    else:
        print("⚠️  STRIPE_SECRET_KEY format unrecognised — verify before going live.")
    # NOTE: For PCI compliance, never log or transmit full key. Key is only used locally.
else:
    if os.getenv('ENVIRONMENT', 'development').lower() == 'production' and not FREE_DEMO_MODE:
        raise RuntimeError("[FATAL] STRIPE_SECRET_KEY is REQUIRED in production environment (unless FREE_DEMO_MODE=true).")

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

print(f"""
[BOOT] Configuration:
  POSTGRESQL_URI        = {'SET ✓' if POSTGRESQL_URI else 'MISSING ✗'}
  SCRAPE_INTERVAL_HOURS = {SCRAPE_INTERVAL_HOURS}
  MIN_SOURCE_ARTICLES   = {MIN_SOURCE_ARTICLES}
  MAX_PER_SOURCE        = {MAX_PER_SOURCE}
  CANDIDATE_LIMIT       = {CANDIDATE_LIMIT}
  MAX_SCRAPE_RETRIES    = {MAX_SCRAPE_RETRIES}
  RETRY_DELAY_SECONDS   = {RETRY_DELAY_SECONDS}
  URL_REUSE_DAYS        = {URL_REUSE_DAYS}
  OPENAI_API_KEY        = {'SET ✓' if OPENAI_API_KEY else 'MISSING ✗'}
  PEXELS_API_KEY        = {'SET ✓' if PEXELS_API_KEY else 'MISSING ✗'}
  JWT_SECRET            = {'SET ✓' if os.getenv('JWT_SECRET') else 'AUTO-GENERATED (set in .env for persistence)'}
  GMAIL_SENDER_EMAIL    = {'SET ✓' if GMAIL_SENDER_EMAIL else 'MISSING ✗'}
  GMAIL_APP_PASSWORD    = {'SET ✓' if GMAIL_APP_PASSWORD else 'MISSING ✗'}
  OTP_EXPIRE_MINUTES    = {OTP_EXPIRE_MINUTES}
  REQUIRE_EMAIL_VERIFICATION = {REQUIRE_EMAIL_VERIFICATION}
  CIA_MIN_TRENDS        = {CIA_MIN_TRENDS}
  CIA_MIN_DESIGNS       = {CIA_MIN_DESIGNS}
  CIA_MIN_SCORED_DESIGNS= {CIA_MIN_SCORED_DESIGNS}
  CIA_MIN_SHOWROOM_ITEMS= {CIA_MIN_SHOWROOM_ITEMS}
  CIA_MIN_VOTES         = {CIA_MIN_VOTES}
  CIA_MIN_FEEDBACK_ITEMS= {CIA_MIN_FEEDBACK_ITEMS}
  GPT_FREE_DAILY_LIMIT  = {GPT_FREE_DAILY_LIMIT}
  GPT_PAID_HOURLY_LIMIT = {GPT_PAID_HOURLY_LIMIT}
  FREE_DEMO_MODE        = {FREE_DEMO_MODE}
  STRIPE_PRICE_PREMIUM_MONTHLY = {'SET ✓' if STRIPE_PRICE_PREMIUM_MONTHLY else 'NOT SET'}
  REQUIRE_EMAIL_VERIFICATION = {REQUIRE_EMAIL_VERIFICATION}  {"[ENFORCED]" if REQUIRE_EMAIL_VERIFICATION else "[DISABLED - set REQUIRE_EMAIL_VERIFICATION=true in .env for production]"}
  Python version        = {sys.version}
  Platform              = {sys.platform}
""")


# ──────────────────────────────────────────────
# Agent Registry and Execution
# ──────────────────────────────────────────────
class AgentRegistry:
    def __init__(self):
        self.agents = {}

    def register(self, name, triggers, handler):
        self.agents[name] = {
            'triggers': set(triggers),
            'handler': handler,
            'count': 0,
            'last_result': None,
            'last_run': None,
        }

    async def execute_agent_contract(self, name, trigger, *args, **kwargs):
        if name not in self.agents:
            raise ValueError(f"Agent {name} not registered")
        if trigger not in self.agents[name]['triggers']:
            raise ValueError(f"Trigger {trigger} not allowed for agent {name}")
        
        result = await self.agents[name]['handler'](*args, **kwargs)
        self.agents[name]['count'] += 1
        self.agents[name]['last_result'] = result
        self.agents[name]['last_run'] = datetime.now(timezone.utc)
        return result

    def get_status(self, name):
        return self.agents.get(name, {})


# Instantiate registry
agent_registry = AgentRegistry()


# ──────────────────────────────────────────────
# Forum handle generator
# ──────────────────────────────────────────────
def _generate_forum_handle() -> str:
    adjectives = [
        "artistic", "silent", "cosmic", "velvet", "rustic", "minimal", "pastel", "wild",
        "lazy", "classic", "edgy", "sleek", "bold", "muted", "retro", "golden", "crisp",
        "urban", "subtle", "sharp", "raw", "clean", "dark", "bright", "soft", "neon",
        "dusty", "cool", "quiet", "vivid", "sleepy", "local", "vintage", "honest",
    ]
    nouns = [
        "deer", "wolf", "crow", "moth", "fox", "sparrow", "oak", "reef", "stone", "tide",
        "dust", "leaf", "peak", "grove", "cliff", "bloom", "dusk", "mist", "ray", "vale",
        "mode", "look", "drip", "fit", "vibe", "eye", "lens", "cut", "line", "thread",
        "coat", "heel", "seam", "knit", "weave", "stitch", "drape", "fold", "hem",
    ]
    patterns = [
        lambda: f"{random.choice(adjectives)}{random.choice(nouns)}{random.randint(1, 999)}",
        lambda: f"{random.choice(nouns)}_{random.choice(adjectives)}{random.randint(10, 99)}",
        lambda: "".join(random.choices(string.ascii_lowercase, k=random.randint(3, 5))) + f"{random.randint(0, 99):02d}",
        lambda: f"{random.choice(adjectives)}_{random.choice(nouns)}",
        lambda: f"x_{random.choice(nouns)}_{random.choice(adjectives)[:4]}x",
        lambda: f"throwaway_{random.choice(nouns)}{random.randint(10, 999)}",
        lambda: f"{random.choice(adjectives)}{random.randint(1000, 9999)}",
        lambda: f"{random.choice(nouns)}.{random.choice(adjectives)}",
        lambda: f"_{random.choice(adjectives)}{random.choice(nouns)}_",
        lambda: "".join(random.choices(string.ascii_lowercase, k=random.randint(4, 7))),
    ]
    return random.choice(patterns)()


# ──────────────────────────────────────────────
# FastAPI + PostgreSQL connection pool
# ──────────────────────────────────────────────
app = FastAPI(title="GIA AI Blog Backend")

# CORS hardening (Security A): Restrict to minimal required methods and headers
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    # Allow only GET, POST, OPTIONS. PUT/PATCH/DELETE are admin-only and stricter auth applies.
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    # Allow only essential headers; no X-Requested-With (not needed for JSON APIs)
    allow_headers=["Authorization", "Content-Type"],
    expose_headers=["Content-Length", "X-Upgrade-Required", "X-RateLimit-Remaining"],
    max_age=3600,
)

# Register agents
async def dummy_trend_agent():
    return {"message": "Trends scraped"}

async def dummy_style_agent():
    return {"message": "Style generated"}

async def dummy_collection_agent():
    return {"message": "Collection summarized"}

async def dummy_user_prefs_agent():
    return {"message": "User prefs handled"}

async def dummy_proxy_agent():
    return {"message": "Proxy status"}

async def dummy_account_agent():
    return {"message": "Account action"}

async def dummy_query_agent():
    return {"message": "Query retrieved"}

async def dummy_feedback_agent():
    return {"message": "Feedback processed"}

async def dummy_memory_agent():
    return {"message": "Memory updated"}

async def dummy_design_agent():
    return {"message": "Design coordinated"}

async def dummy_cia_agent():
    return {"message": "Integrity checked"}

agent_registry.register("trend_curation", ["scheduler"], dummy_trend_agent)
agent_registry.register("query_retrieval", ["api"], dummy_query_agent)
agent_registry.register("feedback_loop", ["scheduler", "event"], dummy_feedback_agent)
agent_registry.register("memory_rag", ["event", "api"], dummy_memory_agent)
agent_registry.register("design_coordination", ["scheduler"], dummy_design_agent)
agent_registry.register("cycle_integrity", ["scheduler"], dummy_cia_agent)
agent_registry.register("gsnowgpt_orchestration", ["api"], dummy_query_agent)  # placeholder
agent_registry.register("proxy_voting", ["scheduler"], dummy_proxy_agent)

_pool: asyncpg.Pool = None


async def get_pool() -> asyncpg.Pool:
    global _pool
    if _pool is None:
        raise RuntimeError("Database pool not initialized")
    return _pool


async def init_db(pool: asyncpg.Pool):
    """Create all tables, indexes, and seed data."""
    async with pool.acquire() as conn:

        await conn.execute("""
            CREATE TABLE IF NOT EXISTS blog_articles (
                id           BIGSERIAL PRIMARY KEY,
                slug         TEXT UNIQUE NOT NULL,
                title        TEXT NOT NULL,
                excerpt      TEXT,
                body         TEXT,
                image_url    TEXT,
                tags         JSONB DEFAULT '[]',
                trends       JSONB DEFAULT '[]',
                article_urls JSONB DEFAULT '[]',
                sources      JSONB DEFAULT '[]',
                created_at   TIMESTAMPTZ DEFAULT NOW()
            );

            CREATE TABLE IF NOT EXISTS trends (
                id              BIGSERIAL PRIMARY KEY,
                title           TEXT NOT NULL,
                description     TEXT,
                related_tags    JSONB DEFAULT '[]',
                source_articles JSONB DEFAULT '[]',
                created_at      TIMESTAMPTZ DEFAULT NOW()
            );

            CREATE TABLE IF NOT EXISTS memory_entries (
                id         BIGSERIAL PRIMARY KEY,
                type       TEXT NOT NULL,
                content    TEXT NOT NULL,
                payload    JSONB DEFAULT '{}',
                embedding  JSONB DEFAULT '[]',
                created_at TIMESTAMPTZ DEFAULT NOW()
            );

            CREATE TABLE IF NOT EXISTS scraped_urls (
                id           BIGSERIAL PRIMARY KEY,
                url          TEXT UNIQUE NOT NULL,
                last_scraped TIMESTAMPTZ DEFAULT NOW()
            );

            CREATE TABLE IF NOT EXISTS users (
                id            BIGSERIAL PRIMARY KEY,
                first_name    TEXT NOT NULL,
                last_name     TEXT NOT NULL,
                email         TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                is_admin      BOOLEAN DEFAULT FALSE,
                email_verified BOOLEAN DEFAULT FALSE,
                created_at    TIMESTAMPTZ DEFAULT NOW()
            );

            CREATE TABLE IF NOT EXISTS article_comments (
                id         BIGSERIAL PRIMARY KEY,
                article_id BIGINT NOT NULL REFERENCES blog_articles(id) ON DELETE CASCADE,
                user_id    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                text       TEXT NOT NULL,
                created_at TIMESTAMPTZ DEFAULT NOW()
            );

            CREATE TABLE IF NOT EXISTS article_likes (
                id         BIGSERIAL PRIMARY KEY,
                article_id BIGINT NOT NULL,
                user_id    BIGINT NOT NULL,
                created_at TIMESTAMPTZ DEFAULT NOW(),
                UNIQUE(article_id, user_id)
            );

            CREATE TABLE IF NOT EXISTS user_proxy_settings (
                user_id      BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
                enabled      BOOLEAN DEFAULT FALSE,
                next_run_at  TIMESTAMPTZ,
                last_run_at  TIMESTAMPTZ,
                updated_at   TIMESTAMPTZ DEFAULT NOW()
            );

            CREATE TABLE IF NOT EXISTS admin_audit_log (
                id          BIGSERIAL PRIMARY KEY,
                user_id     BIGINT REFERENCES users(id) ON DELETE SET NULL,
                action      TEXT NOT NULL,
                endpoint    TEXT NOT NULL,
                details     TEXT,
                created_at  TIMESTAMPTZ DEFAULT NOW()
            );
            CREATE INDEX IF NOT EXISTS idx_admin_audit_log_user_id ON admin_audit_log(user_id);
            CREATE INDEX IF NOT EXISTS idx_admin_audit_log_created_at ON admin_audit_log(created_at DESC);

            CREATE TABLE IF NOT EXISTS proxy_preferences (
                user_id                         BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
                aesthetic_minimalist_weight     FLOAT DEFAULT 50.0,
                aesthetic_bold_weight           FLOAT DEFAULT 50.0,
                aesthetic_eclectic_weight       FLOAT DEFAULT 50.0,
                material_luxury_weight          FLOAT DEFAULT 50.0,
                material_sustainable_weight     FLOAT DEFAULT 50.0,
                material_experimental_weight    FLOAT DEFAULT 50.0,
                silhouette_fitted_weight        FLOAT DEFAULT 50.0,
                silhouette_relaxed_weight       FLOAT DEFAULT 50.0,
                silhouette_structured_weight    FLOAT DEFAULT 50.0,
                design_classic_weight           FLOAT DEFAULT 50.0,
                design_trendy_weight            FLOAT DEFAULT 50.0,
                design_avant_garde_weight       FLOAT DEFAULT 50.0,
                category_apparel_weight         FLOAT DEFAULT 50.0,
                category_accessories_weight     FLOAT DEFAULT 50.0,
                category_footwear_weight        FLOAT DEFAULT 50.0,
                category_jewelry_weight         FLOAT DEFAULT 50.0,
                updated_at                      TIMESTAMPTZ DEFAULT NOW()
            );

            CREATE TABLE IF NOT EXISTS proxy_vote_explanations (
                id                              BIGSERIAL PRIMARY KEY,
                vote_id                         BIGINT REFERENCES item_votes(id) ON DELETE CASCADE,
                product_id                      TEXT NOT NULL,
                user_id                         BIGINT REFERENCES users(id) ON DELETE CASCADE,
                preference_score                FLOAT,
                history_score                   FLOAT,
                combined_score                  FLOAT,
                matched_preferences             TEXT[],
                matched_tags                    TEXT[],
                boosted_by                      TEXT[],
                penalty_applied                 TEXT,
                tie_break_reason                TEXT,
                score_computation_method        TEXT,
                -- FIX F: persist full explanation JSON for audit
                full_explanation_json           JSONB DEFAULT '{}',
                created_at                      TIMESTAMPTZ DEFAULT NOW()
            );
            CREATE INDEX IF NOT EXISTS idx_proxy_vote_explanations_user_id ON proxy_vote_explanations(user_id);
            CREATE INDEX IF NOT EXISTS idx_proxy_vote_explanations_vote_id ON proxy_vote_explanations(vote_id);
            CREATE INDEX IF NOT EXISTS idx_proxy_vote_explanations_created_at ON proxy_vote_explanations(created_at DESC);

            CREATE TABLE IF NOT EXISTS product_catalog (
                item_id       TEXT PRIMARY KEY,
                name          TEXT NOT NULL,
                description   TEXT,
                price         TEXT,
                category      TEXT,
                tags          JSONB DEFAULT '[]',
                is_active     BOOLEAN DEFAULT TRUE,
                collection_id BIGINT,
                created_at    TIMESTAMPTZ DEFAULT NOW()
            );

            CREATE TABLE IF NOT EXISTS item_votes (
                id         BIGSERIAL PRIMARY KEY,
                item_id    TEXT NOT NULL,
                user_id    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                created_at TIMESTAMPTZ DEFAULT NOW(),
                UNIQUE(item_id, user_id)
            );

            -- FIX F: Add vote_explanation JSONB column for proxy vote explanations
            ALTER TABLE item_votes ADD COLUMN IF NOT EXISTS vote_explanation JSONB DEFAULT '{}';

            CREATE TABLE IF NOT EXISTS design_signals (
                id              BIGSERIAL PRIMARY KEY,
                tag             TEXT NOT NULL UNIQUE,
                category        TEXT,
                vote_score      INT DEFAULT 0,
                like_score      INT DEFAULT 0,
                comment_score   INT DEFAULT 0,
                trend_score     INT DEFAULT 0,
                total_score     INT DEFAULT 0,
                computed_at     TIMESTAMPTZ DEFAULT NOW()
            );

            CREATE TABLE IF NOT EXISTS design_cycles (
                cycle_number  INT PRIMARY KEY,
                started_at    TIMESTAMPTZ DEFAULT NOW(),
                completed_at  TIMESTAMPTZ
            );

            CREATE TABLE IF NOT EXISTS generated_designs (
                id              BIGSERIAL PRIMARY KEY,
                cycle_number    INT NOT NULL DEFAULT 1,
                prompt_used     TEXT NOT NULL,
                brief_json      JSONB DEFAULT '{}',
                image_url       TEXT,
                model_url       TEXT,
                score_json      JSONB DEFAULT '{}',
                publishable     BOOLEAN DEFAULT FALSE,
                published_at    TIMESTAMPTZ,
                top_tags        JSONB DEFAULT '[]',
                status          TEXT DEFAULT 'pending',
                created_at      TIMESTAMPTZ DEFAULT NOW()
            );

            CREATE TABLE IF NOT EXISTS showroom (
                id              BIGSERIAL PRIMARY KEY,
                design_id       BIGINT NOT NULL REFERENCES generated_designs(id) ON DELETE CASCADE,
                title           TEXT NOT NULL,
                description     TEXT,
                image_url       TEXT NOT NULL,
                model_url       TEXT,
                tags            JSONB DEFAULT '[]',
                vision_score    FLOAT,
                likes           INT DEFAULT 0,
                created_at      TIMESTAMPTZ DEFAULT NOW()
            );

            CREATE TABLE IF NOT EXISTS cycle_integrity_log (
                id              BIGSERIAL PRIMARY KEY,
                run_at          TIMESTAMPTZ DEFAULT NOW(),
                cycle_number    INT NOT NULL DEFAULT 1,
                gate_results    JSONB DEFAULT '{}',
                overall_status  TEXT NOT NULL,
                action_taken    TEXT,
                notes           TEXT
            );
        """)

        # ── OTP pending registrations table ────────────────────────────────────
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS email_otps (
                id           BIGSERIAL PRIMARY KEY,
                email        TEXT NOT NULL,
                otp_code     TEXT NOT NULL,
                first_name   TEXT NOT NULL,
                last_name    TEXT NOT NULL,
                password_hash TEXT NOT NULL,
                expires_at   TIMESTAMPTZ NOT NULL,
                used         BOOLEAN DEFAULT FALSE,
                created_at   TIMESTAMPTZ DEFAULT NOW()
            );
            CREATE INDEX IF NOT EXISTS idx_email_otps_email      ON email_otps(email);
            CREATE INDEX IF NOT EXISTS idx_email_otps_expires_at ON email_otps(expires_at);
        """)

        await conn.execute("""
            CREATE TABLE IF NOT EXISTS user_subscriptions (
                id                     BIGSERIAL PRIMARY KEY,
                user_id                BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                stripe_session_id      TEXT UNIQUE NOT NULL,
                stripe_subscription_id TEXT UNIQUE,
                plan_name              TEXT,
                status                 TEXT DEFAULT 'active',
                started_at             TIMESTAMPTZ,
                ends_at                TIMESTAMPTZ,
                created_at             TIMESTAMPTZ DEFAULT NOW(),
                updated_at             TIMESTAMPTZ DEFAULT NOW()
            );
        """)

        await conn.execute("ALTER TABLE user_subscriptions ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ;")
        await conn.execute("ALTER TABLE user_subscriptions ADD COLUMN IF NOT EXISTS ends_at TIMESTAMPTZ;")
        # FIX B: Ensure is_active exists on product_catalog for active-item enforcement
        await conn.execute("ALTER TABLE product_catalog ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;")
        # FIX B: Ensure collection_id exists on product_catalog
        await conn.execute("ALTER TABLE product_catalog ADD COLUMN IF NOT EXISTS collection_id BIGINT;")
        # Account lifecycle: email_verified column
        await conn.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT FALSE;")

        await conn.execute("""
            CREATE TABLE IF NOT EXISTS ai_comments (
                id         BIGSERIAL PRIMARY KEY,
                article_id BIGINT NOT NULL REFERENCES blog_articles(id) ON DELETE CASCADE,
                user_name  TEXT NOT NULL,
                text       TEXT NOT NULL,
                time_label TEXT NOT NULL,
                created_at TIMESTAMPTZ DEFAULT NOW(),
                UNIQUE(article_id, user_name, text)
            )
        """)

        await conn.execute("""
            CREATE TABLE IF NOT EXISTS user_collections (
                id         BIGSERIAL PRIMARY KEY,
                user_id    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                item_id    TEXT NOT NULL,
                model_url  TEXT,
                image_url  TEXT,
                added_at   TIMESTAMPTZ DEFAULT NOW(),
                UNIQUE(user_id, item_id)
            );
        """)

        await conn.execute("""
            CREATE TABLE IF NOT EXISTS source_rotation_state (
                id               INT PRIMARY KEY DEFAULT 1,
                last_used_source TEXT,
                updated_at       TIMESTAMPTZ DEFAULT NOW(),
                CONSTRAINT single_row CHECK (id = 1)
            );
        """)

        await conn.execute("""
            INSERT INTO source_rotation_state (id, last_used_source, updated_at)
            VALUES (1, NULL, NOW())
            ON CONFLICT (id) DO NOTHING;
        """)

        # ── FIX B: Collections table (collection-driven domain) ────────────────
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS collections (
                id           BIGSERIAL PRIMARY KEY,
                name         TEXT NOT NULL,
                description  TEXT,
                lifecycle    TEXT NOT NULL DEFAULT 'draft',
                cycle_number INT,
                created_at   TIMESTAMPTZ DEFAULT NOW(),
                published_at TIMESTAMPTZ,
                archived_at  TIMESTAMPTZ
            );
            CREATE INDEX IF NOT EXISTS idx_collections_lifecycle ON collections(lifecycle);
            CREATE INDEX IF NOT EXISTS idx_collections_cycle_number ON collections(cycle_number);
        """)

        await conn.execute("""
            ALTER TABLE generated_designs ADD COLUMN IF NOT EXISTS collection_id BIGINT REFERENCES collections(id);
            ALTER TABLE showroom          ADD COLUMN IF NOT EXISTS collection_id BIGINT REFERENCES collections(id);
        """)

        # ── FIX C: Canonical interaction events table ──────────────────────────
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS interaction_events (
                id           BIGSERIAL PRIMARY KEY,
                event_type   TEXT NOT NULL,
                user_id      BIGINT REFERENCES users(id) ON DELETE SET NULL,
                entity_id    TEXT,
                entity_type  TEXT,
                payload      JSONB DEFAULT '{}',
                processed_at TIMESTAMPTZ,   -- NULL = unprocessed; set by feedback loop
                created_at   TIMESTAMPTZ DEFAULT NOW()
            );
            CREATE INDEX IF NOT EXISTS idx_interaction_events_type         ON interaction_events(event_type);
            CREATE INDEX IF NOT EXISTS idx_interaction_events_created_at   ON interaction_events(created_at DESC);
            CREATE INDEX IF NOT EXISTS idx_interaction_events_user_id      ON interaction_events(user_id);
            CREATE INDEX IF NOT EXISTS idx_interaction_events_processed_at ON interaction_events(processed_at);
        """)

        # ── FIX A: GSNowGPT chat events log ───────────────────────────────────
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS gsnowgpt_chat_log (
                id            BIGSERIAL PRIMARY KEY,
                session_id    TEXT,
                user_id       BIGINT REFERENCES users(id) ON DELETE SET NULL,
                intent        TEXT,
                user_message  TEXT NOT NULL,
                response_type TEXT,
                response_payload JSONB DEFAULT '{}',
                created_at    TIMESTAMPTZ DEFAULT NOW()
            );
            CREATE INDEX IF NOT EXISTS idx_gsnowgpt_chat_log_session    ON gsnowgpt_chat_log(session_id);
            CREATE INDEX IF NOT EXISTS idx_gsnowgpt_chat_log_user_id    ON gsnowgpt_chat_log(user_id);
            CREATE INDEX IF NOT EXISTS idx_gsnowgpt_chat_log_intent     ON gsnowgpt_chat_log(intent);
            CREATE INDEX IF NOT EXISTS idx_gsnowgpt_chat_log_created_at ON gsnowgpt_chat_log(created_at DESC);
        """)

        print("[DB] ✅ Tables created/verified")

        await conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_scraped_urls_url          ON scraped_urls(url);
            CREATE INDEX IF NOT EXISTS idx_scraped_urls_last_scraped ON scraped_urls(last_scraped);
            CREATE INDEX IF NOT EXISTS idx_blog_articles_created_at  ON blog_articles(created_at DESC);
            CREATE INDEX IF NOT EXISTS idx_trends_created_at         ON trends(created_at DESC);
            CREATE INDEX IF NOT EXISTS idx_memory_created_at         ON memory_entries(created_at DESC);
            CREATE INDEX IF NOT EXISTS idx_users_email               ON users(email);
            CREATE INDEX IF NOT EXISTS idx_comments_article_id       ON article_comments(article_id);
            CREATE INDEX IF NOT EXISTS idx_likes_article_id          ON article_likes(article_id);
            CREATE INDEX IF NOT EXISTS idx_item_votes_item_id        ON item_votes(item_id);
            CREATE INDEX IF NOT EXISTS idx_design_signals_tag        ON design_signals(tag);
            CREATE INDEX IF NOT EXISTS idx_design_signals_total_score ON design_signals(total_score DESC);
            CREATE INDEX IF NOT EXISTS idx_design_signals_computed_at ON design_signals(computed_at DESC);
            CREATE INDEX IF NOT EXISTS idx_design_cycles_cycle_number ON design_cycles(cycle_number DESC);
            CREATE INDEX IF NOT EXISTS idx_design_cycles_completed_at ON design_cycles(completed_at);
            CREATE INDEX IF NOT EXISTS idx_generated_designs_cycle_number ON generated_designs(cycle_number DESC);
            CREATE INDEX IF NOT EXISTS idx_generated_designs_publishable  ON generated_designs(publishable);
            CREATE INDEX IF NOT EXISTS idx_generated_designs_status       ON generated_designs(status);
            CREATE INDEX IF NOT EXISTS idx_generated_designs_collection_id ON generated_designs(collection_id);
            CREATE INDEX IF NOT EXISTS idx_showroom_created_at            ON showroom(created_at DESC);
            CREATE INDEX IF NOT EXISTS idx_showroom_collection_id         ON showroom(collection_id);
            CREATE INDEX IF NOT EXISTS idx_memory_entries_type            ON memory_entries(type);
            CREATE INDEX IF NOT EXISTS idx_cycle_integrity_log_run_at     ON cycle_integrity_log(run_at DESC);
            CREATE INDEX IF NOT EXISTS idx_cycle_integrity_log_cycle_number ON cycle_integrity_log(cycle_number DESC);
            CREATE INDEX IF NOT EXISTS idx_user_collections_user_id ON user_collections(user_id);
            CREATE INDEX IF NOT EXISTS idx_user_collections_item_id ON user_collections(item_id);
            CREATE INDEX IF NOT EXISTS idx_comments_user_id ON article_comments(user_id);
        """)

        print("[DB] ✅ Indexes created")

        await conn.execute("""
            ALTER TABLE blog_articles ADD COLUMN IF NOT EXISTS image_url TEXT;
            ALTER TABLE blog_articles ADD COLUMN IF NOT EXISTS likes INT DEFAULT 0;
            ALTER TABLE generated_designs ADD COLUMN IF NOT EXISTS image_url TEXT;
            ALTER TABLE generated_designs ADD COLUMN IF NOT EXISTS model_url TEXT;
            ALTER TABLE generated_designs ADD COLUMN IF NOT EXISTS score_json JSONB DEFAULT '{}';
            ALTER TABLE generated_designs ADD COLUMN IF NOT EXISTS cycle_number INT DEFAULT 1;
            ALTER TABLE showroom ADD COLUMN IF NOT EXISTS model_url TEXT;
            ALTER TABLE showroom ADD COLUMN IF NOT EXISTS vision_score FLOAT;
            ALTER TABLE cycle_integrity_log ADD COLUMN IF NOT EXISTS cycle_number INT DEFAULT 1;
        """)

        try:
            await conn.execute("ALTER TABLE generated_designs DROP COLUMN IF EXISTS cycle_date;")
        except Exception:
            pass

        try:
            await conn.execute("ALTER TABLE cycle_integrity_log DROP COLUMN IF EXISTS cycle_date;")
        except Exception:
            pass

        # ── item_votes: persist per-vote explanation JSON for full audit ────────
        # Section 5: requirement to persist explanation on each vote row.
        # vote_explanation stores the proxy explanation (or manual vote metadata).
        try:
            await conn.execute(
                "ALTER TABLE item_votes ADD COLUMN IF NOT EXISTS vote_explanation JSONB DEFAULT '{}';"
            )
        except Exception:
            pass

        # FIX F: Ensure full_explanation_json persisted on proxy_vote_explanations
        try:
            await conn.execute("ALTER TABLE proxy_vote_explanations ADD COLUMN IF NOT EXISTS full_explanation_json JSONB DEFAULT '{}';")
        except Exception:
            pass

        # FIX C: Ensure design_signals.tag has a UNIQUE constraint for proper upsert
        # (required for ON CONFLICT (tag) DO UPDATE to work correctly)
        try:
            await conn.execute("""
                DO $$
                BEGIN
                    IF NOT EXISTS (
                        SELECT 1 FROM pg_constraint
                        WHERE conname = 'design_signals_tag_key'
                          AND conrelid = 'design_signals'::regclass
                    ) THEN
                        -- Deduplicate: keep only the highest-scoring row per tag before adding constraint
                        DELETE FROM design_signals ds
                        WHERE id NOT IN (
                            SELECT DISTINCT ON (tag) id
                            FROM design_signals
                            ORDER BY tag, total_score DESC, computed_at DESC
                        );
                        ALTER TABLE design_signals ADD CONSTRAINT design_signals_tag_key UNIQUE (tag);
                    END IF;
                END
                $$;
            """)
            print("[DB] ✅ design_signals.tag UNIQUE constraint ensured")
        except Exception as e:
            print(f"[DB] ⚠ design_signals UNIQUE constraint migration: {e}")

        # Section 4 closed loop: processed_at for idempotent feedback processing
        try:
            await conn.execute("ALTER TABLE interaction_events ADD COLUMN IF NOT EXISTS processed_at TIMESTAMPTZ;")
            await conn.execute("CREATE INDEX IF NOT EXISTS idx_interaction_events_processed_at ON interaction_events(processed_at);")
        except Exception:
            pass

        print("[DB] ✅ Migrations applied")

        # ── Admin bootstrap: DISABLED — do not seed a known password in production ──
        # To create the initial admin, set ADMIN_BOOTSTRAP_SECRET in .env and
        # run the one-time bootstrap script separately.
        print("[DB] ⚠ Admin bootstrap via startup is DISABLED for security. Use bootstrap script with ADMIN_BOOTSTRAP_SECRET.")
        print("[DB] ✅ Admin user NOT auto-seeded")

    print("[DB] 🚀 Database fully initialized")


async def run_schema_migrations(pool: asyncpg.Pool):
    """
    Programmatic schema reconciliation: run ALTER TABLE to align with current init_db.
    This ensures old backups match the code's expected schema.
    """
    async with pool.acquire() as conn:
        # Add any missing columns from old backups
        await conn.execute("ALTER TABLE item_votes ADD COLUMN IF NOT EXISTS vote_explanation JSONB DEFAULT '{}';")
        await conn.execute("ALTER TABLE product_catalog ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;")
        await conn.execute("ALTER TABLE product_catalog ADD COLUMN IF NOT EXISTS collection_id BIGINT;")
        await conn.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT FALSE;")
        await conn.execute("ALTER TABLE generated_designs ADD COLUMN IF NOT EXISTS collection_id BIGINT REFERENCES collections(id);")
        await conn.execute("ALTER TABLE showroom ADD COLUMN IF NOT EXISTS collection_id BIGINT REFERENCES collections(id);")
        await conn.execute("ALTER TABLE interaction_events ADD COLUMN IF NOT EXISTS processed_at TIMESTAMPTZ;")
        # Store 3-D model and preview image URLs directly on saved collection rows
        await conn.execute("ALTER TABLE user_collections ADD COLUMN IF NOT EXISTS model_url TEXT;")
        await conn.execute("ALTER TABLE user_collections ADD COLUMN IF NOT EXISTS image_url TEXT;")
        # Add more as needed to match init_db
        print("[MIGRATION] ✅ Schema reconciled with current init_db")


async def verify_backup_completeness(pool: asyncpg.Pool) -> Dict[str, int]:
    """
    MVP – Database snapshot (Item 5): Verify that all critical tables are present and have data.
    Returns a dict of table names → row counts.
    Use this after restoring from backup to ensure no tables were lost.
    """
    critical_tables = [
        "users",
        "blog_articles",
        "trends",
        "memory_entries",
        "generated_designs",
        "showroom",
        "collections",
        "design_signals",
        "interaction_events",  # CRITICAL: feedback pipeline
        "gsnowgpt_chat_log",    # CRITICAL: conversation history
        "item_votes",
        "user_subscriptions",
    ]
    
    counts = {}
    async with pool.acquire() as conn:
        for table in critical_tables:
            try:
                count = await conn.fetchval(f"SELECT COUNT(*) FROM {table}")
                counts[table] = int(count or 0)
            except Exception as e:
                counts[table] = -1  # -1 indicates table missing or error
                print(f"[BACKUP-VERIFY] ✗ Table {table}: {e}")
    
    missing = [t for t, c in counts.items() if c == -1]
    if missing:
        print(f"[BACKUP-VERIFY] ⚠ MISSING TABLES: {missing}")
    else:
        print(f"[BACKUP-VERIFY] ✅ All critical tables present. Row counts: {counts}")
    
    return counts


# ──────────────────────────────────────────────
# Pydantic models
# ──────────────────────────────────────────────
class MemoryStoreRequest(BaseModel):
    type:    str
    content: str
    payload: Dict[str, Any] = {}


class SendOtpRequest(BaseModel):
    firstName: str
    lastName:  str
    email:     str
    password:  str


class VerifyOtpRequest(BaseModel):
    email:    str
    otp_code: str


class ResendOtpRequest(BaseModel):
    email: str


class LoginRequest(BaseModel):
    email:    str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type:   str = "bearer"
    user:         Dict[str, Any]


class CommentRequest(BaseModel):
    text: str


class ProxyToggleRequest(BaseModel):
    enabled: bool


class CreateCheckoutRequest(BaseModel):
    price_id:    str
    plan_name:   str
    success_url: Optional[str] = None
    cancel_url:  Optional[str] = None


class SwitchPlanRequest(BaseModel):
    new_price_id:  str
    new_plan_name: str


class GenerateCommentsRequest(BaseModel):
    article_title:   str
    article_content: str = ""
    count:           int = 4
    article_id:      int


class StyleAgentRequest(BaseModel):
    message:              str
    product_name:         Optional[str] = None
    product_desc:         Optional[str] = None
    product_price:        Optional[str] = None
    conversation_history: List[Dict[str, str]] = []


class CollectionRequest(BaseModel):
    item_id:   str
    model_url: Optional[str] = None
    image_url: Optional[str] = None


class VectorSearchRequest(BaseModel):
    query:          str
    memory_type:    str   = "design_signal"
    top_k:          int   = 10
    min_similarity: float = 0.20


# ── Proxy voting preference profile and explanation models ─────────────────────
class ProxyPreferenceProfile(BaseModel):
    """Explicit preference-driven model for proxy voting."""
    user_id: int
    
    # Aesthetic preferences (0-100 normalized weights)
    aesthetic_minimalist_weight:    float = 50.0  # Clean, simple designs
    aesthetic_bold_weight:          float = 50.0  # Dramatic, eye-catching designs
    aesthetic_eclectic_weight:      float = 50.0  # Eclectic, mixed-style designs
    
    # Material preferences (0-100 normalized weights)
    material_luxury_weight:         float = 50.0  # Premium materials (silk, leather, etc)
    material_sustainable_weight:    float = 50.0  # Eco-friendly materials
    material_experimental_weight:   float = 50.0  # Novel/innovative materials
    
    # Silhouette preferences (0-100 normalized weights)
    silhouette_fitted_weight:       float = 50.0  # Fitted/bodycon
    silhouette_relaxed_weight:      float = 50.0  # Loose/comfortable
    silhouette_structured_weight:   float = 50.0  # Structured/architectural
    
    # Design type preferences (0-100 normalized weights)
    design_classic_weight:          float = 50.0  # Timeless, classic
    design_trendy_weight:           float = 50.0  # Trend-following
    design_avant_garde_weight:      float = 50.0  # Experimental/avant-garde
    
    # Category preferences (0-100 normalized weights)
    category_apparel_weight:        float = 50.0
    category_accessories_weight:    float = 50.0
    category_footwear_weight:       float = 50.0
    category_jewelry_weight:        float = 50.0
    
    updated_at: datetime = datetime.utcnow()


class ProxyVoteExplanation(BaseModel):
    """Explanation metadata for a proxy vote (for audit/debug/UI transparency)."""
    vote_id: Optional[int] = None
    product_id: str
    user_id: int
    
    # Score breakdown
    preference_score: float  # Score from explicit preferences
    history_score: float     # Score from voting history
    combined_score: float    # Total weighted score
    
    # Scoring details
    matched_preferences: List[str]  # Which preference categories matched
    matched_tags: List[str]          # Tags that matched history
    boosted_by: List[str]            # Boost reason codes
    penalty_applied: Optional[str]   # If any penalty
    
    # Tie-break information
    tie_break_reason: Optional[str]  # How tie was broken (if needed)
    
    # Audit
    score_computation_method: str    # "preference-driven", "history-inferred", "random"
    created_at: datetime = datetime.utcnow()


class ProxyPreferenceUpdateRequest(BaseModel):
    """Request to update user's proxy voting preferences."""
    aesthetic_minimalist_weight: Optional[float] = None
    aesthetic_bold_weight: Optional[float] = None
    aesthetic_eclectic_weight: Optional[float] = None
    material_luxury_weight: Optional[float] = None
    material_sustainable_weight: Optional[float] = None
    material_experimental_weight: Optional[float] = None
    silhouette_fitted_weight: Optional[float] = None
    silhouette_relaxed_weight: Optional[float] = None
    silhouette_structured_weight: Optional[float] = None
    design_classic_weight: Optional[float] = None
    design_trendy_weight: Optional[float] = None
    design_avant_garde_weight: Optional[float] = None
    category_apparel_weight: Optional[float] = None
    category_accessories_weight: Optional[float] = None
    category_footwear_weight: Optional[float] = None
    category_jewelry_weight: Optional[float] = None


# ── FIX A: GSNowGPT unified conversational entry ──────────────────────────────
class GSNowGPTRequest(BaseModel):
    message:              str
    session_id:           Optional[str] = None
    product_name:         Optional[str] = None
    product_desc:         Optional[str] = None
    product_price:        Optional[str] = None
    conversation_history: List[Dict[str, str]] = []


# ── FIX B: Collection management models ───────────────────────────────────────
class CreateCollectionRequest(BaseModel):
    name:        str
    description: Optional[str] = None
    lifecycle:   str = "draft"


class UpdateCollectionRequest(BaseModel):
    name:        Optional[str] = None
    description: Optional[str] = None
    lifecycle:   Optional[str] = None


# ── FIX C: Interaction event emission model ───────────────────────────────────
class InteractionEventRequest(BaseModel):
    event_type:  str   # blog_like | blog_comment | design_view | vote_cast | save_look | chat_query | paid_feature_use
    entity_id:   Optional[str] = None
    entity_type: Optional[str] = None
    payload:     Dict[str, Any] = {}


# ──────────────────────────────────────────────
# JWT helpers
# ──────────────────────────────────────────────
def create_jwt(user_id: int, email: str, is_admin: bool) -> str:
    payload = {
        "sub":      str(user_id),
        "email":    email,
        "is_admin": is_admin,
        "exp":      datetime.utcnow() + timedelta(days=JWT_EXPIRE_DAYS),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def decode_jwt(token: str) -> Dict:
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except JWTError as e:
        raise HTTPException(status_code=401, detail=f"Invalid token: {e}")


async def get_current_user(authorization: Optional[str]) -> Dict:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or malformed Authorization header")
    token = authorization.split(" ", 1)[1]
    return decode_jwt(token)


async def get_optional_user(authorization: Optional[str]) -> Optional[Dict]:
    """Return decoded JWT or None — never raises."""
    if not authorization or not authorization.startswith("Bearer "):
        return None
    try:
        return decode_jwt(authorization.split(" ", 1)[1])
    except Exception:
        return None


# ──────────────────────────────────────────────
# Authorization and rate limiting for expensive endpoints
# ──────────────────────────────────────────────
async def require_admin(authorization: Optional[str] = Header(None)) -> Dict:
    """Require admin role for protected endpoints."""
    payload = await get_current_user(authorization)
    pool = await get_pool()
    
    async with pool.acquire() as conn:
        user = await conn.fetchrow(
            "SELECT is_admin FROM users WHERE id = $1",
            int(payload["sub"])
        )
    
    if not user or not user["is_admin"]:
        raise HTTPException(
            status_code=403,
            detail="Admin access required to execute this operation"
        )
    
    return payload


# Admin-only reserved endpoints for future AI design engine (not implemented)
@app.post("/api/v1/design-engine/jobs")
async def create_design_engine_job(payload: Dict[str, Any], admin: Dict = Depends(require_admin)):
    """Create a design-engine job (reserved). Admin-only."""
    raise HTTPException(status_code=501, detail="AI design engine not yet integrated")


@app.get("/api/v1/design-engine/jobs/{job_id}")
async def get_design_engine_job(job_id: str, admin: Dict = Depends(require_admin)):
    """Fetch a design-engine job by id (reserved). Admin-only."""
    raise HTTPException(status_code=501, detail="AI design engine not yet integrated")


def check_rate_limit(request: Request, endpoint: str, max_requests: int = RATE_LIMIT_MAX_REQUESTS) -> bool:
    """Simple rate limiter by client IP and endpoint. Returns True if within limits, False if exceeded."""
    import time

    client_ip = request.client.host if request.client else "unknown"
    key = (client_ip, endpoint)
    now = time.time()

    # Clean old entries
    if key in RATE_LIMIT_REQUESTS:
        RATE_LIMIT_REQUESTS[key] = [
            ts for ts in RATE_LIMIT_REQUESTS[key]
            if now - ts < RATE_LIMIT_WINDOW_SECONDS
        ]

    # Check limit
    if key not in RATE_LIMIT_REQUESTS:
        RATE_LIMIT_REQUESTS[key] = []

    if len(RATE_LIMIT_REQUESTS[key]) >= max_requests:
        return False

    RATE_LIMIT_REQUESTS[key].append(now)
    return True


def check_user_rate_limit(user_key: str, endpoint: str, max_requests: int, window_seconds: int = 3600) -> bool:
    """Per-user rate limiter (by user_id or email string + endpoint)."""
    import time
    key = (user_key, endpoint)
    now = time.time()
    if key in RATE_LIMIT_REQUESTS:
        RATE_LIMIT_REQUESTS[key] = [
            ts for ts in RATE_LIMIT_REQUESTS[key]
            if now - ts < window_seconds
        ]
    if key not in RATE_LIMIT_REQUESTS:
        RATE_LIMIT_REQUESTS[key] = []
    if len(RATE_LIMIT_REQUESTS[key]) >= max_requests:
        return False
    RATE_LIMIT_REQUESTS[key].append(now)
    return True


async def log_admin_action(pool: asyncpg.Pool, user_id: int, action: str, endpoint: str, details: str = ""):
    """Log admin actions for audit trail."""
    try:
        async with pool.acquire() as conn:
            await conn.execute(
                """
                INSERT INTO admin_audit_log (user_id, action, endpoint, details, created_at)
                VALUES ($1, $2, $3, $4, NOW())
                """,
                user_id, action, endpoint, details
            )
    except Exception as e:
        print(f"[AUDIT] Failed to log action: {e}")


# ──────────────────────────────────────────────
# OTP helpers
# ──────────────────────────────────────────────
def _generate_otp() -> str:
    return str(random.randint(100000, 999999))


def _send_otp_email(to_email: str, otp_code: str, first_name: str) -> bool:
    if not GMAIL_SENDER_EMAIL or not GMAIL_APP_PASSWORD:
        print("[OTP-EMAIL] ✗ Gmail credentials not configured")
        return False

    subject = "Your GIA Verification Code"

    html_body = f"""
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8"/>
      <style>
        body {{ font-family: 'Helvetica Neue', Arial, sans-serif; background: #0a0a0a; margin: 0; padding: 0; }}
        .wrapper {{ max-width: 480px; margin: 40px auto; background: #141414; border-radius: 16px;
                    border: 1px solid #2a2a2a; overflow: hidden; }}
        .header {{ background: #1a1a1a; padding: 32px 40px; text-align: center;
                   border-bottom: 1px solid #2a2a2a; }}
        .logo {{ font-size: 28px; font-weight: 800; color: #ffffff; letter-spacing: -1px; }}
        .logo span {{ color: #ec4899; }}
        .body {{ padding: 40px; }}
        .greeting {{ color: #a1a1aa; font-size: 15px; margin-bottom: 12px; }}
        .msg {{ color: #e4e4e7; font-size: 15px; line-height: 1.6; margin-bottom: 32px; }}
        .otp-box {{ background: #000000; border: 1px solid #ec4899; border-radius: 12px;
                    padding: 24px; text-align: center; margin-bottom: 32px; }}
        .otp-label {{ color: #a1a1aa; font-size: 12px; text-transform: uppercase;
                      letter-spacing: 2px; margin-bottom: 12px; }}
        .otp-code {{ font-size: 42px; font-weight: 800; color: #ec4899;
                     letter-spacing: 12px; }}
        .expiry {{ color: #71717a; font-size: 13px; text-align: center; margin-bottom: 24px; }}
        .warning {{ color: #71717a; font-size: 12px; line-height: 1.5;
                    border-top: 1px solid #2a2a2a; padding-top: 24px; }}
        .footer {{ background: #0f0f0f; padding: 20px 40px; text-align: center;
                   color: #52525b; font-size: 12px; border-top: 1px solid #2a2a2a; }}
      </style>
    </head>
    <body>
      <div class="wrapper">
        <div class="header">
          <div class="logo">GIA<span>.</span></div>
        </div>
        <div class="body">
          <div class="greeting">Hello, {first_name} 👋</div>
          <div class="msg">
            Welcome to <strong style="color:#ffffff">GIA Fashion</strong>. To complete your
            registration, please use the verification code below.
          </div>
          <div class="otp-box">
            <div class="otp-label">Verification Code</div>
            <div class="otp-code">{otp_code}</div>
          </div>
          <div class="expiry">⏱ This code expires in <strong style="color:#e4e4e7">{OTP_EXPIRE_MINUTES} minutes</strong>.</div>
          <div class="warning">
            If you did not request this code, you can safely ignore this email.
            Someone may have entered your email address by mistake.
          </div>
        </div>
        <div class="footer">© {datetime.utcnow().year} GIA Fashion. All rights reserved.</div>
      </div>
    </body>
    </html>
    """

    plain_body = (
        f"Hello {first_name},\n\n"
        f"Your GIA verification code is: {otp_code}\n\n"
        f"This code expires in {OTP_EXPIRE_MINUTES} minutes.\n\n"
        f"If you did not request this, please ignore this email.\n\n"
        f"— GIA Fashion Team"
    )

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"]    = f"GIA Fashion <{GMAIL_SENDER_EMAIL}>"
    msg["To"]      = to_email

    msg.attach(MIMEText(plain_body, "plain"))
    msg.attach(MIMEText(html_body,  "html"))

    try:
        context = ssl.create_default_context()
        with smtplib.SMTP("smtp.gmail.com", 587) as server:
            server.ehlo()
            server.starttls(context=context)
            server.ehlo()
            server.login(GMAIL_SENDER_EMAIL, GMAIL_APP_PASSWORD)
            server.sendmail(GMAIL_SENDER_EMAIL, to_email, msg.as_string())
        print(f"[OTP-EMAIL] ✓ OTP sent to {to_email}")
        return True
    except smtplib.SMTPAuthenticationError:
        print("[OTP-EMAIL] ✗ Gmail auth failed — check GMAIL_SENDER_EMAIL and GMAIL_APP_PASSWORD")
        return False
    except Exception as e:
        print(f"[OTP-EMAIL] ✗ {type(e).__name__}: {e}")
        return False


# ──────────────────────────────────────────────
# Source definitions
# ──────────────────────────────────────────────
SOURCES: List[Dict] = [
    {
        "name":     "Vogue",
        "base_url": "https://www.vogue.com",
        "rss": [
            "https://www.vogue.com/feed/rss",
            "https://www.vogue.com/fashion/rss",
        ],
        "sitemap": ["https://www.vogue.com/sitemap.xml"],
        "crawl_seeds": [
            "https://www.vogue.com/fashion",
            "https://www.vogue.com/style",
            "https://www.vogue.com/runway",
        ],
        "url_patterns":  ["/article/", "/story/", "/fashion/", "/style/", "/runway/"],
        "url_blocklist": ["/video/", "/podcast/", "/horoscope/", "/beauty/"],
        "playwright_wait":          "domcontentloaded",
        "playwright_extra_wait_ms": 5000,
    },
    {
        "name":     "Elle",
        "base_url": "https://www.elle.com",
        "rss": [
            "https://www.elle.com/rss/all.xml/",
            "https://www.elle.com/fashion/rss",
        ],
        "sitemap": ["https://www.elle.com/sitemap.xml"],
        "crawl_seeds": [
            "https://www.elle.com/fashion/",
            "https://www.elle.com/fashion/trend-reports/",
            "https://www.elle.com/fashion/celebrity-style/",
        ],
        "url_patterns":  ["/fashion/", "/style/", "/article/"],
        "url_blocklist": ["/video/", "/podcast/", "/beauty/"],
        "playwright_wait":          "networkidle",
        "playwright_extra_wait_ms": 3000,
    },
    {
        "name":     "Harper's Bazaar",
        "base_url": "https://www.harpersbazaar.com",
        "rss": [
            "https://www.harpersbazaar.com/rss/all.xml/",
            "https://www.harpersbazaar.com/fashion/rss",
        ],
        "sitemap": ["https://www.harpersbazaar.com/sitemap.xml"],
        "crawl_seeds": [
            "https://www.harpersbazaar.com/fashion/",
            "https://www.harpersbazaar.com/fashion/trends/",
            "https://www.harpersbazaar.com/fashion/street-style/",
        ],
        "url_patterns":  ["/fashion/", "/style/", "/article/"],
        "url_blocklist": ["/video/", "/podcast/", "/beauty/"],
        "playwright_wait":          "networkidle",
        "playwright_extra_wait_ms": 3000,
    },
]

SOURCE_NAMES: List[str] = [s["name"] for s in SOURCES]
SOURCE_BY_NAME: Dict[str, Dict] = {s["name"]: s for s in SOURCES}

print(f"[BOOT] Sources configured: {SOURCE_NAMES}")


# ──────────────────────────────────────────────
# Circular Source Rotation
# ──────────────────────────────────────────────
async def get_last_used_source() -> Optional[str]:
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT last_used_source FROM source_rotation_state WHERE id = 1"
        )
    name = row["last_used_source"] if row else None
    print(f"[ROTATION] Last used source from DB: {name!r}")
    return name


async def set_last_used_source(source_name: str):
    pool = await get_pool()
    async with pool.acquire() as conn:
        await conn.execute("""
            INSERT INTO source_rotation_state (id, last_used_source, updated_at)
            VALUES (1, $1, NOW())
            ON CONFLICT (id) DO UPDATE
                SET last_used_source = EXCLUDED.last_used_source,
                    updated_at       = NOW()
        """, source_name)
    print(f"[ROTATION] Persisted last_used_source = {source_name!r}")


def _circular_priority_order(last_used: Optional[str]) -> List[str]:
    n = len(SOURCE_NAMES)
    if not last_used or last_used not in SOURCE_NAMES:
        start_idx = 0
    else:
        last_idx  = SOURCE_NAMES.index(last_used)
        start_idx = (last_idx + 1) % n
    order = [SOURCE_NAMES[(start_idx + i) % n] for i in range(n)]
    print(f"[ROTATION] Priority order (last_used={last_used!r}): {order}")
    return order


async def select_source_with_articles(
    priority_order: List[str],
    known_urls: Set[str],
) -> Optional[Dict]:
    for name in priority_order:
        source = SOURCE_BY_NAME[name]
        print(f"[ROTATION] Probing source '{name}' for fresh URLs…")
        try:
            rss_urls = await discover_via_rss(source, known_urls)
            if rss_urls:
                print(f"[ROTATION] ✓ '{name}' has {len(rss_urls)} fresh RSS URL(s) — selected")
                return source

            sitemap_urls = await discover_via_sitemap(source, known_urls)
            if sitemap_urls:
                print(f"[ROTATION] ✓ '{name}' has {len(sitemap_urls)} fresh sitemap URL(s) — selected")
                return source

            print(f"[ROTATION] ✗ '{name}' has no fresh URLs")
        except Exception as e:
            print(f"[ROTATION] ✗ Probe failed for '{name}': {type(e).__name__}: {e}")

    print(f"[ROTATION] ✗ No source has fresh URLs — will fall back to first in priority order")
    return None


# ──────────────────────────────────────────────
# Logging helpers
# ──────────────────────────────────────────────
def log_sep(label: str):
    print(f"\n{'='*65}")
    print(f"  {label}")
    print(f"{'='*65}")

def log_sec(label: str):
    print(f"\n{'─'*55}")
    print(f"  {label}")
    print(f"{'─'*55}")


# ──────────────────────────────────────────────
# URL freshness helpers
# ──────────────────────────────────────────────
async def is_url_fresh(url: str) -> bool:
    pool   = await get_pool()
    cutoff = datetime.utcnow() - timedelta(days=URL_REUSE_DAYS)
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT last_scraped FROM scraped_urls WHERE url = $1", url
        )
    if row is None:
        return True
    last = row["last_scraped"].replace(tzinfo=None)
    if last < cutoff:
        return True
    print(f"[SKIP] Scraped {(datetime.utcnow()-last).days}d ago (blocked for {URL_REUSE_DAYS}d): {url}")
    return False


async def mark_url_scraped(url: str):
    pool = await get_pool()
    async with pool.acquire() as conn:
        await conn.execute("""
            INSERT INTO scraped_urls (url, last_scraped)
            VALUES ($1, NOW())
            ON CONFLICT (url) DO UPDATE SET last_scraped = NOW()
        """, url)


async def get_recently_scraped_urls() -> Set[str]:
    pool   = await get_pool()
    cutoff = datetime.utcnow() - timedelta(days=URL_REUSE_DAYS)
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT url FROM scraped_urls WHERE last_scraped >= $1", cutoff
        )
    return {r["url"] for r in rows}


# ──────────────────────────────────────────────
# URL validation
# ──────────────────────────────────────────────
def is_valid_article_url(url: str, source: Dict) -> bool:
    if not url or not url.startswith("http"):
        return False
    parsed    = urlparse(url)
    base_host = urlparse(source["base_url"]).netloc
    if base_host not in parsed.netloc:
        return False
    path = parsed.path
    if not any(p in path for p in source["url_patterns"]):
        return False
    if any(b in url for b in source["url_blocklist"]):
        return False
    segments = [s for s in path.split("/") if s]
    if len(segments) < 2:
        return False
    return True


# ──────────────────────────────────────────────
# RSS / Atom discovery
# ──────────────────────────────────────────────
async def discover_via_rss(source: Dict, known_urls: Set[str]) -> List[str]:
    log_sec(f"[RSS] {source['name']}")
    found: List[str] = []
    headers = {"User-Agent": "Mozilla/5.0 (compatible; GIABot/1.0)"}
    async with httpx.AsyncClient(timeout=30, follow_redirects=True, headers=headers) as client:
        for feed_url in source.get("rss", []):
            print(f"[RSS]   Fetching: {feed_url}")
            try:
                res = await client.get(feed_url)
                print(f"[RSS]   HTTP {res.status_code}")
                if res.status_code != 200:
                    continue
                root  = ET.fromstring(res.text)
                items = root.findall(".//item")
                items += root.findall(".//{http://www.w3.org/2005/Atom}entry")
                print(f"[RSS]   {len(items)} feed items")
                for item in items:
                    url = None
                    link_el = item.find("link")
                    if link_el is not None:
                        url = (link_el.text or "").strip()
                    if not url:
                        al = item.find("{http://www.w3.org/2005/Atom}link")
                        if al is not None:
                            url = al.get("href", "").strip()
                    if url and is_valid_article_url(url, source) and url not in known_urls:
                        found.append(url)
            except ET.ParseError as e:
                print(f"[RSS]   ✗ XML parse error: {e}")
            except Exception as e:
                print(f"[RSS]   ✗ {type(e).__name__}: {e}")
    unique = list(dict.fromkeys(found))
    print(f"[RSS]   → {len(unique)} fresh valid URLs")
    return unique


# ──────────────────────────────────────────────
# Sitemap discovery
# ──────────────────────────────────────────────
async def discover_via_sitemap(source: Dict, known_urls: Set[str]) -> List[str]:
    log_sec(f"[SITEMAP] {source['name']}")
    found: List[str] = []
    headers = {"User-Agent": "Mozilla/5.0 (compatible; GIABot/1.0)"}
    async with httpx.AsyncClient(timeout=30, follow_redirects=True, headers=headers) as client:
        queue   = list(source.get("sitemap", []))
        visited = set()
        while queue:
            sitemap_url = queue.pop(0)
            if sitemap_url in visited:
                continue
            visited.add(sitemap_url)
            print(f"[SITEMAP]   Fetching: {sitemap_url}")
            try:
                res = await client.get(sitemap_url)
                print(f"[SITEMAP]   HTTP {res.status_code}")
                if res.status_code != 200:
                    continue
                root = ET.fromstring(res.text)
                if "sitemapindex" in root.tag.lower():
                    locs = [el.text.strip() for el in root.iter()
                            if (el.tag.endswith("}loc") or el.tag == "loc") and el.text]
                    fashion_locs = [l for l in locs
                                    if any(k in l for k in ["fashion","style","article","story","runway"])]
                    print(f"[SITEMAP]   Index → {len(locs)} children, following {len(fashion_locs)} fashion ones")
                    queue.extend(fashion_locs[:10])
                else:
                    locs = [el.text.strip() for el in root.iter()
                            if (el.tag.endswith("}loc") or el.tag == "loc") and el.text]
                    print(f"[SITEMAP]   Regular → {len(locs)} URLs")
                    for url in locs:
                        if is_valid_article_url(url, source) and url not in known_urls:
                            found.append(url)
            except ET.ParseError as e:
                print(f"[SITEMAP]   ✗ XML parse error: {e}")
            except Exception as e:
                print(f"[SITEMAP]   ✗ {type(e).__name__}: {e}")
    random.shuffle(found)
    unique = list(dict.fromkeys(found))
    print(f"[SITEMAP]   → {len(unique)} fresh valid URLs")
    return unique


# ──────────────────────────────────────────────
# SOURCE IMAGE EXTRACTION
# ──────────────────────────────────────────────
async def extract_article_image(url: str, html: Optional[str] = None) -> Optional[str]:
    try:
        if html is None:
            print(f"[IMG-EXTRACT] Fetching HTML for image from: {url[:80]}")
            headers = {
                "User-Agent": (
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) "
                    "Chrome/124.0 Safari/537.36"
                ),
                "Accept-Language": "en-US,en;q=0.9",
            }
            async with httpx.AsyncClient(timeout=30, follow_redirects=True, headers=headers) as client:
                res = await client.get(url)
                if res.status_code != 200:
                    print(f"[IMG-EXTRACT] ✗ HTTP {res.status_code}")
                    return None
                html = res.text

        og_patterns = [
            r'<meta[^>]+property=["\']og:image["\'][^>]+content=["\']([^"\']+)["\']',
            r'<meta[^>]+content=["\']([^"\']+)["\'][^>]+property=["\']og:image["\']',
            r'<meta[^>]+property=["\']og:image:url["\'][^>]+content=["\']([^"\']+)["\']',
            r'<meta[^>]+content=["\']([^"\']+)["\'][^>]+property=["\']og:image:url["\']',
        ]
        for pattern in og_patterns:
            match = re.search(pattern, html, re.IGNORECASE)
            if match:
                img_url = match.group(1).strip()
                if img_url.startswith("http"):
                    print(f"[IMG-EXTRACT] ✓ og:image found: {img_url[:100]}")
                    return img_url

        tw_patterns = [
            r'<meta[^>]+name=["\']twitter:image["\'][^>]+content=["\']([^"\']+)["\']',
            r'<meta[^>]+content=["\']([^"\']+)["\'][^>]+name=["\']twitter:image["\']',
            r'<meta[^>]+name=["\']twitter:image:src["\'][^>]+content=["\']([^"\']+)["\']',
            r'<meta[^>]+content=["\']([^"\']+)["\'][^>]+name=["\']twitter:image:src["\']',
        ]
        for pattern in tw_patterns:
            match = re.search(pattern, html, re.IGNORECASE)
            if match:
                img_url = match.group(1).strip()
                if img_url.startswith("http"):
                    print(f"[IMG-EXTRACT] ✓ twitter:image found: {img_url[:100]}")
                    return img_url

        link_match = re.search(
            r'<link[^>]+rel=["\']image_src["\'][^>]+href=["\']([^"\']+)["\']',
            html, re.IGNORECASE
        )
        if link_match:
            img_url = link_match.group(1).strip()
            if img_url.startswith("http"):
                print(f"[IMG-EXTRACT] ✓ image_src link found: {img_url[:100]}")
                return img_url

        jsonld_match = re.search(
            r'<script[^>]+type=["\']application/ld\+json["\'][^>]*>([\s\S]*?)</script>',
            html, re.IGNORECASE
        )
        if jsonld_match:
            try:
                ld_data = json.loads(jsonld_match.group(1))
                if isinstance(ld_data, list):
                    ld_data = ld_data[0] if ld_data else {}
                for key in ("image", "thumbnailUrl", "thumbnail"):
                    img_val = ld_data.get(key)
                    if isinstance(img_val, str) and img_val.startswith("http"):
                        print(f"[IMG-EXTRACT] ✓ JSON-LD image found: {img_val[:100]}")
                        return img_val
                    if isinstance(img_val, dict):
                        url_val = img_val.get("url", "")
                        if url_val.startswith("http"):
                            print(f"[IMG-EXTRACT] ✓ JSON-LD image.url found: {url_val[:100]}")
                            return url_val
                    if isinstance(img_val, list) and img_val:
                        first = img_val[0]
                        if isinstance(first, str) and first.startswith("http"):
                            print(f"[IMG-EXTRACT] ✓ JSON-LD image[0] found: {first[:100]}")
                            return first
                        if isinstance(first, dict):
                            url_val = first.get("url", "")
                            if url_val.startswith("http"):
                                print(f"[IMG-EXTRACT] ✓ JSON-LD image[0].url found: {url_val[:100]}")
                                return url_val
            except Exception:
                pass

        base = urlparse(url)
        content_area_match = re.search(
            r'(?:<article|<main|class=["\'][^"\']*(?:article|content|body|story)[^"\']*["\'])'
            r'([\s\S]{0,5000})',
            html, re.IGNORECASE
        )
        search_area = content_area_match.group(1) if content_area_match else html

        img_tags = re.findall(
            r'<img[^>]+(?:src|data-src|data-lazy-src)=["\']([^"\']+)["\'][^>]*>',
            search_area, re.IGNORECASE
        )

        skip_keywords = [
            "logo", "icon", "avatar", "pixel", "spacer", "1x1", "badge",
            "spinner", "placeholder", "blank", "transparent", "tracking",
            "analytics", "ad.", "ads.", "doubleclick", "googlesyndication",
        ]

        for img in img_tags:
            if img.startswith("//"):
                img = f"{base.scheme}:{img}"
            elif img.startswith("/"):
                img = f"{base.scheme}://{base.netloc}{img}"
            if not img.startswith("http"):
                continue

            img_lower = img.lower()
            if any(skip in img_lower for skip in skip_keywords):
                continue

            has_image_ext  = any(ext in img_lower for ext in [".jpg", ".jpeg", ".png", ".webp"])
            has_image_path = any(kw  in img_lower for kw  in ["/image", "/photo", "/media", "/assets", "cdn", "upload"])

            if has_image_ext or has_image_path:
                print(f"[IMG-EXTRACT] ✓ <img> tag fallback found: {img[:100]}")
                return img

        print(f"[IMG-EXTRACT] ✗ No suitable image found in source article: {url[:80]}")
        return None

    except Exception as e:
        print(f"[IMG-EXTRACT] ✗ {type(e).__name__}: {e}")
        return None


# ──────────────────────────────────────────────
# TITLE EXTRACTION FROM HTML
# ──────────────────────────────────────────────
def extract_title_from_html(html: str, url: str = "") -> Optional[str]:
    if not html:
        return None

    og_patterns = [
        r'<meta[^>]+property=["\']og:title["\'][^>]+content=["\']([^"\']+)["\']',
        r'<meta[^>]+content=["\']([^"\']+)["\'][^>]+property=["\']og:title["\']',
    ]
    for pattern in og_patterns:
        match = re.search(pattern, html, re.IGNORECASE)
        if match:
            title = match.group(1).strip()
            if title:
                print(f"[TITLE-EXTRACT] ✓ og:title: {repr(title[:80])}")
                return _clean_title(title)

    tw_patterns = [
        r'<meta[^>]+name=["\']twitter:title["\'][^>]+content=["\']([^"\']+)["\']',
        r'<meta[^>]+content=["\']([^"\']+)["\'][^>]+name=["\']twitter:title["\']',
    ]
    for pattern in tw_patterns:
        match = re.search(pattern, html, re.IGNORECASE)
        if match:
            title = match.group(1).strip()
            if title:
                print(f"[TITLE-EXTRACT] ✓ twitter:title: {repr(title[:80])}")
                return _clean_title(title)

    jsonld_match = re.search(
        r'<script[^>]+type=["\']application/ld\+json["\'][^>]*>([\s\S]*?)</script>',
        html, re.IGNORECASE
    )
    if jsonld_match:
        try:
            ld = json.loads(jsonld_match.group(1))
            if isinstance(ld, list):
                ld = ld[0] if ld else {}
            headline = ld.get("headline") or ld.get("name")
            if headline and isinstance(headline, str) and len(headline.strip()) > 5:
                print(f"[TITLE-EXTRACT] ✓ JSON-LD headline: {repr(headline[:80])}")
                return _clean_title(headline)
        except Exception:
            pass

    h1_match = re.search(r'<h1[^>]*>(.*?)</h1>', html, re.IGNORECASE | re.DOTALL)
    if h1_match:
        title = re.sub(r'<[^>]+>', '', h1_match.group(1)).strip()
        if len(title) > 10:
            print(f"[TITLE-EXTRACT] ✓ <h1>: {repr(title[:80])}")
            return _clean_title(title)

    title_tag = re.search(r'<title[^>]*>(.*?)</title>', html, re.IGNORECASE | re.DOTALL)
    if title_tag:
        raw = re.sub(r'<[^>]+>', '', title_tag.group(1)).strip()
        raw = re.sub(
            r'\s*[\|\-–—]\s*(Vogue|Elle|Harper\'?s?\s*Bazaar|BAZAAR|InStyle|W Magazine)[^\|]*$',
            '', raw, flags=re.IGNORECASE
        ).strip()
        if len(raw) > 10:
            print(f"[TITLE-EXTRACT] ✓ <title> tag: {repr(raw[:80])}")
            return _clean_title(raw)

    print(f"[TITLE-EXTRACT] ✗ Could not extract real title from HTML for: {url[:80]}")
    return None


def _clean_title(title: str) -> str:
    title = title.replace('&amp;', '&')
    title = title.replace('&quot;', '"')
    title = title.replace('&#39;', "'")
    title = title.replace('&apos;', "'")
    title = title.replace('&nbsp;', ' ')
    title = title.replace('&#8216;', '\u2018')
    title = title.replace('&#8217;', '\u2019')
    title = title.replace('&#8220;', '\u201c')
    title = title.replace('&#8221;', '\u201d')
    title = title.replace('&#8211;', '\u2013')
    title = title.replace('&#8212;', '\u2014')
    title = re.sub(r'\s+', ' ', title).strip()
    return title


# ──────────────────────────────────────────────
# Playwright in its own thread (Windows-safe)
# ──────────────────────────────────────────────
def _run_playwright_in_thread(coro_factory):
    result_holder = {}

    def thread_main():
        if sys.platform == "win32":
            loop = asyncio.ProactorEventLoop()
        else:
            loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            result_holder["result"] = loop.run_until_complete(coro_factory())
        except Exception as exc:
            result_holder["error"] = exc
        finally:
            loop.close()

    t = threading.Thread(target=thread_main, daemon=True)
    t.start()
    t.join()

    if "error" in result_holder:
        raise result_holder["error"]
    return result_holder.get("result", [])


async def run_playwright_scrape_in_thread(sources: List[Dict], known_urls: Set[str]) -> List[Dict]:
    loop = asyncio.get_event_loop()

    async def playwright_main() -> List[Dict]:
        all_found: List[Dict] = []
        if async_playwright is None:
            print("[PLAYWRIGHT-THREAD] playwright not installed — skipping scrape "
                  "(install requirements-design.txt to enable the scraping agent).")
            return all_found
        async with async_playwright() as p:
            print(f"[PLAYWRIGHT-THREAD] Launching Chromium…")
            browser = await p.chromium.launch(
                headless=True,
                args=[
                    "--no-sandbox",
                    "--disable-setuid-sandbox",
                    "--disable-blink-features=AutomationControlled",
                    "--disable-dev-shm-usage",
                ]
            )
            print(f"[PLAYWRIGHT-THREAD] ✅ Browser launched")
            for source in sources:
                articles = await _playwright_scrape_source(browser, source, known_urls)
                all_found.extend(articles)
            await browser.close()
            print(f"[PLAYWRIGHT-THREAD] Browser closed. Total articles: {len(all_found)}")
        return all_found

    result = await loop.run_in_executor(
        None,
        lambda: _run_playwright_in_thread(playwright_main)
    )
    return result


async def _playwright_scrape_source(browser, source: Dict, known_urls: Set[str]) -> List[Dict]:
    log_sep(f"[PLAYWRIGHT-THREAD] SCRAPING — {source['name']}")
    found:    List[Dict] = []
    seen:     Set[str]   = set()
    examined = 0

    for seed in source.get("crawl_seeds", []):
        print(f"[PLAYWRIGHT-THREAD]   Seed: {seed}")
        page = await browser.new_page()
        try:
            wait  = source.get("playwright_wait", "domcontentloaded")
            extra = source.get("playwright_extra_wait_ms", 3000)
            await page.goto(seed, wait_until=wait, timeout=90_000)
            await page.wait_for_timeout(extra)

            for _ in range(6):
                await page.evaluate("window.scrollBy(0, window.innerHeight * 1.5)")
                await page.wait_for_timeout(1200)

            hrefs = await page.eval_on_selector_all(
                "a[href]", "els => els.map(e => e.href).filter(Boolean)"
            )
            print(f"[PLAYWRIGHT-THREAD]   Raw hrefs: {len(hrefs)}")

            for h in hrefs:
                if h.startswith("/"):
                    h = urljoin(source["base_url"], h)
                if (is_valid_article_url(h, source)
                        and h not in known_urls
                        and h not in seen
                        and len(found) < MAX_PER_SOURCE):
                    seen.add(h)
                    if examined >= CANDIDATE_LIMIT:
                        break
                    examined += 1
                    print(f"[PLAYWRIGHT-THREAD]   [{examined}] Fetching: {h}")
                    content, source_image, page_title = await _playwright_fetch_content(browser, h, source)
                    if len(content) >= 200:
                        url_slug_title = h.rstrip("/").split("/")[-1].replace("-", " ").title()
                        real_title = page_title or url_slug_title
                        found.append({
                            "url":          h,
                            "content":      content,
                            "source_image": source_image,
                            "source":       source["name"],
                            "title":        real_title,
                        })

        except Exception as e:
            print(f"[PLAYWRIGHT-THREAD]   ✗ {seed}: {type(e).__name__}: {e}")
        finally:
            await page.close()

    print(f"[PLAYWRIGHT-THREAD] {source['name']} done — {len(found)} articles")
    return found


async def _playwright_fetch_content(browser, url: str, source: Dict) -> tuple:
    page = await browser.new_page()
    source_image = None
    page_title   = None
    try:
        wait = source.get("playwright_wait", "domcontentloaded")
        await page.goto(url, wait_until=wait, timeout=60_000)
        await page.wait_for_timeout(1500)

        try:
            result = await page.evaluate("""() => {
                const ogTitle = document.querySelector('meta[property="og:title"]');
                const twTitle = document.querySelector('meta[name="twitter:title"]');
                const h1      = document.querySelector('h1');

                let title = null;
                if (ogTitle && ogTitle.getAttribute('content')) {
                    title = ogTitle.getAttribute('content').trim();
                } else if (twTitle && twTitle.getAttribute('content')) {
                    title = twTitle.getAttribute('content').trim();
                } else if (h1 && h1.innerText) {
                    title = h1.innerText.trim();
                } else {
                    const raw = document.title || '';
                    title = raw.replace(/\\s*[\\|\\-\\u2013\\u2014]\\s*(Vogue|Elle|Harper.?s?\\s*Bazaar|BAZAAR|InStyle|W Magazine)[^]*$/i, '').trim() || raw.trim();
                }

                const ogImg   = document.querySelector('meta[property="og:image"]');
                const ogImgU  = document.querySelector('meta[property="og:image:url"]');
                const twImg   = document.querySelector('meta[name="twitter:image"]');
                const twImgS  = document.querySelector('meta[name="twitter:image:src"]');
                const imgSrc  = document.querySelector('link[rel="image_src"]');

                let img = null;
                if (ogImg   && ogImg.getAttribute('content'))  img = ogImg.getAttribute('content');
                else if (ogImgU  && ogImgU.getAttribute('content')) img = ogImgU.getAttribute('content');
                else if (twImg   && twImg.getAttribute('content'))  img = twImg.getAttribute('content');
                else if (twImgS  && twImgS.getAttribute('content')) img = twImgS.getAttribute('content');
                else if (imgSrc  && imgSrc.getAttribute('href'))     img = imgSrc.getAttribute('href');
                else {
                    const articleImgs = document.querySelectorAll('article img, main img, [class*="article"] img');
                    for (const el of articleImgs) {
                        const src = el.src || el.dataset.src || el.dataset.lazySrc;
                        if (src && src.startsWith('http') && !src.includes('logo') && !src.includes('icon')) {
                            img = src;
                            break;
                        }
                    }
                }

                return [title || null, img || null];
            }""")

            if isinstance(result, list) and len(result) == 2:
                page_title, source_image = result
            else:
                page_title, source_image = None, None

            if page_title:
                page_title = _clean_title(page_title)
                print(f"[PLAYWRIGHT] ✓ Title extracted: {repr(page_title[:80])}")
            else:
                print(f"[PLAYWRIGHT] ✗ No title found via JS for: {url[:80]}")

            if source_image:
                print(f"[PLAYWRIGHT] ✓ Source image extracted: {source_image[:100]}")
            else:
                print(f"[PLAYWRIGHT] ✗ No og:image found via JS for: {url[:80]}")

        except Exception as meta_err:
            print(f"[PLAYWRIGHT] ✗ Meta extraction JS error: {meta_err}")
            page_title, source_image = None, None

        selectors = [
            "article p", "[class*='article-body'] p", "[class*='article__body'] p",
            "[class*='body-text'] p", "main p", "p"
        ]
        for sel in selectors:
            try:
                text = await page.eval_on_selector_all(
                    sel,
                    "els => els.map(e => e.innerText.trim()).filter(t => t.length > 40).join(' ')"
                )
                if len(text) > 200:
                    return text[:4000], source_image, page_title
            except Exception:
                continue
        return "", source_image, page_title
    except Exception as e:
        print(f"[PLAYWRIGHT-THREAD]   ✗ fetch {url}: {type(e).__name__}: {e}")
        return "", None, None
    finally:
        await page.close()


# ──────────────────────────────────────────────
# HTTP content fetch
# ──────────────────────────────────────────────
async def fetch_content_http(url: str) -> tuple:
    try:
        headers = {
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/124.0 Safari/537.36"
            ),
            "Accept-Language": "en-US,en;q=0.9",
        }
        async with httpx.AsyncClient(timeout=30, follow_redirects=True, headers=headers) as client:
            res = await client.get(url)
            if res.status_code != 200:
                print(f"[HTTP]   ✗ HTTP {res.status_code} for {url}")
                return "", None, None
            html = res.text

            real_title = extract_title_from_html(html, url)

            paras   = re.findall(r"<p[^>]*>(.*?)</p>", html, re.DOTALL | re.IGNORECASE)
            clean   = [re.sub(r"<[^>]+>", "", p).strip() for p in paras]
            content = " ".join(t for t in clean if len(t) > 40)[:4000]
            print(f"[HTTP]   {url} → {len(content)} chars | title: {repr((real_title or '')[:60])}")
            return content, html, real_title
    except Exception as e:
        print(f"[HTTP]   ✗ {type(e).__name__}: {e}")
        return "", None, None


# ──────────────────────────────────────────────
# Per-source HTTP orchestrator
# ──────────────────────────────────────────────
async def scrape_source_http(source: Dict, known_urls: Set[str]) -> List[Dict]:
    log_sep(f"SCRAPING SOURCE (HTTP) — {source['name']}")
    candidates: List[str] = []

    rss_urls = await discover_via_rss(source, known_urls)
    candidates.extend(rss_urls)
    print(f"[{source['name']}] After RSS     : {len(candidates)} candidates")

    if len(candidates) < CANDIDATE_LIMIT:
        sitemap_urls = await discover_via_sitemap(source, known_urls)
        for u in sitemap_urls:
            if u not in candidates:
                candidates.append(u)
        print(f"[{source['name']}] After sitemap : {len(candidates)} candidates")

    if not candidates:
        print(f"[WARN]  {source['name']} — zero HTTP candidates")
        return []

    random.shuffle(candidates)
    print(f"[{source['name']}] Examining up to {CANDIDATE_LIMIT} of {len(candidates)} candidates")

    articles: List[Dict] = []
    examined = 0

    for url in candidates:
        if len(articles) >= MAX_PER_SOURCE:
            break
        if examined >= CANDIDATE_LIMIT:
            break
        examined += 1
        print(f"\n[{source['name']}] [{examined}] {url}")

        if not await is_url_fresh(url):
            continue

        content, html, real_title = await fetch_content_http(url)
        if len(content) < 200:
            print(f"[{source['name']}]   ✗ Too short ({len(content)} chars), skipping")
            continue

        await mark_url_scraped(url)

        url_slug_title = url.rstrip("/").split("/")[-1].replace("-", " ").title()
        title = real_title or url_slug_title

        if real_title:
            print(f"[{source['name']}]   ✓ Real title: {repr(real_title[:70])}")
        else:
            print(f"[{source['name']}]   ⚠ No real title found — using URL slug: {repr(url_slug_title[:70])}")

        articles.append({
            "url":     url,
            "content": content,
            "html":    html,
            "source":  source["name"],
            "title":   title,
        })
        print(f"[{source['name']}]   ✓ ADDED ({len(content)} chars) [{len(articles)}/{MAX_PER_SOURCE}]")

    return articles


# ──────────────────────────────────────────────
# Main scrape loop — CIRCULAR PRIORITY ORDER
# ──────────────────────────────────────────────
async def scrape_all_with_retry() -> List[Dict]:
    log_sep("SCRAPE — CIRCULAR PRIORITY ORDER")
    print(f"[SCRAPE] Goal: {MIN_SOURCE_ARTICLES} articles | Max retries per source: {MAX_SCRAPE_RETRIES}")

    known_urls     = await get_recently_scraped_urls()
    last_used      = await get_last_used_source()
    priority_order = _circular_priority_order(last_used)

    log_sec(f"[ROTATION] Priority order this run: {priority_order}")

    selected_source = await select_source_with_articles(priority_order, known_urls)

    if selected_source is None:
        fallback_name   = priority_order[0]
        selected_source = SOURCE_BY_NAME[fallback_name]
        print(f"[ROTATION] ⚠ No fresh URLs found in probe — falling back to priority-1 source: {fallback_name!r}")
    else:
        print(f"[ROTATION] ✓ Selected source: {selected_source['name']!r}")

    attempt_order = [selected_source["name"]] + [
        name for name in priority_order if name != selected_source["name"]
    ]
    print(f"[ROTATION] Attempt order: {attempt_order}")

    for source_name in attempt_order:
        source = SOURCE_BY_NAME[source_name]
        log_sec(f"TRYING SOURCE: {source_name}")

        source_articles: List[Dict] = []
        collected_urls:  Set[str]   = set()
        playwright_attempted = False

        for attempt in range(1, MAX_SCRAPE_RETRIES + 1):
            print(f"[SCRAPE] [{source_name}] HTTP Attempt {attempt}/{MAX_SCRAPE_RETRIES}")

            known_urls = await get_recently_scraped_urls()
            known_urls |= collected_urls
            print(f"[SCRAPE] Known/blocked URLs: {len(known_urls)}")

            http_articles = await scrape_source_http(source, known_urls)

            for a in http_articles:
                if a["url"] not in collected_urls:
                    source_articles.append(a)
                    collected_urls.add(a["url"])

            print(f"[SCRAPE] [{source_name}] After HTTP attempt {attempt}: {len(source_articles)} articles")

            if len(source_articles) >= MIN_SOURCE_ARTICLES:
                log_sep(f"✅ SOURCE HIT: {source_name} — {len(source_articles)} articles found. Stopping here.")
                await set_last_used_source(source_name)
                return source_articles

            if not playwright_attempted:
                playwright_attempted = True
                print(f"[SCRAPE] HTTP insufficient ({len(source_articles)}/{MIN_SOURCE_ARTICLES}) — launching Playwright for {source_name}…")
                try:
                    pw_articles = await run_playwright_scrape_in_thread(
                        [source],
                        known_urls | collected_urls,
                    )
                    for a in pw_articles:
                        if a["url"] not in collected_urls:
                            await mark_url_scraped(a["url"])
                            source_articles.append(a)
                            collected_urls.add(a["url"])
                    print(f"[SCRAPE] [{source_name}] After Playwright: {len(source_articles)} articles")
                except Exception as e:
                    print(f"[ERROR] Playwright failed for {source_name}: {type(e).__name__}: {e}")

            if len(source_articles) >= MIN_SOURCE_ARTICLES:
                log_sep(f"✅ SOURCE HIT: {source_name} — {len(source_articles)} articles found (after Playwright). Stopping here.")
                await set_last_used_source(source_name)
                return source_articles

            if attempt < MAX_SCRAPE_RETRIES:
                need = MIN_SOURCE_ARTICLES - len(source_articles)
                print(f"[SCRAPE] [{source_name}] Still need {need} more. Retrying in {RETRY_DELAY_SECONDS}s…")
                await asyncio.sleep(RETRY_DELAY_SECONDS)

        if len(source_articles) == 0:
            print(f"[SCRAPE] ✗ {source_name} yielded 0 new articles after {MAX_SCRAPE_RETRIES} attempts — trying next source")
        else:
            log_sep(f"⚠️ SOURCE PARTIAL HIT: {source_name} — only {len(source_articles)} articles (need {MIN_SOURCE_ARTICLES}), but using anyway.")
            await set_last_used_source(source_name)
            return source_articles

    print("[SCRAPE] ✗ All sources exhausted — no new articles found from any source")
    return []


# ──────────────────────────────────────────────
# Pexels image fetch (fallback only)
# ──────────────────────────────────────────────
async def fetch_pexels_image(query: str) -> Optional[str]:
    if not PEXELS_API_KEY:
        print("[PEXELS] ✗ PEXELS_API_KEY not set — skipping image fetch")
        return None

    search_query = f"{query} fashion"
    print(f"[PEXELS] Searching for: '{search_query}'")

    try:
        async with httpx.AsyncClient(timeout=20) as client:
            res = await client.get(
                "https://api.pexels.com/v1/search",
                headers={"Authorization": PEXELS_API_KEY},
                params={
                    "query":       search_query,
                    "per_page":    5,
                    "orientation": "landscape",
                },
            )
            print(f"[PEXELS] HTTP {res.status_code}")
            if res.status_code != 200:
                print(f"[PEXELS] ✗ Non-200 response: {res.text[:200]}")
                return None

            data   = res.json()
            photos = data.get("photos", [])
            if not photos:
                print(f"[PEXELS] ✗ No photos found for '{search_query}'")
                return await _pexels_fallback()

            photo = photos[0]
            image_url = (
                photo.get("src", {}).get("large2x")
                or photo.get("src", {}).get("large")
                or photo.get("src", {}).get("original")
            )
            if image_url:
                print(f"[PEXELS] ✓ Image URL: {image_url}")
            return image_url

    except Exception as e:
        print(f"[PEXELS] ✗ {type(e).__name__}: {e}")
        return None


async def _pexels_fallback() -> Optional[str]:
    fallback_queries = ["fashion style", "clothing runway", "fashion week"]
    for q in fallback_queries:
        try:
            async with httpx.AsyncClient(timeout=20) as client:
                res = await client.get(
                    "https://api.pexels.com/v1/search",
                    headers={"Authorization": PEXELS_API_KEY},
                    params={"query": q, "per_page": 3, "orientation": "landscape"},
                )
                if res.status_code == 200:
                    photos = res.json().get("photos", [])
                    if photos:
                        url = (
                            photos[0].get("src", {}).get("large2x")
                            or photos[0].get("src", {}).get("large")
                        )
                        if url:
                            print(f"[PEXELS] ✓ Fallback image ({q}): {url}")
                            return url
        except Exception:
            continue
    print("[PEXELS] ✗ All fallbacks failed")
    return None


# ──────────────────────────────────────────────
# LLM helpers
# ──────────────────────────────────────────────
async def generate_embedding(text: str) -> List[float]:
    if not OPENAI_API_KEY:
        print("[EMBED] ✗ OPENAI_API_KEY not set — skipping embedding")
        return []
    try:
        print(f"[EMBED] Generating for: '{text[:60]}…'")
        async with httpx.AsyncClient(timeout=60) as client:
            res = await client.post(
                "https://api.openai.com/v1/embeddings",
                headers={
                    "Authorization": f"Bearer {OPENAI_API_KEY}",
                    "Content-Type":  "application/json",
                },
                json={
                    "model": "text-embedding-3-small",
                    "input": text,
                },
            )
            res.raise_for_status()
            emb = res.json()["data"][0]["embedding"]
            print(f"[EMBED] ✓ Length: {len(emb)}")
            return emb
    except Exception as e:
        print(f"[EMBED] ✗ {type(e).__name__}: {e}")
        return []


# ──────────────────────────────────────────────
# Vector similarity (cosine) — pure Python
# ──────────────────────────────────────────────
def cosine_similarity(a: List[float], b: List[float]) -> float:
    if not a or not b or len(a) != len(b):
        return 0.0
    dot    = sum(x * y for x, y in zip(a, b))
    norm_a = math.sqrt(sum(x * x for x in a))
    norm_b = math.sqrt(sum(x * x for x in b))
    if norm_a == 0.0 or norm_b == 0.0:
        return 0.0
    return dot / (norm_a * norm_b)


async def vector_search_memory(
    query_text: str,
    memory_type: str,
    top_k: int = 10,
    min_similarity: float = 0.25,
) -> List[Dict]:
    log_sec(f"[VECTOR-SEARCH] type={memory_type} query='{query_text[:60]}' top_k={top_k}")

    pool = await get_pool()
    query_vec = await generate_embedding(query_text)

    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT id, content, payload, embedding, created_at
            FROM   memory_entries
            WHERE  type = $1
            ORDER  BY created_at DESC
            LIMIT  500
            """,
            memory_type,
        )

    if not rows:
        print(f"[VECTOR-SEARCH] No rows found for type={memory_type}")
        return []

    if query_vec:
        scored = []
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
                scored.append((sim, row))

        scored.sort(key=lambda x: x[0], reverse=True)
        results = [dict(r) for _, r in scored[:top_k]]
        print(f"[VECTOR-SEARCH] {len(results)} results above similarity {min_similarity}")
    else:
        print(f"[VECTOR-SEARCH] No query embedding — falling back to recency order")
        results = [dict(r) for r in rows[:top_k]]

    for item in results:
        if isinstance(item.get("payload"), str):
            try:
                item["payload"] = json.loads(item["payload"])
            except Exception:
                item["payload"] = {}
        if isinstance(item.get("created_at"), datetime):
            item["created_at"] = item["created_at"].isoformat()

    return results


# ──────────────────────────────────────────────
# Store design_signal in memory_entries
# ──────────────────────────────────────────────
async def store_design_signal_embedding(
    tag: str,
    category: Optional[str],
    vote_score: int,
    like_score: int,
    comment_score: int,
    trend_score: int,
    total_score: int,
):
    content_text = (
        f"Design signal: {tag}. "
        f"Category: {category or 'general'}. "
        f"Audience engagement — votes: {vote_score}, likes: {like_score}, "
        f"comments: {comment_score}, trend mentions: {trend_score}. "
        f"Total score: {total_score}."
    )

    embedding = await generate_embedding(content_text)

    payload = {
        "tag":           tag,
        "category":      category,
        "vote_score":    vote_score,
        "like_score":    like_score,
        "comment_score": comment_score,
        "trend_score":   trend_score,
        "total_score":   total_score,
    }

    pool = await get_pool()
    async with pool.acquire() as conn:
        await conn.execute(
            """
            DELETE FROM memory_entries
            WHERE  type = 'design_signal'
              AND  payload->>'tag' = $1
            """,
            tag,
        )
        await conn.execute(
            """
            INSERT INTO memory_entries (type, content, payload, embedding, created_at)
            VALUES ($1, $2, $3::jsonb, $4::jsonb, NOW())
            """,
            "design_signal",
            content_text,
            json.dumps(payload),
            json.dumps(embedding),
        )

    print(f"[EMBED-SIGNAL] ✓ Stored embedding for signal tag='{tag}' score={total_score}")


# ──────────────────────────────────────────────
# Store trend in memory_entries
# ──────────────────────────────────────────────
async def store_trend_embedding(
    trend_title: str,
    trend_description: str,
    related_tags: List[str],
    source_articles: List[str],
):
    tag_str = ", ".join(related_tags[:6]) if related_tags else ""
    content_text = (
        f"Fashion trend: {trend_title}. "
        f"{trend_description} "
        f"Related tags: {tag_str}."
    )

    embedding = await generate_embedding(content_text)

    payload = {
        "title":           trend_title,
        "description":     trend_description,
        "related_tags":    related_tags,
        "source_articles": source_articles,
    }

    pool = await get_pool()
    async with pool.acquire() as conn:
        await conn.execute(
            """
            INSERT INTO memory_entries (type, content, payload, embedding, created_at)
            VALUES ($1, $2, $3::jsonb, $4::jsonb, NOW())
            """,
            "trend",
            content_text,
            json.dumps(payload),
            json.dumps(embedding),
        )

    print(f"[EMBED-TREND] ✓ Stored embedding for trend='{trend_title}'")


# ──────────────────────────────────────────────
# FIX D: Single context assembler (reads only from memory/RAG)
# ──────────────────────────────────────────────
async def assemble_design_context(
    query: str = "fashion design trends audience preferences",
    top_k_signals: int = 10,
    top_k_trends:  int = 10,
) -> Dict[str, Any]:
    """
    Authoritative context assembler. Reads ONLY from memory/RAG retrieval
    outputs — never directly from raw source tables.
    """
    log_sec(f"[CONTEXT-ASSEMBLER] Building from memory/RAG — query='{query[:60]}'")

    signal_rows = await vector_search_memory(
        query_text=query,
        memory_type="design_signal",
        top_k=top_k_signals,
        min_similarity=0.20,
    )

    trend_rows = await vector_search_memory(
        query_text=query,
        memory_type="trend",
        top_k=top_k_trends,
        min_similarity=0.20,
    )

    brief_rows = await vector_search_memory(
        query_text=query,
        memory_type="design_brief",
        top_k=3,
        min_similarity=0.15,
    )

    # Build structured signal summary
    signals = []
    signal_lines = []
    for row in signal_rows:
        p = row.get("payload") or {}
        tag           = p.get("tag", row.get("content", "unknown"))
        category      = p.get("category", "—")
        total_score   = p.get("total_score", 0)
        vote_score    = p.get("vote_score", 0)
        like_score    = p.get("like_score", 0)
        comment_score = p.get("comment_score", 0)
        trend_score   = p.get("trend_score", 0)
        signals.append(p)
        signal_lines.append(
            f"  • [{tag}] category={category} | "
            f"score={total_score} "
            f"(votes={vote_score}, likes={like_score}, "
            f"comments={comment_score}, trends={trend_score})"
        )

    signal_summary = "\n".join(signal_lines) if signal_lines else "  (no audience signal data available yet)"

    # Build structured trend summary
    trends = []
    trend_lines = []
    for row in trend_rows:
        p     = row.get("payload") or {}
        title = p.get("title", row.get("content", "unknown"))
        desc  = p.get("description", "")
        tags  = p.get("related_tags", [])
        tag_str = ", ".join(tags[:4]) if tags else ""
        trends.append(p)
        line = f"  • {title}"
        if desc:
            line += f": {desc[:120]}"
        if tag_str:
            line += f" [tags: {tag_str}]"
        trend_lines.append(line)

    trend_summary = "\n".join(trend_lines) if trend_lines else "  (no trend memory available yet)"

    # Build brief context
    brief_context = ""
    for row in brief_rows:
        p = row.get("payload") or {}
        brief_context += p.get("brief_text", row.get("content", "")) + "\n"

    print(f"[CONTEXT-ASSEMBLER] ✓ {len(signal_rows)} signals | {len(trend_rows)} trends | {len(brief_rows)} briefs")

    return {
        "signal_summary":  signal_summary,
        "trend_summary":   trend_summary,
        "brief_context":   brief_context.strip(),
        "signals":         signals,
        "trends":          trends,
        "query":           query,
        "retrieved_at":    datetime.utcnow().isoformat(),
    }


# Keep backward-compatible alias
async def build_design_context_via_vector_search(
    query: str = "fashion design trends audience preferences",
    top_k_signals: int = 10,
    top_k_trends:  int = 10,
) -> Dict[str, str]:
    ctx = await assemble_design_context(query, top_k_signals, top_k_trends)
    return {
        "signal_summary": ctx["signal_summary"],
        "trend_summary":  ctx["trend_summary"],
    }


# ──────────────────────────────────────────────
# FIX C: Feedback Loop Processor
# ──────────────────────────────────────────────

# Canonical event type weights
INTERACTION_EVENT_WEIGHTS: Dict[str, int] = {
    "blog_comment":     4,
    "vote_cast":        3,
    "blog_like":        2,
    "save_look":        2,
    "chat_query":       1,
    "design_view":      1,
    "paid_feature_use": 5,
}

VALID_EVENT_TYPES = set(INTERACTION_EVENT_WEIGHTS.keys())


async def emit_interaction_event(
    pool: asyncpg.Pool,
    event_type: str,
    entity_id: Optional[str],
    entity_type: Optional[str],
    payload: Dict[str, Any],
    user_id: Optional[int] = None,
):
    """
    Persist a canonical interaction event. All feedback signals must flow
    through this function before entering the memory layer.
    """
    if event_type not in VALID_EVENT_TYPES:
        print(f"[EVENT] ⚠ Unknown event_type='{event_type}' — storing anyway")

    async with pool.acquire() as conn:
        await conn.execute("""
            INSERT INTO interaction_events
                (event_type, user_id, entity_id, entity_type, payload, created_at)
            VALUES ($1, $2, $3, $4, $5::jsonb, NOW())
        """, event_type, user_id, entity_id, entity_type, json.dumps(payload))

    print(f"[EVENT] ✓ {event_type} | entity={entity_type}:{entity_id} | user={user_id}")


async def run_feedback_loop_processor(pool: asyncpg.Pool):
    """
    FIX C: Reads canonical interaction_events, transforms them into
    normalized design signals, and inserts into memory_entries.
    No longer bypasses the event schema.
    """
    log_sec(f"[FEEDBACK-LOOP] Processing interaction events → memory — {datetime.utcnow().isoformat()}Z")

    async with pool.acquire() as conn:
        # Section 4 closed loop: only pull events not yet processed (processed_at IS NULL).
        # This prevents double-counting and makes this the ONE authoritative pipeline.
        event_rows = await conn.fetch("""
            SELECT id, event_type, entity_id, entity_type, payload, created_at
            FROM interaction_events
            WHERE processed_at IS NULL
            ORDER BY created_at ASC
        """)

        # Pull existing design signals for tag → category mapping
        signal_rows = await conn.fetch("""
            SELECT DISTINCT ON (tag) tag, category FROM design_signals ORDER BY tag, computed_at DESC
        """)

    tag_categories: Dict[str, str] = {r["tag"]: r["category"] for r in signal_rows}
    tag_scores: Dict[str, Dict[str, int]] = {}

    for evt in event_rows:
        evt_type = evt["event_type"]
        weight   = INTERACTION_EVENT_WEIGHTS.get(evt_type, 1)
        payload  = evt["payload"] or {}

        if isinstance(payload, str):
            try:
                payload = json.loads(payload)
            except Exception:
                payload = {}

        # Bug 1 fix: COALESCE tags OR related_tags from payload
        tags = payload.get("tags", [])
        if isinstance(tags, str):
            try:
                tags = json.loads(tags)
            except Exception:
                tags = [tags]

        if not tags:
            tags = payload.get("related_tags", [])
        if isinstance(tags, str):
            try:
                tags = json.loads(tags)
            except Exception:
                tags = [tags]

        if not tags and evt.get("entity_type") == "design":
            tags = payload.get("top_tags", [])

        for tag in tags:
            if not tag:
                continue
            if tag not in tag_scores:
                tag_scores[tag] = {
                    "vote_score": 0, "like_score": 0,
                    "comment_score": 0, "trend_score": 0,
                }
            if evt_type == "vote_cast":
                tag_scores[tag]["vote_score"] += weight
            elif evt_type in ("blog_like", "save_look"):
                tag_scores[tag]["like_score"] += weight
            elif evt_type == "blog_comment":
                tag_scores[tag]["comment_score"] += weight
            elif evt_type == "chat_query":
                tag_scores[tag]["trend_score"] += weight
            else:
                tag_scores[tag]["trend_score"] += weight

    count = 0
    pool = await get_pool()
    for tag, scores in tag_scores.items():
        total = sum(scores.values())
        category = tag_categories.get(tag)
        try:
            # FIX C: Single normalized pipeline — write to BOTH memory_entries (RAG)
            # AND design_signals (the authoritative signal table), removing dual-rail.
            await store_design_signal_embedding(
                tag=tag,
                category=category,
                vote_score=scores["vote_score"],
                like_score=scores["like_score"],
                comment_score=scores["comment_score"],
                trend_score=scores["trend_score"],
                total_score=total,
            )
            # Upsert into design_signals so the entire system reads from this one path
            async with pool.acquire() as conn:
                await conn.execute("""
                    INSERT INTO design_signals
                        (tag, category, vote_score, like_score, comment_score, trend_score, total_score, computed_at)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
                    ON CONFLICT (tag) DO UPDATE SET
                        category      = COALESCE(EXCLUDED.category, design_signals.category),
                        vote_score    = design_signals.vote_score    + EXCLUDED.vote_score,
                        like_score    = design_signals.like_score    + EXCLUDED.like_score,
                        comment_score = design_signals.comment_score + EXCLUDED.comment_score,
                        trend_score   = design_signals.trend_score   + EXCLUDED.trend_score,
                        total_score   = design_signals.total_score   + EXCLUDED.total_score,
                        computed_at   = NOW()
                """,
                    tag, category,
                    scores["vote_score"], scores["like_score"],
                    scores["comment_score"], scores["trend_score"],
                    total,
                )
            count += 1
        except Exception as e:
            print(f"[FEEDBACK-LOOP] ✗ tag={tag}: {e}")

    # Mark all processed events so they are not double-counted on next run
    if event_rows:
        processed_ids = [r["id"] for r in event_rows]
        try:
            async with pool.acquire() as conn:
                await conn.execute(
                    "UPDATE interaction_events SET processed_at = NOW() WHERE id = ANY($1::bigint[])",
                    processed_ids,
                )
            print(f"[FEEDBACK-LOOP] ✓ Marked {len(processed_ids)} events as processed")
        except Exception as mark_err:
            print(f"[FEEDBACK-LOOP] ⚠ Failed to mark events processed: {mark_err}")

    print(f"[FEEDBACK-LOOP] ✓ Processed {len(event_rows)} events → {count} memory signals updated (single normalized pipeline)")
    return {"events_processed": len(event_rows), "signals_updated": count}


# ──────────────────────────────────────────────
# Article rewrite prompt builder
# ──────────────────────────────────────────────
def build_rewrite_prompt(title: str, content: str) -> str:
    prompt = f"""You are a professional fashion editor writing for a high-end fashion magazine.

Below is an original fashion article. Your task is to rewrite the body content in a fresh, engaging editorial voice.

ORIGINAL TITLE: {title}

ORIGINAL CONTENT:
{content[:3000]}

Rules:
- DO NOT include a TITLE field in your response — the title is handled separately and must not be changed
- Rewrite the body content completely in your own editorial voice
- Minimum 400 words for the body
- Use paragraphs, no bullet points
- Extract 3 relevant fashion trends mentioned or implied in the article
- Suggest a Pexels image search query based on the article topic

Respond in EXACTLY this format (no TITLE field):

EXCERPT: <2-sentence summary of the article>
TAGS: <tag1>, <tag2>, <tag3>, <tag4>, <tag5>
BODY: <rewritten article body, minimum 400 words>
TRENDS: <TrendName1>:<one sentence description>, <TrendName2>:<one sentence description>, <TrendName3>:<one sentence description>
IMAGE_QUERY: <3-5 word phrase describing the ideal cover image>
"""
    print(f"[PROMPT] Built rewrite prompt — {len(prompt)} chars | title: {repr(title[:60])}")
    return prompt


# ──────────────────────────────────────────────
# AI Comment generation
# ──────────────────────────────────────────────
async def generate_and_store_article_comments(
    article_id: int,
    article_title: str,
    article_content: str,
    pool: asyncpg.Pool,
):
    if not OPENAI_API_KEY:
        print(f"[AI-COMMENTS] ✗ OPENAI_API_KEY not set — skipping comment generation for article {article_id}")
        return

    count = random.choice([3, 4, 4, 5, 5, 6, 7, 8, 9, 10, 11, 12])
    handles = [_generate_forum_handle() for _ in range(count)]

    time_labels = [
        "just now", "2 minutes ago", "8 minutes ago", "23 minutes ago",
        "an hour ago", "3 hours ago", "yesterday", "2 days ago",
        "3 days ago", "4 days ago", "5 days ago", "a week ago",
    ]

    system_prompt = """You write comments for a fashion/lifestyle blog. They must feel 100% written by real people from forums like Reddit, StyleForum, or Fashionista comments sections.

Rules:
- Sound completely human — varied sentence lengths, casual phrasing, first-person opinions
- Mix tones: some casual, some thoughtful, some skeptical, some enthusiastic, some personal
- Some comments can be short (1 sentence), some longer (3-4 sentences)
- Reference specific details from the article when it makes sense
- Avoid AI clichés: never say "This article really resonated", "Great read!", "As someone who...", "I completely agree"
- Some commenters can be slightly skeptical, ask a question, or share a personal anecdote
- Natural punctuation — people omit commas, use ellipses, write in fragments sometimes
- Do NOT sound like marketing copy or a PR response
- Vary the topics within fashion: some talk about price, some about personal style, some about trends, some about where to buy

Return ONLY valid JSON — no markdown, no backticks, no preamble.
Format: {"comments": [{"text": "...", "time": "..."}, ...]}"""

    user_prompt = f"""Article title: "{article_title}"

Content excerpt:
{article_content[:1400]}

Generate exactly {count} comments from different types of real readers.
Assign these time labels in order to each comment: {json.dumps(time_labels[:count])}

Return JSON only."""

    try:
        async with httpx.AsyncClient(timeout=45) as client:
            res = await client.post(
                "https://api.openai.com/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {OPENAI_API_KEY}",
                    "Content-Type":  "application/json",
                },
                json={
                    "model":           "gpt-4o-mini",
                    "temperature":     0.95,
                    "max_tokens":      1000,
                    "response_format": {"type": "json_object"},
                    "messages": [
                        {"role": "system", "content": system_prompt},
                        {"role": "user",   "content": user_prompt},
                    ],
                }
            )
        res.raise_for_status()
        raw = res.json()["choices"][0]["message"]["content"].strip()

        parsed   = json.loads(raw)
        comments = parsed.get("comments", []) if isinstance(parsed, dict) else parsed
        if not isinstance(comments, list):
            comments = []

        saved_count = 0
        async with pool.acquire() as conn:
            for i, c in enumerate(comments[:count]):
                handle = handles[i] if i < len(handles) else _generate_forum_handle()
                text   = (c.get("text") or "").strip()
                time_  = c.get("time") or time_labels[i % len(time_labels)]
                if not text:
                    continue
                try:
                    await conn.execute("""
                        INSERT INTO ai_comments (article_id, user_name, text, time_label)
                        VALUES ($1, $2, $3, $4)
                        ON CONFLICT (article_id, user_name, text) DO NOTHING
                    """, article_id, handle, text, time_)
                    saved_count += 1
                except Exception as insert_err:
                    print(f"[AI-COMMENTS] ✗ Insert error for article {article_id}: {insert_err}")

        print(f"[AI-COMMENTS] ✓ Generated and stored {saved_count} comments for article {article_id}")

    except json.JSONDecodeError as e:
        print(f"[AI-COMMENTS] ✗ JSON parse error for article {article_id}: {e}")
    except Exception as e:
        print(f"[AI-COMMENTS] ✗ Failed for article {article_id}: {type(e).__name__}: {e}")


# ──────────────────────────────────────────────
# Rewrite a single scraped article with AI and save to DB
# ──────────────────────────────────────────────
async def rewrite_article_content(article: Dict) -> Optional[Dict]:
    title   = article.get("title", "").strip()
    content = article.get("content", "").strip()
    url     = article.get("url", "")
    source  = article.get("source", "")

    if not title or len(content) < 200:
        print(f"[REWRITE] ✗ Skipping — title empty or content too short ({len(content)} chars): {url}")
        return None

    print(f"\n[REWRITE] Processing: {repr(title[:70])}")
    print(f"[REWRITE] Source URL: {url}")
    prompt = build_rewrite_prompt(title, content)

    try:
        text = await call_openai(prompt)
    except Exception as e:
        print(f"[REWRITE] ✗ OpenAI failed: {type(e).__name__}: {e}")
        return None

    parsed = parse_llm_response(text)
    parsed["title"] = title
    print(f"[REWRITE] ✓ Title locked to source: {repr(title[:70])}")

    body_ok = len(parsed.get("body", "")) >= 400
    if not body_ok:
        print(f"[REWRITE] ✗ Body too short ({len(parsed.get('body',''))} chars) for: {repr(title[:60])}")
        return None

    image_url = None

    playwright_image = article.get("source_image")
    if playwright_image and playwright_image.startswith("http"):
        image_url = playwright_image
        print(f"[REWRITE] ✓ Using Playwright source image: {image_url[:100]}")

    if not image_url:
        raw_html   = article.get("html")
        source_url = article.get("url", "")
        if raw_html or source_url:
            print(f"[REWRITE] Attempting HTML image extraction for: {source_url[:80]}")
            image_url = await extract_article_image(source_url, raw_html)
            if image_url:
                print(f"[REWRITE] ✓ Using HTML-extracted source image: {image_url[:100]}")

    if not image_url:
        print(f"[REWRITE] ✗ No source image found — falling back to Pexels")
        image_query = parsed.get("image_query") or title
        image_url   = await fetch_pexels_image(image_query)
        if not image_url and parsed.get("tags"):
            image_url = await fetch_pexels_image(parsed["tags"][0])
        if image_url:
            print(f"[REWRITE] ✓ Pexels fallback image: {image_url[:100]}")
        else:
            print(f"[REWRITE] ✗ All image sources exhausted — article will have no image")

    print(f"[REWRITE] Final image_url: {image_url}")

    slug = re.sub(r"[^a-z0-9 ]", "", title.lower())
    slug = re.sub(r"\s+", "-", slug) + f"-{int(datetime.now().timestamp())}"

    article_urls = [url]
    sources      = [source]

    pool = await get_pool()
    article_db_id = None

    async with pool.acquire() as conn:
        row = await conn.fetchrow("""
            INSERT INTO blog_articles
                (slug, title, excerpt, body, image_url, tags, trends, article_urls, sources, created_at)
            VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8::jsonb, $9::jsonb, NOW())
            ON CONFLICT (slug) DO NOTHING
            RETURNING id
        """,
            slug,
            parsed["title"],
            parsed.get("excerpt", ""),
            parsed["body"],
            image_url,
            json.dumps(parsed.get("tags", [])),
            json.dumps(parsed.get("trends", [])),
            json.dumps(article_urls),
            json.dumps(sources),
        )
        if row:
            article_db_id = row["id"]

    print(f"[REWRITE] ✓ Saved — slug: {slug} | title: {repr(parsed['title'][:70])}")

    if article_db_id:
        await generate_and_store_article_comments(
            article_id=article_db_id,
            article_title=parsed["title"],
            article_content=parsed["body"],
            pool=pool,
        )
    else:
        print(f"[REWRITE] ⚠ Article already existed (slug conflict) — skipping comment generation")

    for trend in parsed.get("trends", []):
        if not trend.get("title"):
            continue
        async with pool.acquire() as conn:
            await conn.execute("""
                INSERT INTO trends (title, description, related_tags, source_articles, created_at)
                VALUES ($1, $2, $3::jsonb, $4::jsonb, NOW())
            """,
                trend["title"],
                trend.get("description", ""),
                json.dumps(parsed.get("tags", [])),
                json.dumps(article_urls),
            )
        print(f"[REWRITE] ✓ Trend saved: '{trend['title']}'")
        await store_trend_embedding(
            trend_title=trend["title"],
            trend_description=trend.get("description", ""),
            related_tags=parsed.get("tags", []),
            source_articles=article_urls,
        )

    return {**parsed, "slug": slug, "articleUrls": article_urls, "sources": sources, "image_url": image_url}


def parse_llm_response(text: str) -> Dict:
    log_sec("PARSING LLM RESPONSE")
    print(f"[PARSE] Response: {len(text)} chars")
    print(f"[PARSE] First 400 chars:\n{text[:400]}\n")

    excerpt     = (re.search(r"^EXCERPT:\s*(.+)",                         text, re.I | re.M) or [None, ""])[1].strip()
    tags_raw    = (re.search(r"^TAGS:\s*(.+)",                            text, re.I | re.M) or [None, ""])[1].strip()
    body        = (re.search(r"BODY:\s*([\s\S]*?)(?=\nTRENDS:|$)",        text, re.I)        or [None, ""])[1].strip()
    trends_raw  = (re.search(r"TRENDS:\s*([\s\S]*?)(?=\nIMAGE_QUERY:|$)", text, re.I)        or [None, ""])[1].strip()
    image_query = (re.search(r"^IMAGE_QUERY:\s*(.+)",                     text, re.I | re.M) or [None, ""])[1].strip()

    tags   = [t.strip() for t in tags_raw.split(",") if t.strip()]
    trends = []
    for item in re.split(r",\s*(?=[A-Z])", trends_raw):
        if ":" in item:
            parts = item.split(":", 1)
            trends.append({"title": parts[0].strip(), "description": parts[1].strip()})

    print(f"[PARSE] excerpt     : {repr(excerpt[:80])}")
    print(f"[PARSE] tags        : {tags}")
    print(f"[PARSE] body len    : {len(body)} chars")
    print(f"[PARSE] trends      : {[t['title'] for t in trends]}")
    print(f"[PARSE] image_query : {repr(image_query)}")
    return {
        "title":        "",
        "excerpt":      excerpt,
        "tags":         tags,
        "body":         body,
        "trends":       trends,
        "image_query":  image_query,
    }


async def call_openai(prompt: str) -> str:
    if not OPENAI_API_KEY:
        raise RuntimeError("OPENAI_API_KEY is not set in .env")

    print("[OPENAI] Calling gpt-4o-mini…")
    async with httpx.AsyncClient(timeout=120) as client:
        res = await client.post(
            "https://api.openai.com/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {OPENAI_API_KEY}",
                "Content-Type":  "application/json",
            },
            json={
                "model":       "gpt-4o-mini",
                "max_tokens":  4096,
                "temperature": 0.7,
                "messages": [
                    {
                        "role":    "system",
                        "content": "You are a professional fashion editor writing for a high-end fashion magazine.",
                    },
                    {
                        "role":    "user",
                        "content": prompt,
                    },
                ],
            },
        )

    print(f"[OPENAI] HTTP {res.status_code}")
    if res.status_code != 200:
        print(f"[OPENAI] ✗ Error body: {res.text[:400]}")
        res.raise_for_status()

    data   = res.json()
    finish = data["choices"][0].get("finish_reason", "unknown")
    text   = data["choices"][0]["message"]["content"]
    usage  = data.get("usage", {})
    print(f"[OPENAI] finish_reason : {finish}")
    print(f"[OPENAI] tokens used   : {usage}")
    print(f"[OPENAI] Response len  : {len(text)} chars")
    return text


# ──────────────────────────────────────────────
# Article generation
# ──────────────────────────────────────────────
async def generate_article(articles: List[Dict]):
    log_sep("ARTICLE GENERATION — PER-ARTICLE REWRITE MODE")
    print(f"[GEN] Articles to process: {len(articles)}")

    if not articles:
        print(f"[GEN] ✗ No articles to process. Aborting.")
        return None

    results = []
    for i, article in enumerate(articles, 1):
        print(f"\n[GEN] ── [{i}/{len(articles)}] {article.get('url', 'no-url')}")
        print(f"[GEN]    Title: {repr(article.get('title', '')[:70])}")
        result = await rewrite_article_content(article)
        if result:
            results.append(result)
            print(f"[GEN] ✓ Article {i} saved: {result['slug']}")
        else:
            print(f"[GEN] ✗ Article {i} skipped (rewrite failed or too short)")

    print(f"\n[GEN] Done — {len(results)}/{len(articles)} articles successfully rewritten and saved")

    return results[-1] if results else None


# ──────────────────────────────────────────────
# Preference-driven proxy voting helpers
# ──────────────────────────────────────────────
async def get_or_create_proxy_preferences(pool: asyncpg.Pool, user_id: int) -> Dict[str, float]:
    """Load user's proxy voting preferences or return defaults."""
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT * FROM proxy_preferences WHERE user_id = $1",
            user_id
        )
    
    if row:
        # Extract all preference columns
        return {
            "aesthetic_minimalist_weight": row["aesthetic_minimalist_weight"],
            "aesthetic_bold_weight": row["aesthetic_bold_weight"],
            "aesthetic_eclectic_weight": row["aesthetic_eclectic_weight"],
            "material_luxury_weight": row["material_luxury_weight"],
            "material_sustainable_weight": row["material_sustainable_weight"],
            "material_experimental_weight": row["material_experimental_weight"],
            "silhouette_fitted_weight": row["silhouette_fitted_weight"],
            "silhouette_relaxed_weight": row["silhouette_relaxed_weight"],
            "silhouette_structured_weight": row["silhouette_structured_weight"],
            "design_classic_weight": row["design_classic_weight"],
            "design_trendy_weight": row["design_trendy_weight"],
            "design_avant_garde_weight": row["design_avant_garde_weight"],
            "category_apparel_weight": row["category_apparel_weight"],
            "category_accessories_weight": row["category_accessories_weight"],
            "category_footwear_weight": row["category_footwear_weight"],
            "category_jewelry_weight": row["category_jewelry_weight"],
        }
    
    # Return defaults (all 50.0)
    return {
        "aesthetic_minimalist_weight": 50.0,
        "aesthetic_bold_weight": 50.0,
        "aesthetic_eclectic_weight": 50.0,
        "material_luxury_weight": 50.0,
        "material_sustainable_weight": 50.0,
        "material_experimental_weight": 50.0,
        "silhouette_fitted_weight": 50.0,
        "silhouette_relaxed_weight": 50.0,
        "silhouette_structured_weight": 50.0,
        "design_classic_weight": 50.0,
        "design_trendy_weight": 50.0,
        "design_avant_garde_weight": 50.0,
        "category_apparel_weight": 50.0,
        "category_accessories_weight": 50.0,
        "category_footwear_weight": 50.0,
        "category_jewelry_weight": 50.0,
    }


async def compute_preference_score(
    product: Dict,
    preferences: Dict[str, float],
    user_history: Dict,
) -> Dict[str, Any]:
    """
    Deterministic preference scoring for proxy voting.
    
    Returns: {
        'preference_score': float,  # Score from explicit preferences
        'matched_preferences': [str],  # Which preferences matched
        'boosted_by': [str],  # Boost reasons
    }
    """
    score = 0.0
    matched_prefs = []
    boosted_by = []
    
    # Get product category
    category = product.get("category", "").lower()
    if category == "apparel":
        score += preferences.get("category_apparel_weight", 50.0)
        matched_prefs.append(f"category:apparel({preferences.get('category_apparel_weight', 50.0)})")
    elif category == "accessories":
        score += preferences.get("category_accessories_weight", 50.0)
        matched_prefs.append(f"category:accessories({preferences.get('category_accessories_weight', 50.0)})")
    elif category == "footwear":
        score += preferences.get("category_footwear_weight", 50.0)
        matched_prefs.append(f"category:footwear({preferences.get('category_footwear_weight', 50.0)})")
    elif category == "jewelry":
        score += preferences.get("category_jewelry_weight", 50.0)
        matched_prefs.append(f"category:jewelry({preferences.get('category_jewelry_weight', 50.0)})")
    
    # Get product tags
    product_tags = json.loads(product.get("tags", "[]")) if isinstance(product.get("tags"), str) else product.get("tags", [])
    product_tags = [str(t).lower() for t in product_tags]
    
    # Match tags to preference categories
    aesthetic_matches = 0
    for tag in product_tags:
        if any(x in tag for x in ["minimal", "clean", "simple"]):
            score += preferences.get("aesthetic_minimalist_weight", 50.0) * 0.3
            aesthetic_matches += 1
        elif any(x in tag for x in ["bold", "dramatic", "eye-catching"]):
            score += preferences.get("aesthetic_bold_weight", 50.0) * 0.3
            aesthetic_matches += 1
        elif any(x in tag for x in ["eclectic", "mixed", "fusion"]):
            score += preferences.get("aesthetic_eclectic_weight", 50.0) * 0.3
            aesthetic_matches += 1
    
    if aesthetic_matches > 0:
        matched_prefs.append(f"aesthetic_matches:{aesthetic_matches}")
        boosted_by.append("aesthetic_preference_match")
    
    material_matches = 0
    for tag in product_tags:
        if any(x in tag for x in ["silk", "leather", "cashmere", "wool", "premium"]):
            score += preferences.get("material_luxury_weight", 50.0) * 0.2
            material_matches += 1
        elif any(x in tag for x in ["organic", "sustainable", "eco", "ethical"]):
            score += preferences.get("material_sustainable_weight", 50.0) * 0.2
            material_matches += 1
        elif any(x in tag for x in ["innovate", "experimental", "novel"]):
            score += preferences.get("material_experimental_weight", 50.0) * 0.2
            material_matches += 1
    
    if material_matches > 0:
        matched_prefs.append(f"material_matches:{material_matches}")
        boosted_by.append("material_preference_match")
    
    # Normalize score
    score = min(max(score, 0.0), 300.0)  # Cap at reasonable max
    
    return {
        "preference_score": score,
        "matched_preferences": matched_prefs,
        "boosted_by": boosted_by,
    }


async def store_vote_explanation(
    pool: asyncpg.Pool,
    vote_id: int,
    user_id: int,
    product_id: str,
    explanation: Dict[str, Any],
) -> None:
    """Store explanation metadata for a proxy vote (FIX F: persist full JSON too)."""
    try:
        async with pool.acquire() as conn:
            await conn.execute("""
                INSERT INTO proxy_vote_explanations (
                    vote_id, product_id, user_id,
                    preference_score, history_score, combined_score,
                    matched_preferences, matched_tags, boosted_by,
                    penalty_applied, tie_break_reason, score_computation_method,
                    full_explanation_json, created_at
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb, NOW())
            """,
                vote_id,
                product_id,
                user_id,
                explanation.get("preference_score", 0.0),
                explanation.get("history_score", 0.0),
                explanation.get("combined_score", 0.0),
                explanation.get("matched_preferences", []),
                explanation.get("matched_tags", []),
                explanation.get("boosted_by", []),
                explanation.get("penalty_applied"),
                explanation.get("tie_break_reason"),
                explanation.get("score_computation_method", "unknown"),
                json.dumps(explanation),
            )
    except Exception as e:
        print(f"[PROXY-JOB] ⚠️  Failed to store vote explanation: {e}")


# ──────────────────────────────────────────────
# Proxy Voting Agent Job
# ──────────────────────────────────────────────
async def run_proxy_voting_job():
    log_sep(f"PROXY VOTING JOB — {datetime.utcnow().isoformat()}Z")

    pool = await get_pool()

    async with pool.acquire() as conn:
        print("\n[DEBUG] Fetching ALL users in proxy settings...")
        all_users = await conn.fetch("""
            SELECT user_id, enabled, next_run_at, NOW() as now
            FROM user_proxy_settings
        """)
        for u in all_users:
            print(f"[DEBUG] user_id={u['user_id']} | enabled={u['enabled']} | next_run_at={u['next_run_at']} | now={u['now']}")

        print("\n[DEBUG] Fetching DUE users...")
        due_users = await conn.fetch("""
            SELECT user_id, next_run_at, NOW() as now
            FROM user_proxy_settings
            WHERE enabled = TRUE
              AND (next_run_at IS NULL OR next_run_at <= NOW())
        """)
        for u in due_users:
            print(f"[DEBUG] ✅ DUE user_id={u['user_id']} | next_run_at={u['next_run_at']} | now={u['now']}")

    if not due_users:
        print("[PROXY-JOB] No users due for proxy voting today.")
        return

    print(f"[PROXY-JOB] {len(due_users)} user(s) due for a proxy vote")

    for row in due_users:
        user_id = row["user_id"]
        print(f"\n[PROXY-JOB] ── user_id={user_id} ──────────────────────")

        async with pool.acquire() as conn:
            voted_rows = await conn.fetch("""
                SELECT pc.item_id, pc.category, pc.tags
                FROM item_votes iv
                JOIN product_catalog pc ON pc.item_id = iv.item_id
                WHERE iv.user_id = $1
            """, user_id)

            print(f"[DEBUG] voted_rows count = {len(voted_rows)}")

            unvoted_rows = await conn.fetch("""
                SELECT pc.item_id, pc.name, pc.category, pc.tags
                FROM product_catalog pc
                WHERE pc.item_id NOT IN (
                    SELECT item_id FROM item_votes WHERE user_id = $1
                )
            """, user_id)

            print(f"[DEBUG] unvoted_rows count = {len(unvoted_rows)}")

        if not unvoted_rows:
            print(f"[PROXY-JOB] user_id={user_id} — voted on everything already, skipping")
            async with pool.acquire() as conn:
                await conn.execute(f"""
                    UPDATE user_proxy_settings
                    SET last_run_at = NOW(),
                        next_run_at = NOW() + INTERVAL '{PROXY_VOTE_INTERVAL_MINUTES} minutes',
                        updated_at  = NOW()
                    WHERE user_id = $1
                """, user_id)
            continue

        # Load user's preference profile for deterministic scoring
        preferences = await get_or_create_proxy_preferences(pool, user_id)
        
        # Build history-based signal
        history_signal = {}
        if voted_rows:
            from collections import Counter
            category_counter: Counter = Counter()
            tag_counter:      Counter = Counter()
            
            for r in voted_rows:
                if r["category"]:
                    category_counter[r["category"]] += 1
                tags = json.loads(r["tags"]) if r["tags"] else []
                for tag in tags:
                    tag_counter[tag] += 1
            
            history_signal = {
                "category_counter": dict(category_counter),
                "tag_counter": dict(tag_counter),
            }
        
        # Score all unvoted products using combination of preferences + history
        scored_products = []
        for product in unvoted_rows:
            # Get preference score
            pref_result = await compute_preference_score(product, preferences, history_signal)
            preference_score = pref_result["preference_score"]
            
            # Get history score (if available)
            history_score = 0.0
            if history_signal:
                cat = product.get("category")
                if cat and cat in history_signal.get("category_counter", {}):
                    history_score += history_signal["category_counter"][cat] * 3
                p_tags = json.loads(product.get("tags", "[]")) if isinstance(product.get("tags"), str) else product.get("tags", [])
                for tag in p_tags:
                    if tag in history_signal.get("tag_counter", {}):
                        history_score += history_signal["tag_counter"][tag]
            
            # Combined score (70% preference, 30% history)
            combined_score = (preference_score * 0.7) + (history_score * 0.3)
            
            scored_products.append({
                "product": product,
                "preference_score": preference_score,
                "history_score": history_score,
                "combined_score": combined_score,
                "matched_preferences": pref_result.get("matched_preferences", []),
                "boosted_by": pref_result.get("boosted_by", []),
            })
        
        # Sort by combined score (descending)
        scored_products.sort(key=lambda x: x["combined_score"], reverse=True)
        
        # Select top product or tie-break
        top_product_data = scored_products[0]
        chosen = top_product_data["product"]
        
        if top_product_data["combined_score"] == 0:
            # No preferences match — random fallback
            chosen = random.choice(unvoted_rows)
            computation_method = "random_fallback"
            reason = "random (no preference or history match)"
            tie_break_reason = "no matching preferences or history"
        elif len([p for p in scored_products if p["combined_score"] == top_product_data["combined_score"]]) > 1:
            # Tie-break: deterministic selection by item_id (stable)
            tied_products = [p for p in scored_products if p["combined_score"] == top_product_data["combined_score"]]
            tied_products.sort(key=lambda x: x["product"]["item_id"])
            chosen = tied_products[0]["product"]
            computation_method = "preference-driven_with_tiebreak"
            reason = f"preference-driven (score={top_product_data['combined_score']:.1f}), tie-break by item_id"
            tie_break_reason = f"tied {len(tied_products)} products at score {top_product_data['combined_score']:.1f}"
        else:
            # Clear winner
            computation_method = "preference-driven"
            reason = f"preference-driven (score={top_product_data['combined_score']:.1f})"
            tie_break_reason = None

        chosen_id   = chosen["item_id"]
        chosen_name = chosen["name"]
        print(f"[PROXY-JOB] → Voting on '{chosen_name}' (id={chosen_id}) | reason: {reason}")

        async with pool.acquire() as conn:
            try:
                # Build explanation summary for the item_votes row (Section 5 requirement)
                vote_explanation_summary = {
                    "method":             "proxy",
                    "preference_score":   top_product_data.get("preference_score", 0.0),
                    "history_score":      top_product_data.get("history_score", 0.0),
                    "combined_score":     top_product_data.get("combined_score", 0.0),
                    "score_method":       top_product_data.get("score_computation_method", "preference-driven"),
                    "matched_preferences": top_product_data.get("matched_preferences", []),
                    "boosted_by":         top_product_data.get("boosted_by", []),
                    "reason":             reason,
                }

                # Insert vote — also write explanation JSON to item_votes row
                vote_row = await conn.fetchrow("""
                    INSERT INTO item_votes (item_id, user_id, vote_explanation)
                    VALUES ($1, $2, $3::jsonb)
                    ON CONFLICT (item_id, user_id) DO NOTHING
                    RETURNING id
                """, chosen_id, user_id, json.dumps(vote_explanation_summary))
                
                vote_id = vote_row["id"] if vote_row else None

                # Update proxy settings for next run
                await conn.execute(f"""
                    UPDATE user_proxy_settings
                    SET last_run_at = NOW(),
                        next_run_at = NOW() + INTERVAL '{PROXY_VOTE_INTERVAL_MINUTES} minutes',
                        updated_at  = NOW()
                    WHERE user_id = $1
                """, user_id)

                print(f"[PROXY-JOB] ✓ user_id={user_id} proxy vote cast on '{chosen_name}' (vote_id={vote_id})")

                # Store explanation metadata for audit/debug
                if vote_id:
                    explanation = {
                        "preference_score": top_product_data.get("preference_score", 0.0),
                        "history_score": top_product_data.get("history_score", 0.0),
                        "combined_score": top_product_data.get("combined_score", 0.0),
                        "matched_preferences": top_product_data.get("matched_preferences", []),
                        "matched_tags": json.loads(chosen.get("tags", "[]")) if isinstance(chosen.get("tags"), str) else chosen.get("tags", []),
                        "boosted_by": top_product_data.get("boosted_by", []),
                        "penalty_applied": None,
                        "tie_break_reason": tie_break_reason,
                        "score_computation_method": computation_method,
                    }
                    await store_vote_explanation(pool, vote_id, user_id, chosen_id, explanation)

                # Emit canonical interaction event for the proxy vote
                await emit_interaction_event(
                    pool=pool,
                    event_type="vote_cast",
                    entity_id=chosen_id,
                    entity_type="product",
                    payload={"proxy": True, "computation_method": computation_method},
                    user_id=user_id,
                )

            except Exception as e:
                print(f"[PROXY-JOB] ✗ user_id={user_id} failed: {type(e).__name__}: {e}")


# ══════════════════════════════════════════════════════════════════════════════
# CYCLE INTEGRITY AGENT
# ══════════════════════════════════════════════════════════════════════════════

CIA_GATES = [
    "trend_data_exists",
    "design_brief_ready",
    "designs_generated",
    "vision_scoring_complete",
    "showroom_published",
    "voting_captured",
    "feedback_captured",
]


async def _get_active_cycle_number(pool: asyncpg.Pool) -> int:
    async with pool.acquire() as conn:
        row = await conn.fetchrow("""
            SELECT cycle_number FROM design_cycles
            WHERE completed_at IS NULL
            ORDER BY cycle_number DESC
            LIMIT 1
        """)
    return row["cycle_number"] if row else 0


async def _cia_check_trend_data(pool: asyncpg.Pool, cycle_number: int) -> Dict:
    async with pool.acquire() as conn:
        trend_count  = await conn.fetchval("SELECT COUNT(*) FROM trends")
        signal_count = await conn.fetchval("SELECT COUNT(DISTINCT tag) FROM design_signals")
    passed = (trend_count or 0) >= CIA_MIN_TRENDS
    return {
        "passed":       passed,
        "trend_count":  int(trend_count  or 0),
        "signal_count": int(signal_count or 0),
        "required":     CIA_MIN_TRENDS,
        "note":         f"{trend_count} trends found (need {CIA_MIN_TRENDS})",
    }


async def _cia_check_design_brief(pool: asyncpg.Pool, cycle_number: int) -> Dict:
    async with pool.acquire() as conn:
        brief_count  = await conn.fetchval("""
            SELECT COUNT(*) FROM memory_entries
            WHERE type = 'design_brief'
              AND payload->>'cycle_number' = $1
        """, str(cycle_number))
        signal_count = await conn.fetchval("SELECT COUNT(DISTINCT tag) FROM design_signals")
    has_brief   = (brief_count  or 0) >= 1
    has_signals = (signal_count or 0) >= CIA_MIN_TRENDS
    passed      = has_brief or has_signals
    return {
        "passed":       passed,
        "brief_count":  int(brief_count  or 0),
        "signal_count": int(signal_count or 0),
        "note": (
            f"explicit brief {'found' if has_brief else 'not found'} for cycle #{cycle_number}; "
            f"{signal_count} signals available (need {CIA_MIN_TRENDS})"
        ),
    }


async def _cia_check_designs_generated(pool: asyncpg.Pool, cycle_number: int) -> Dict:
    async with pool.acquire() as conn:
        design_count = await conn.fetchval("""
            SELECT COUNT(*) FROM generated_designs
            WHERE cycle_number = $1
              AND status != 'rejected'
        """, cycle_number)
    count     = int(design_count or 0)
    remaining = max(0, CIA_MIN_DESIGNS - count)
    passed    = remaining == 0
    return {
        "passed":       passed,
        "design_count": count,
        "required":     CIA_MIN_DESIGNS,
        "remaining":    remaining,
        "note":         f"{count}/{CIA_MIN_DESIGNS} designs for cycle #{cycle_number} ({remaining} remaining)",
    }


async def _cia_check_vision_scoring(pool: asyncpg.Pool, cycle_number: int) -> Dict:
    async with pool.acquire() as conn:
        total  = await conn.fetchval(
            "SELECT COUNT(*) FROM generated_designs WHERE cycle_number = $1", cycle_number
        )
        scored = await conn.fetchval("""
            SELECT COUNT(*) FROM generated_designs
            WHERE cycle_number = $1
              AND score_json IS NOT NULL
              AND score_json::text != '{}'
        """, cycle_number)
    passed = (scored or 0) >= CIA_MIN_SCORED_DESIGNS
    return {
        "passed":        passed,
        "total_designs": int(total  or 0),
        "scored":        int(scored or 0),
        "required":      CIA_MIN_SCORED_DESIGNS,
        "note":          f"{scored}/{total} designs scored for cycle #{cycle_number} (need {CIA_MIN_SCORED_DESIGNS})",
    }


async def _cia_check_showroom_published(pool: asyncpg.Pool, cycle_number: int) -> Dict:
    async with pool.acquire() as conn:
        showroom_count  = await conn.fetchval("""
            SELECT COUNT(*) FROM showroom s
            JOIN generated_designs gd ON gd.id = s.design_id
            WHERE gd.cycle_number = $1
        """, cycle_number)
        published_count = await conn.fetchval("""
            SELECT COUNT(*) FROM generated_designs
            WHERE cycle_number = $1
              AND publishable = TRUE
              AND published_at IS NOT NULL
        """, cycle_number)
    passed = (showroom_count or 0) >= CIA_MIN_SHOWROOM_ITEMS
    return {
        "passed":          passed,
        "showroom_count":  int(showroom_count  or 0),
        "published_count": int(published_count or 0),
        "required":        CIA_MIN_SHOWROOM_ITEMS,
        "note":            f"{showroom_count} showroom items for cycle #{cycle_number} (need {CIA_MIN_SHOWROOM_ITEMS})",
    }


async def _cia_check_voting_captured(pool: asyncpg.Pool, cycle_number: int) -> Dict:
    async with pool.acquire() as conn:
        vote_count = await conn.fetchval("""
            SELECT COUNT(*) FROM item_votes iv
            JOIN product_catalog pc ON pc.item_id = iv.item_id
            WHERE pc.item_id LIKE 'design-%%'
              AND iv.item_id IN (
                SELECT CONCAT('design-', gd.id)
                FROM generated_designs gd
                WHERE gd.cycle_number = $1
              )
        """, cycle_number)
    passed = (vote_count or 0) >= CIA_MIN_VOTES
    return {
        "passed":     passed,
        "vote_count": int(vote_count or 0),
        "required":   CIA_MIN_VOTES,
        "note":       f"{vote_count} votes on cycle #{cycle_number} designs (need {CIA_MIN_VOTES})",
    }


async def _cia_check_feedback_captured(pool: asyncpg.Pool, cycle_number: int) -> Dict:
    async with pool.acquire() as conn:
        memory_count = await conn.fetchval("""
            SELECT COUNT(*) FROM memory_entries
            WHERE type IN ('design_signal', 'trend', 'feedback')
        """)
        signal_count = await conn.fetchval("SELECT COUNT(DISTINCT tag) FROM design_signals")
    passed = (memory_count or 0) >= CIA_MIN_FEEDBACK_ITEMS or (signal_count or 0) >= CIA_MIN_FEEDBACK_ITEMS
    return {
        "passed":       passed,
        "memory_count": int(memory_count or 0),
        "signal_count": int(signal_count or 0),
        "required":     CIA_MIN_FEEDBACK_ITEMS,
        "note": (
            f"{memory_count} memory entries; "
            f"{signal_count} design signals (need {CIA_MIN_FEEDBACK_ITEMS})"
        ),
    }


async def run_cycle_integrity_agent():
    log_sep(f"CYCLE INTEGRITY AGENT — {datetime.utcnow().isoformat()}Z")

    pool         = await get_pool()
    cycle_number = await _get_active_cycle_number(pool)

    if cycle_number == 0:
        print(f"[CIA] No active cycle found — checking if prerequisites are ready to start cycle 1")
    else:
        print(f"[CIA] Active cycle number: #{cycle_number}")

    gate_checks = [
        ("trend_data_exists",       _cia_check_trend_data),
        ("design_brief_ready",      _cia_check_design_brief),
        ("designs_generated",       _cia_check_designs_generated),
        ("vision_scoring_complete", _cia_check_vision_scoring),
        ("showroom_published",      _cia_check_showroom_published),
        ("voting_captured",         _cia_check_voting_captured),
        ("feedback_captured",       _cia_check_feedback_captured),
    ]

    gate_results: Dict[str, Dict] = {}
    overall_status = "evaluating"
    action_taken   = "none"
    notes          = ""

    for gate_name, check_fn in gate_checks:
        print(f"\n[CIA] ── Checking gate: {gate_name}")
        try:
            result = await check_fn(pool, cycle_number)
        except Exception as e:
            result = {
                "passed": False,
                "error":  f"{type(e).__name__}: {e}",
                "note":   "Gate check raised an exception",
            }
            print(f"[CIA] ✗ Gate '{gate_name}' raised: {e}")

        gate_results[gate_name] = result
        icon = "✓" if result["passed"] else "✗"
        print(f"[CIA] {icon} {gate_name}: {result.get('note', '')}")

    trends_ok      = gate_results.get("trend_data_exists", {}).get("passed", False)
    brief_ok       = gate_results.get("design_brief_ready", {}).get("passed", False)
    designs_gate   = gate_results.get("designs_generated", {})
    designs_passed = designs_gate.get("passed", False)
    designs_needed = designs_gate.get("remaining", CIA_MIN_DESIGNS)
    all_passed     = all(r.get("passed", False) for r in gate_results.values())

    if all_passed and cycle_number > 0:
        print(f"\n[CIA] ✅ ALL GATES PASSED for cycle #{cycle_number} — completing and starting next cycle")
        try:
            await mark_cycle_complete(pool, cycle_number)
            # FIX B: Promote cycle collection lifecycle to 'published' when all gates pass
            try:
                async with pool.acquire() as conn:
                    await conn.execute("""
                        UPDATE collections SET lifecycle = 'published', published_at = NOW()
                        WHERE cycle_number = $1 AND lifecycle != 'published'
                    """, cycle_number)
                print(f"[CIA] ✓ Collection for cycle #{cycle_number} promoted to 'published'")
            except Exception as coll_err:
                print(f"[CIA] ⚠ Collection lifecycle promotion failed: {coll_err}")
            action_taken   = f"completed_cycle_{cycle_number}_and_starting_next"
            overall_status = "all_passed_next_cycle_triggered"
            notes = (
                f"All 7 gates satisfied for cycle #{cycle_number}. "
                f"Cycle marked complete. Collection promoted to published. Triggering design agent for cycle #{cycle_number + 1}."
            )
            asyncio.ensure_future(run_design_agent(pool, designs_needed=CIA_MIN_DESIGNS))
            print(f"[CIA] ✓ Cycle #{cycle_number} complete. Next cycle design agent triggered.")
        except Exception as e:
            action_taken   = "next_cycle_trigger_failed"
            overall_status = "next_cycle_trigger_failed"
            notes          = f"All gates passed but next cycle trigger failed: {e}"
            print(f"[CIA] ✗ Failed to trigger next cycle: {e}")

    elif not designs_passed and designs_needed > 0:
        if trends_ok and brief_ok:
            if cycle_number == 0:
                action_label = "starting_cycle_1"
                notes_prefix = "No active cycle. Prerequisites met. Starting cycle 1."
            else:
                action_label = f"triggered_design_topup_cycle_{cycle_number}_{designs_needed}"
                notes_prefix = (
                    f"Cycle #{cycle_number} has {designs_gate.get('design_count', 0)}/{CIA_MIN_DESIGNS} designs. "
                    f"Triggering top-up for {designs_needed} remaining."
                )

            print(f"\n[CIA] ⚡ Triggering design agent — {designs_needed} design(s) needed")
            action_taken   = action_label
            overall_status = "design_generation_in_progress"
            notes          = notes_prefix
            try:
                asyncio.ensure_future(run_design_agent(pool, designs_needed=designs_needed))
                print(f"[CIA] ✓ Design agent triggered for {designs_needed} design(s)")
            except Exception as e:
                action_taken   = "design_trigger_failed"
                overall_status = "design_trigger_failed"
                notes          = f"Trigger failed: {e}"
                print(f"[CIA] ✗ Failed to trigger design agent: {e}")
        else:
            overall_status = "blocked_missing_prerequisites"
            action_taken   = "halted_missing_prerequisites"
            notes = (
                f"Designs needed ({designs_needed}) but prerequisites not satisfied. "
                f"trend_data_exists={trends_ok}, design_brief_ready={brief_ok}. "
                f"Run the pipeline first to scrape trends."
            )
            print(f"\n[CIA] ⛔ Cannot generate designs — prerequisites not met (trends={trends_ok}, brief={brief_ok})")

    else:
        failed_gates   = [g for g, r in gate_results.items() if not r.get("passed")]
        overall_status = f"waiting_on_{'_'.join(failed_gates[:2])}" if failed_gates else "all_passed"
        action_taken   = "waiting_for_downstream_gates"
        notes = (
            f"Cycle #{cycle_number}: {CIA_MIN_DESIGNS} designs generated. "
            f"Waiting for: {', '.join(failed_gates) if failed_gates else 'nothing — all done'}."
        )
        print(f"\n[CIA] ⏳ Designs complete for cycle #{cycle_number}. Waiting on: {failed_gates}")

    async with pool.acquire() as conn:
        await conn.execute(
            """
            INSERT INTO cycle_integrity_log
                (run_at, cycle_number, gate_results, overall_status, action_taken, notes)
            VALUES (NOW(), $1, $2::jsonb, $3, $4, $5)
            """,
            max(cycle_number, 1),
            json.dumps(gate_results),
            overall_status,
            action_taken,
            notes,
        )

    # FIX C: After CIA run, trigger feedback loop to refresh memory signals
    try:
        await run_feedback_loop_processor(pool)
    except Exception as e:
        print(f"[CIA] ⚠ Feedback loop processor failed: {e}")

    log_sep(f"CIA DONE — cycle=#{cycle_number} | status={overall_status} | action={action_taken}")
    return {
        "cycle_number":   cycle_number,
        "overall_status": overall_status,
        "action_taken":   action_taken,
        "gate_results":   gate_results,
        "notes":          notes,
    }


# ──────────────────────────────────────────────
# Pipeline
# ──────────────────────────────────────────────
async def run_pipeline():
    log_sep(f"PIPELINE START — {datetime.utcnow().isoformat()}Z")

    articles = await scrape_all_with_retry()

    log_sec("PRE-GENERATION GATE")
    print(f"[GATE] Collected : {len(articles)} article(s)")

    if not articles:
        print(f"[GATE] ✗ No articles from any source. Pipeline aborted.")
        log_sep("PIPELINE ABORTED")
        return None

    if len(articles) < MIN_SOURCE_ARTICLES:
        print(f"[GATE] ⚠ Only {len(articles)} articles found (need {MIN_SOURCE_ARTICLES}) — proceeding with available articles")
    else:
        print(f"[GATE] ✓ Passed — rewriting {len(articles)} article(s) individually")

    result = await generate_article(articles)
    return result


# ──────────────────────────────────────────────
# Scheduler + lifecycle
# ──────────────────────────────────────────────
scheduler = AsyncIOScheduler()
scheduler.add_job(run_pipeline,              "interval", hours=SCRAPE_INTERVAL_HOURS)
scheduler.add_job(run_proxy_voting_job,      "interval", hours=24)
scheduler.add_job(run_cycle_integrity_agent, "interval", hours=1, id="cycle_integrity_agent")

# FIX C: Standalone feedback loop scheduled run every 6 hours
async def _scheduled_feedback_loop():
    try:
        pool = await get_pool()
        await run_feedback_loop_processor(pool)
    except Exception as e:
        print(f"[FEEDBACK-LOOP-SCHEDULED] ✗ {e}")

scheduler.add_job(_scheduled_feedback_loop, "interval", hours=6, id="feedback_loop_processor")


async def _cleanup_expired_otps():
    try:
        pool = await get_pool()
        async with pool.acquire() as conn:
            deleted = await conn.execute(
                "DELETE FROM email_otps WHERE expires_at < NOW()"
            )
        count = int(deleted.split()[-1]) if deleted else 0
        if count:
            print(f"[OTP-CLEANUP] Deleted {count} expired OTP(s)")
    except Exception as e:
        print(f"[OTP-CLEANUP] ✗ {e}")

scheduler.add_job(_cleanup_expired_otps, "interval", hours=1, id="otp_cleanup")


@app.on_event("startup")
async def startup_event():
    global _pool
    if not POSTGRESQL_URI:
        raise RuntimeError("POSTGRESQL_URI is not set in .env")

    print("[BOOT] Connecting to PostgreSQL…")
    _pool = await asyncpg.create_pool(
        dsn=POSTGRESQL_URI,
        min_size=2,
        max_size=10,
        command_timeout=60,
        statement_cache_size=0,
    )
    print("[BOOT] ✅ PostgreSQL pool created (statement_cache_size=0 for PgBouncer compatibility)")
    await init_db(_pool)
    await run_schema_migrations(_pool)

    scheduler.start()
    print(f"[BOOT] ✅ Scheduler started — pipeline every {SCRAPE_INTERVAL_HOURS}h")
    print("[BOOT] ✅ Cycle Integrity Agent scheduled — every 1 hour")
    print("[BOOT] ✅ Feedback Loop Processor scheduled — every 6 hours")


@app.on_event("shutdown")
async def shutdown_event():
    scheduler.shutdown(wait=False)
    global _pool
    if _pool:
        await _pool.close()
    print("[BOOT] Scheduler + DB pool stopped")


# ──────────────────────────────────────────────
# Helpers
# ──────────────────────────────────────────────
def record_to_dict(row) -> dict:
    d = dict(row)
    for k, v in d.items():
        if isinstance(v, datetime):
            d[k] = v.isoformat()
    return d


# ══════════════════════════════════════════════════════════════════════════════
# FIX A: GSNowGPT Orchestration Layer — /gpt/query
# ══════════════════════════════════════════════════════════════════════════════

# Intent classification routing table
# ══════════════════════════════════════════════════════════════════════════════
# PREMIUM INTENT LAYER — maps user phrases to named paid showroom features.
# Each "showroom_*" intent below gates behind _check_premium_access().
# Free intents:  retrieval, trend, style, proxy, account, premium, collection_ai
# Paid intents:  showroom_ai, trend_ai, design_generator, style_match,
#                outfit_builder, lookbook_ai, wardrobe_ai
# ══════════════════════════════════════════════════════════════════════════════
INTENT_ROUTING = {
    "retrieval":        ["what", "who", "when", "where", "tell me", "explain", "show", "list", "find", "search"],
    "trend":            ["trend", "trending", "popular", "hot right now", "season", "vogue", "in style", "fashion week"],
    "style":            ["style", "outfit", "wear", "pair", "match", "look", "dress", "accessori", "suggest", "recommend"],
    "proxy":            ["proxy", "vote for me", "auto vote", "voting agent", "delegate"],
    "account":          ["subscription", "plan", "account", "upgrade", "cancel", "billing", "password", "profile"],
    "premium":          ["premium", "exclusive", "pro plan", "unlock", "vip", "member"],
    # ── Named paid showroom AI features ──────────────────────────────────────
    # showroom_ai: General AI showroom assistant (view designs, get advice)
    "showroom_ai":      ["ai design", "ai style", "generate look", "design assistant", "style ai", "ai showroom", "design me"],
    # trend_ai: AI-powered deep trend analysis (paid feature)
    "trend_ai":         ["ai trend", "trend analysis", "trend forecast", "predict trend", "trend report", "deep trend", "season forecast"],
    # design_generator: AI design generation on demand (paid feature)
    "design_generator": ["generate design", "create design", "new design", "design for me", "ai generate", "make design", "design generation"],
    # style_match: AI matching user's style to showroom pieces (paid feature)
    "style_match":      ["style match", "match my style", "find my look", "similar style", "style finder", "style profile", "best match for me"],
    # outfit_builder: AI multi-piece outfit composition (paid feature)
    "outfit_builder":   ["build outfit", "outfit builder", "complete my look", "full outfit", "head to toe", "whole look", "outfit idea"],
    # lookbook_ai: AI-curated personal lookbook generation (paid feature)
    "lookbook_ai":      ["lookbook", "my lookbook", "curate looks", "personal lookbook", "ai lookbook", "curated collection"],
    # wardrobe_ai: AI wardrobe analysis and management (paid feature)
    "wardrobe_ai":      ["wardrobe", "my wardrobe", "wardrobe analysis", "wardrobe plan", "capsule wardrobe", "wardrobe ai", "what to wear"],
    # collection_ai: Saved looks / collection summary (free with login)
    "collection_ai":    ["my collection", "saved looks", "collection summary", "saved designs", "saved models"],
    # collection_info: Query available design collections and cycle info
    "collection_info":  ["collection", "collections", "cycle collection", "collection info", "collection details", "list collections", "showroom collection", "design collection"],
}

# Intents that require a paid subscription
PREMIUM_INTENT_FEATURES: Dict[str, str] = {
    "showroom_ai":      "AI Showroom Styling",
    "trend_ai":         "AI Trend Forecasting",
    "design_generator": "AI Design Generator",
    "style_match":      "AI Style Match",
    "outfit_builder":   "AI Outfit Builder",
    "lookbook_ai":      "AI Lookbook Creator",
    "wardrobe_ai":      "AI Wardrobe Advisor",
}


def classify_intent(message: str) -> str:
    """
    Keyword-based intent classifier with premium-feature priority.
    Premium paid features are scored with a 2× multiplier so specific
    feature phrases win over generic style/trend matches.
    Returns the best-match intent bucket.
    """
    msg_lower = message.lower()
    scores: Dict[str, int] = {intent: 0 for intent in INTENT_ROUTING}

    for intent, keywords in INTENT_ROUTING.items():
        multiplier = 2 if intent in PREMIUM_INTENT_FEATURES else 1
        for kw in keywords:
            if kw in msg_lower:
                scores[intent] += multiplier

    best = max(scores, key=lambda k: scores[k])
    return best if scores[best] > 0 else "style"  # default to style agent


async def _gsnowgpt_handle_retrieval(message: str, pool: asyncpg.Pool) -> Dict[str, Any]:
    """Handle retrieval intents: pull from articles and trends via memory."""
    ctx = await assemble_design_context(query=message, top_k_signals=5, top_k_trends=8)
    async with pool.acquire() as conn:
        articles = await conn.fetch(
            "SELECT title, excerpt, slug FROM blog_articles ORDER BY created_at DESC LIMIT 5"
        )
    article_lines = [f"- {r['title']}: {r['excerpt'] or ''}" for r in articles]
    return {
        "context_type":    "retrieval",
        "trend_summary":   ctx["trend_summary"],
        "recent_articles": article_lines,
    }


async def _gsnowgpt_handle_trend(message: str, pool: asyncpg.Pool) -> Dict[str, Any]:
    """Handle trend summary intents via memory/RAG."""
    ctx = await assemble_design_context(query=message, top_k_signals=8, top_k_trends=12)
    return {
        "context_type":  "trend_summary",
        "trend_summary": ctx["trend_summary"],
        "signal_summary": ctx["signal_summary"],
    }


async def _gsnowgpt_handle_style(
    message: str,
    pool: asyncpg.Pool,
    product_name: Optional[str],
    product_desc: Optional[str],
    product_price: Optional[str],
) -> Dict[str, Any]:
    """Delegate to style/styling context enrichment."""
    ctx = await assemble_design_context(query=message, top_k_signals=5, top_k_trends=8)
    product_ctx = ""
    if product_name:
        product_ctx = f"\nProduct in view: {product_name} | {product_desc or ''} | {product_price or ''}"
    return {
        "context_type":    "style",
        "trend_summary":   ctx["trend_summary"],
        "signal_summary":  ctx["signal_summary"],
        "product_context": product_ctx,
    }


async def _gsnowgpt_handle_collection_info(message: str, pool: asyncpg.Pool) -> Dict[str, Any]:
    """Handle collection info queries: fetch and summarize design collections."""
    msg_lower = message.lower()
    collections_data = []
    collections_summary = ""
    
    try:
        async with pool.acquire() as conn:
            # Try to identify a specific collection by ID or name from the message
            specific_id = None
            specific_name = None
            
            # Extract numeric ID if user mentioned "collection #N" or "collection N"
            import re
            id_match = re.search(r'collection\s*#?(\d+)', msg_lower)
            if id_match:
                specific_id = int(id_match.group(1))
            
            # Check for specific collection name
            name_match = re.search(r"(?:collection|cycle)\s+(?:named|'|\")?([^'\".,!?]+)", message, re.IGNORECASE)
            if name_match:
                specific_name = name_match.group(1).strip()
            
            if specific_id:
                # Fetch specific collection by ID
                coll = await conn.fetchrow("""
                    SELECT 
                        id, name, description, lifecycle, cycle_number, created_at,
                        (SELECT COUNT(*) FROM generated_designs WHERE collection_id = collections.id) as design_count
                    FROM collections
                    WHERE id = $1
                    LIMIT 1
                """, specific_id)
                if coll:
                    collections_data = [dict(coll)]
            elif specific_name:
                # Fetch specific collection by name (partial match)
                coll = await conn.fetchrow("""
                    SELECT 
                        id, name, description, lifecycle, cycle_number, created_at,
                        (SELECT COUNT(*) FROM generated_designs WHERE collection_id = collections.id) as design_count
                    FROM collections
                    WHERE LOWER(name) ILIKE $1
                    LIMIT 1
                """, f"%{specific_name}%")
                if coll:
                    collections_data = [dict(coll)]
            else:
                # Fetch all collections, ordered by recency
                colls = await conn.fetch("""
                    SELECT 
                        id, name, description, lifecycle, cycle_number, created_at,
                        (SELECT COUNT(*) FROM generated_designs WHERE collection_id = collections.id) as design_count
                    FROM collections
                    ORDER BY created_at DESC
                    LIMIT 10
                """)
                collections_data = [dict(c) for c in colls]
            
            # Enrich with sample designs for each collection (up to 3 per collection)
            for coll in collections_data:
                designs = await conn.fetch("""
                    SELECT id, title, status, publishable
                    FROM generated_designs
                    WHERE collection_id = $1
                    ORDER BY created_at DESC
                    LIMIT 3
                """, coll["id"])
                coll["sample_designs"] = [dict(d) for d in designs]
        
        # Build human-readable summary
        if not collections_data:
            collections_summary = "No collections found in the system yet."
        else:
            summary_lines = []
            for coll in collections_data:
                line = f"• **{coll.get('name', 'Unnamed')}** (Cycle #{coll.get('cycle_number', '?')}, Status: {coll.get('lifecycle', 'unknown')})"
                if coll.get('description'):
                    line += f": {coll['description']}"
                line += f" — {coll.get('design_count', 0)} designs"
                if coll.get('sample_designs'):
                    design_titles = [d['title'] for d in coll['sample_designs'][:2]]
                    line += f" (e.g., {', '.join(design_titles)})"
                summary_lines.append(line)
            collections_summary = "\n".join(summary_lines)
    
    except Exception as e:
        print(f"[GSNOWGPT-COLLECTION] Error fetching collections: {e}")
        collections_summary = f"Error loading collections: {str(e)}"
    
    return {
        "context_type": "collection_info",
        "collections_summary": collections_summary,
        "collections_data": collections_data,
    }


async def _gsnowgpt_handle_account(user_id: Optional[int], pool: asyncpg.Pool) -> Dict[str, Any]:
    """Return account/subscription context."""
    if not user_id:
        return {"context_type": "account", "note": "Not authenticated"}
    async with pool.acquire() as conn:
        sub = await conn.fetchrow("""
            SELECT plan_name, status, ends_at FROM user_subscriptions
            WHERE user_id = $1 AND status = 'active'
            ORDER BY created_at DESC LIMIT 1
        """, user_id)
    return {
        "context_type": "account",
        "subscription":  dict(sub) if sub else None,
    }


async def _gsnowgpt_handle_trend_ai(message: str, pool: asyncpg.Pool) -> Dict[str, Any]:
    """PREMIUM: Deep AI trend analysis with broader signal retrieval."""
    ctx = await assemble_design_context(query=message, top_k_signals=15, top_k_trends=20)
    # Pull recent trends from DB to augment
    async with pool.acquire() as conn:
        recent_trends = await conn.fetch(
            "SELECT title, description FROM trends ORDER BY created_at DESC LIMIT 10"
        )
    trend_lines = [f"- {r['title']}: {r['description'] or ''}" for r in recent_trends]
    return {
        "context_type":   "trend_ai",
        "trend_summary":  ctx["trend_summary"],
        "signal_summary": ctx["signal_summary"],
        "recent_trends":  trend_lines,
    }


async def _gsnowgpt_handle_design_generator(message: str, pool: asyncpg.Pool) -> Dict[str, Any]:
    """PREMIUM: AI design generation context (does not call image model directly — returns briefing context)."""
    ctx = await assemble_design_context(query=message, top_k_signals=10, top_k_trends=12)
    return {
        "context_type":   "design_generator",
        "trend_summary":  ctx["trend_summary"],
        "signal_summary": ctx["signal_summary"],
        "brief_context":  ctx.get("brief_context", ""),
    }


async def _gsnowgpt_handle_style_match(
    message: str,
    pool: asyncpg.Pool,
    product_name: Optional[str],
    product_desc: Optional[str],
) -> Dict[str, Any]:
    """PREMIUM: AI style match — find showroom pieces matching user's taste."""
    ctx = await assemble_design_context(query=message, top_k_signals=12, top_k_trends=8)
    # Pull top showroom items for matching context
    async with pool.acquire() as conn:
        showroom_items = await conn.fetch("""
            SELECT s.title, s.description, s.tags
            FROM showroom s
            JOIN generated_designs gd ON gd.id = s.design_id
            ORDER BY s.created_at DESC LIMIT 8
        """)
    item_lines = []
    for r in showroom_items:
        tags = r["tags"]
        if isinstance(tags, str):
            try:
                tags = json.loads(tags)
            except Exception:
                tags = []
        tag_str = ", ".join(tags[:4]) if tags else ""
        item_lines.append(f"- {r['title']}: {r['description'] or ''} [tags: {tag_str}]")
    product_ctx = f"\nProduct in view: {product_name} | {product_desc or ''}" if product_name else ""
    return {
        "context_type":    "style_match",
        "trend_summary":   ctx["trend_summary"],
        "signal_summary":  ctx["signal_summary"],
        "showroom_items":  item_lines,
        "product_context": product_ctx,
    }


async def _gsnowgpt_handle_outfit_builder(message: str, pool: asyncpg.Pool) -> Dict[str, Any]:
    """PREMIUM: AI outfit builder — multi-piece outfit composition."""
    ctx = await assemble_design_context(query=message, top_k_signals=10, top_k_trends=10)
    async with pool.acquire() as conn:
        items = await conn.fetch("""
            SELECT s.title, s.description, s.tags
            FROM showroom s ORDER BY s.created_at DESC LIMIT 12
        """)
    item_lines = []
    for r in items:
        tags = r["tags"]
        if isinstance(tags, str):
            try:
                tags = json.loads(tags)
            except Exception:
                tags = []
        item_lines.append(f"- {r['title']}: {r['description'] or ''}")
    return {
        "context_type":   "outfit_builder",
        "trend_summary":  ctx["trend_summary"],
        "signal_summary": ctx["signal_summary"],
        "available_items": item_lines,
    }


async def _gsnowgpt_handle_lookbook_ai(
    message: str,
    pool: asyncpg.Pool,
    user_id: Optional[int],
) -> Dict[str, Any]:
    """PREMIUM: AI lookbook — curates a personal lookbook from trends + saved items."""
    ctx = await assemble_design_context(query=message, top_k_signals=12, top_k_trends=15)
    saved_items: List[str] = []
    if user_id:
        async with pool.acquire() as conn:
            saved = await conn.fetch(
                "SELECT item_id FROM user_collections WHERE user_id=$1 ORDER BY added_at DESC LIMIT 10",
                user_id
            )
        saved_items = [r["item_id"] for r in saved]
    return {
        "context_type":   "lookbook_ai",
        "trend_summary":  ctx["trend_summary"],
        "signal_summary": ctx["signal_summary"],
        "saved_items":    saved_items,
    }


async def _gsnowgpt_handle_wardrobe_ai(
    message: str,
    pool: asyncpg.Pool,
    user_id: Optional[int],
) -> Dict[str, Any]:
    """PREMIUM: AI wardrobe advisor — analyzes user's saved pieces and advises on gaps/pairings."""
    ctx = await assemble_design_context(query=message, top_k_signals=10, top_k_trends=8)
    saved_items: List[str] = []
    if user_id:
        async with pool.acquire() as conn:
            saved = await conn.fetch(
                "SELECT item_id FROM user_collections WHERE user_id=$1 ORDER BY added_at DESC LIMIT 20",
                user_id
            )
        saved_items = [r["item_id"] for r in saved]
    return {
        "context_type":   "wardrobe_ai",
        "trend_summary":  ctx["trend_summary"],
        "signal_summary": ctx["signal_summary"],
        "wardrobe_items": saved_items,
    }


def _build_gsnowgpt_system_prompt(intent: str, context: Dict[str, Any]) -> str:
    """Build a unified system prompt based on classified intent and assembled context."""
    base = """You are GSNowGPT — the conversational intelligence layer for GIA Fashion, a high-end boutique AI platform.
You are sophisticated, knowledgeable, warm, and inspiring. You speak like a personal stylist and fashion authority.
Always give specific, actionable, contextually-grounded responses. Be concise (2-4 sentences) unless asked for detail."""

    if intent == "retrieval":
        extra = f"""
RECENT ARTICLES:
{chr(10).join(context.get('recent_articles', []))}

CURRENT TRENDS:
{context.get('trend_summary', '')}

Answer the user's factual question using the above context. Cite trend names or article titles when relevant."""

    elif intent == "trend":
        extra = f"""
CURRENT TRENDS FROM MEMORY:
{context.get('trend_summary', '')}

AUDIENCE SIGNALS:
{context.get('signal_summary', '')}

Summarize the most relevant trends for the user. Mention specific trend names and what they signal for upcoming seasons."""

    elif intent == "style":
        extra = f"""
CURRENT TRENDS:
{context.get('trend_summary', '')}

AUDIENCE SIGNALS:
{context.get('signal_summary', '')}
{context.get('product_context', '')}

Give specific styling advice grounded in these trends. Reference actual trend names. If a product is in view, tailor advice to it."""

    elif intent in ("account", "premium"):
        sub = context.get("subscription")
        if sub:
            extra = f"\nUser subscription: {sub.get('plan_name')} (status: {sub.get('status')}). Help with account questions."
        else:
            extra = "\nUser has no active subscription. Guide them toward premium options if relevant."

    elif intent == "proxy":
        extra = "\nExplain how GIA's Proxy Voting Agent works: it votes on behalf of users based on their taste profile, runs daily, and can be toggled in account settings."

    elif intent == "showroom_ai":
        extra = f"""
CURRENT TRENDS:
{context.get('trend_summary', '')}

AUDIENCE SIGNALS:
{context.get('signal_summary', '')}
{context.get('product_context', '')}

You are acting as a premium AI showroom assistant. Give specific, curated styling advice for the designs in the showroom. Reference trend names. Be concise and authoritative."""

    elif intent == "trend_ai":
        recent = "\n".join(context.get("recent_trends", []))
        extra = f"""
MEMORY TRENDS:
{context.get('trend_summary', '')}

RECENT PUBLISHED TRENDS:
{recent}

AUDIENCE SIGNALS:
{context.get('signal_summary', '')}

You are a premium AI trend forecaster. Provide a detailed, data-grounded trend analysis. Name specific trends, predict direction, and explain which audience signals support each forecast. Cite at least 3 distinct trends."""

    elif intent == "design_generator":
        extra = f"""
CURRENT TRENDS:
{context.get('trend_summary', '')}

AUDIENCE SIGNALS:
{context.get('signal_summary', '')}

DESIGN BRIEF CONTEXT:
{context.get('brief_context', '')}

You are a premium AI design generator. Describe a specific fashion design concept in vivid detail: silhouette, materials, colour palette, key design elements, and which trend it taps into. Be specific enough that a designer could execute it. Format as a design brief."""

    elif intent == "style_match":
        items = "\n".join(context.get("showroom_items", []))
        extra = f"""
CURRENT TRENDS:
{context.get('trend_summary', '')}

SHOWROOM ITEMS AVAILABLE:
{items}
{context.get('product_context', '')}

You are a premium AI personal stylist. Match the user's expressed style preferences to specific pieces from the showroom. Explain why each piece fits their style. Reference trend alignment. Be specific and confident."""

    elif intent == "outfit_builder":
        available = "\n".join(context.get("available_items", []))
        extra = f"""
CURRENT TRENDS:
{context.get('trend_summary', '')}

AVAILABLE SHOWROOM PIECES:
{available}

You are a premium AI outfit builder. Compose a complete head-to-toe outfit using the available pieces. Explain how each piece works together, what occasion it suits, and which current trend it references. Be specific about styling details."""

    elif intent == "lookbook_ai":
        saved = context.get("saved_items", [])
        extra = f"""
CURRENT TRENDS:
{context.get('trend_summary', '')}

AUDIENCE SIGNALS:
{context.get('signal_summary', '')}

USER'S SAVED ITEMS: {', '.join(saved) if saved else 'no saved items yet'}

You are a premium AI lookbook curator. Create a curated lookbook narrative for this user. Reference current trends, describe coherent theme(s) across their saved pieces, and suggest 2-3 new pieces that would complete their lookbook. Be editorial and inspiring."""

    elif intent == "wardrobe_ai":
        wardrobe = context.get("wardrobe_items", [])
        extra = f"""
CURRENT TRENDS:
{context.get('trend_summary', '')}

USER'S WARDROBE ITEMS: {', '.join(wardrobe) if wardrobe else 'no items saved yet'}

You are a premium AI wardrobe advisor. Analyse the user's saved wardrobe, identify style patterns, flag any key gaps, and recommend 2-3 additions that would maximise versatility. Reference current trends and be specific about what to add and why."""

    elif intent == "collection_ai":
        saved = context.get("saved_items", [])
        extra = f"""
The user has {len(saved)} saved item(s) in their collection.
Saved item IDs: {', '.join(saved) if saved else 'none yet'}.

Help them understand or style their saved collection. Suggest complementary pieces or trending styles that match what they've saved. Be personal and specific."""

    elif intent == "collection_info":
        collections_summary = context.get("collections_summary", "")
        extra = f"""
COLLECTIONS IN GIA SHOWROOM:
{collections_summary}

Describe these collections naturally. Explain the cycle structure, what each collection represents, and encourage the user to explore specific designs. Reference design counts and sample pieces. Be informative and inviting."""

    else:
        extra = f"""
CURRENT TRENDS:
{context.get('trend_summary', '')}

Give helpful fashion guidance based on current trends."""

    return base + extra


@app.post("/gpt/query")
async def gsnowgpt_query(req: GSNowGPTRequest, request: Request = None, authorization: Optional[str] = Header(None)):
    """
    FIX A: Unified GSNowGPT conversational entry point.
    Classifies intent → routes to appropriate context assembler → calls LLM →
    returns normalized response contract → logs chat event.
    """
    if not OPENAI_API_KEY:
        raise HTTPException(status_code=503, detail="OpenAI API key not configured")

    pool          = await get_pool()
    user_payload  = await get_optional_user(authorization)
    user_id       = int(user_payload["sub"]) if user_payload else None

    # ── GSNowGPT monetization: free daily limit vs paid unlimited ──────────────
    # Free users:  GPT_FREE_DAILY_LIMIT messages per day (default 10)
    # Paid users:  GPT_PAID_HOURLY_LIMIT messages per hour (effectively unlimited)
    rate_key = str(user_id) if user_id else (request.client.host if request else "anon")
    is_paid  = await _check_premium_access(user_id, pool) if user_id else False

    if is_paid:
        # Paid: high hourly limit (virtually unlimited)
        if not check_user_rate_limit(rate_key, "/gpt/query/paid", max_requests=GPT_PAID_HOURLY_LIMIT, window_seconds=3600):
            raise HTTPException(status_code=429, detail="Hourly message limit reached. Please wait a moment.")
    else:
        # Free tier: strict daily cap
        if not check_user_rate_limit(rate_key, "/gpt/query/free", max_requests=GPT_FREE_DAILY_LIMIT, window_seconds=86400):
            raise HTTPException(
                status_code=429,
                detail=(
                    f"You've reached your free daily limit of {GPT_FREE_DAILY_LIMIT} messages. "
                    "Upgrade to a premium plan for unlimited access."
                ),
                headers={"X-Upgrade-Required": "true"},
            )

    # 1. Classify intent
    intent = classify_intent(req.message)
    print(f"[GSNOWGPT] Intent classified: '{intent}' | user={user_id} | session={req.session_id}")

    # 2. Route to context assembler
    try:
        if intent == "retrieval":
            context = await _gsnowgpt_handle_retrieval(req.message, pool)
        elif intent == "trend":
            context = await _gsnowgpt_handle_trend(req.message, pool)
        elif intent == "style":
            context = await _gsnowgpt_handle_style(
                req.message, pool, req.product_name, req.product_desc, req.product_price
            )
        elif intent in ("account", "premium"):
            context = await _gsnowgpt_handle_account(user_id, pool)
        elif intent == "proxy":
            context = {"context_type": "proxy"}

        # ── Premium paid showroom AI features ────────────────────────────────
        elif intent in PREMIUM_INTENT_FEATURES:
            feature_name = PREMIUM_INTENT_FEATURES[intent]
            is_premium   = await _check_premium_access(user_id, pool)
            if not is_premium:
                return {
                    "success":    True,
                    "type":       "gate",
                    "intent":     intent,
                    "reply":      (
                        f"✨ **{feature_name}** is a premium feature exclusive to paid subscribers. "
                        f"Upgrade your plan to unlock AI-powered {feature_name.lower()} and all other "
                        f"premium showroom AI tools."
                    ),
                    "payload":    {"context_type": "premium_gate", "feature": intent, "feature_name": feature_name},
                    "actions":    [
                        {"label": "View Plans", "route": "/pricing"},
                        {"label": "Learn More", "route": "/premium"},
                    ],
                    "citations":  [],
                    "session_id": req.session_id,
                }
            # Paid — route to appropriate handler
            if intent == "showroom_ai":
                context = await _gsnowgpt_handle_style(
                    req.message, pool, req.product_name, req.product_desc, req.product_price
                )
                context["context_type"] = "showroom_ai"
            elif intent == "trend_ai":
                context = await _gsnowgpt_handle_trend_ai(req.message, pool)
            elif intent == "design_generator":
                context = await _gsnowgpt_handle_design_generator(req.message, pool)
            elif intent == "style_match":
                context = await _gsnowgpt_handle_style_match(
                    req.message, pool, req.product_name, req.product_desc
                )
            elif intent == "outfit_builder":
                context = await _gsnowgpt_handle_outfit_builder(req.message, pool)
            elif intent == "lookbook_ai":
                context = await _gsnowgpt_handle_lookbook_ai(req.message, pool, user_id)
            elif intent == "wardrobe_ai":
                context = await _gsnowgpt_handle_wardrobe_ai(req.message, pool, user_id)
            else:
                context = await _gsnowgpt_handle_style(
                    req.message, pool, req.product_name, req.product_desc, req.product_price
                )

        elif intent == "collection_ai":
            # Saved looks / collection summary
            context = await _gsnowgpt_handle_account(user_id, pool)
            if user_id:
                async with pool.acquire() as conn:
                    saved = await conn.fetch(
                        "SELECT item_id FROM user_collections WHERE user_id=$1 ORDER BY added_at DESC LIMIT 5",
                        user_id
                    )
                context["saved_items"] = [r["item_id"] for r in saved]
            context["context_type"] = "collection_ai"
        
        elif intent == "collection_info":
            # Design collections (design cycles, collections table)
            context = await _gsnowgpt_handle_collection_info(req.message, pool)
        
        else:
            context = await _gsnowgpt_handle_style(
                req.message, pool, req.product_name, req.product_desc, req.product_price
            )
    except Exception as ctx_err:
        print(f"[GSNOWGPT] ⚠ Context assembly failed: {ctx_err} — using empty context")
        context = {"context_type": intent}

    # 3. Build messages
    system_prompt = _build_gsnowgpt_system_prompt(intent, context)
    messages = [{"role": "system", "content": system_prompt}]
    for msg in req.conversation_history[-12:]:
        if msg.get("role") in ("user", "assistant") and msg.get("content"):
            messages.append({"role": msg["role"], "content": msg["content"]})
    messages.append({"role": "user", "content": req.message})

    # 4. Call LLM
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            res = await client.post(
                "https://api.openai.com/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {OPENAI_API_KEY}",
                    "Content-Type": "application/json",
                },
                json={
                    "model":       "gpt-4o-mini",
                    "max_tokens":  600,
                    "temperature": 0.75,
                    "messages":    messages,
                },
            )
        res.raise_for_status()
        data  = res.json()
        reply = data["choices"][0]["message"]["content"].strip()
        usage = data.get("usage", {})
        print(f"[GSNOWGPT] ✓ tokens={usage} | intent={intent}")

    except httpx.HTTPStatusError as e:
        print(f"[GSNOWGPT] OpenAI error: {e.response.text[:300]}")
        raise HTTPException(status_code=502, detail="AI service error")
    except Exception as e:
        print(f"[GSNOWGPT] Unexpected error: {type(e).__name__}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

    # 5. Log chat event to structured memory
    try:
        async with pool.acquire() as conn:
            await conn.execute("""
                INSERT INTO gsnowgpt_chat_log
                    (session_id, user_id, intent, user_message, response_type, response_payload, created_at)
                VALUES ($1, $2, $3, $4, $5, $6::jsonb, NOW())
            """,
                req.session_id,
                user_id,
                intent,
                req.message,
                "text",
                json.dumps({"reply": reply, "context_type": context.get("context_type", intent)}),
            )
    except Exception as log_err:
        print(f"[GSNOWGPT] ⚠ Chat log insert failed: {log_err}")

    # 6. Emit interaction event for feedback loop
    try:
        await emit_interaction_event(
            pool=pool,
            event_type="chat_query",
            entity_id=req.session_id,
            entity_type="conversation",
            payload={"intent": intent, "message_length": len(req.message)},
            user_id=user_id,
        )
    except Exception as evt_err:
        print(f"[GSNOWGPT] ⚠ Event emit failed: {evt_err}")

    # 7. Normalized response contract
    return {
        "success":       True,
        "type":          "text",
        "intent":        intent,
        "reply":         reply,
        "payload":       context,
        "actions":       _suggest_actions(intent),
        "citations":     [],
        "session_id":    req.session_id,
    }


async def _check_premium_access(user_id: Optional[int], pool: asyncpg.Pool) -> bool:
    """Return True if user has an active paid subscription.

    Behavior when FREE_DEMO_MODE is enabled:
    - Anonymous users (user_id is None) are NOT granted premium access.
    - Logged-in users (user_id is an int) ARE granted premium access.
    """
    if FREE_DEMO_MODE:
        if user_id is None:
            return False
        return True

    if not user_id:
        return False

    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT id FROM user_subscriptions WHERE user_id=$1 AND status='active' LIMIT 1",
            user_id
        )
    return row is not None


def _suggest_actions(intent: str) -> List[Dict[str, str]]:
    """Return suggested follow-up UI actions based on intent."""
    action_map = {
        "style":            [{"label": "Browse Showroom", "route": "/showroom"}, {"label": "View Trends", "route": "/trends"}],
        "trend":            [{"label": "View Showroom", "route": "/showroom"}, {"label": "Read Articles", "route": "/articles"}],
        "retrieval":        [{"label": "Read Articles", "route": "/articles"}],
        "account":          [{"label": "Manage Subscription", "route": "/account/subscription"}],
        "premium":          [{"label": "View Plans", "route": "/pricing"}],
        "proxy":            [{"label": "Enable Proxy Voting", "route": "/account/proxy"}],
        # Named paid showroom AI features
        "showroom_ai":      [{"label": "Open Showroom", "route": "/showroom"}, {"label": "View Plans", "route": "/pricing"}],
        "trend_ai":         [{"label": "View Trends", "route": "/trends"}, {"label": "View Plans", "route": "/pricing"}],
        "design_generator": [{"label": "Open Showroom", "route": "/showroom"}, {"label": "View Plans", "route": "/pricing"}],
        "style_match":      [{"label": "Browse Showroom", "route": "/showroom"}, {"label": "View Plans", "route": "/pricing"}],
        "outfit_builder":   [{"label": "Browse Showroom", "route": "/showroom"}, {"label": "View Plans", "route": "/pricing"}],
        "lookbook_ai":      [{"label": "My Collection", "route": "/account/collection"}, {"label": "View Plans", "route": "/pricing"}],
        "wardrobe_ai":      [{"label": "My Collection", "route": "/account/collection"}, {"label": "View Plans", "route": "/pricing"}],
        "collection_ai":    [{"label": "My Collection", "route": "/account/collection"}],
        "collection_info":  [{"label": "View Collections", "route": "/collections"}, {"label": "Browse Showroom", "route": "/showroom"}],
    }
    return action_map.get(intent, [{"label": "Explore GIA", "route": "/"}])


# ══════════════════════════════════════════════════════════════════════════════
# AUTH ENDPOINTS — OTP-GATED SIGNUP
# ══════════════════════════════════════════════════════════════════════════════

@app.post("/auth/send-otp")
async def send_otp(req: SendOtpRequest, request: Request = None):
    if not req.firstName.strip() or not req.lastName.strip():
        raise HTTPException(status_code=422, detail="First and last name are required")
    if not req.email.strip():
        raise HTTPException(status_code=422, detail="Email is required")
    if len(req.password) < 6:
        raise HTTPException(status_code=422, detail="Password must be at least 6 characters")

    email = req.email.lower().strip()

    if not re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", email):
        raise HTTPException(status_code=422, detail="Invalid email address")

    # Per-IP rate limit: max 10 OTP sends per hour
    if request and not check_rate_limit(request, "/auth/send-otp", max_requests=10):
        raise HTTPException(status_code=429, detail="Too many verification attempts from this IP. Please wait.")

    pool = await get_pool()

    async with pool.acquire() as conn:
        existing = await conn.fetchrow(
            "SELECT id FROM users WHERE email = $1", email
        )
    if existing:
        raise HTTPException(
            status_code=409,
            detail="An account with this email already exists. Please sign in instead."
        )

    async with pool.acquire() as conn:
        recent_count = await conn.fetchval("""
            SELECT COUNT(*) FROM email_otps
            WHERE email = $1
              AND created_at > NOW() - INTERVAL '10 minutes'
        """, email)

    if (recent_count or 0) >= 3:
        raise HTTPException(
            status_code=429,
            detail="Too many verification attempts. Please wait a few minutes and try again."
        )

    otp_code      = _generate_otp()
    password_hash = pwd_context.hash(req.password)
    expires_at    = datetime.now(timezone.utc) + timedelta(minutes=OTP_EXPIRE_MINUTES)

    async with pool.acquire() as conn:
        await conn.execute(
            "DELETE FROM email_otps WHERE email = $1 AND used = FALSE",
            email
        )
        await conn.execute("""
            INSERT INTO email_otps
                (email, otp_code, first_name, last_name, password_hash, expires_at)
            VALUES ($1, $2, $3, $4, $5, $6)
        """,
            email,
            otp_code,
            req.firstName.strip(),
            req.lastName.strip(),
            password_hash,
            expires_at,
        )

    loop = asyncio.get_event_loop()
    email_sent = await loop.run_in_executor(
        None,
        lambda: _send_otp_email(email, otp_code, req.firstName.strip())
    )

    if not email_sent:
        async with pool.acquire() as conn:
            await conn.execute(
                "DELETE FROM email_otps WHERE email = $1 AND used = FALSE",
                email
            )
        raise HTTPException(
            status_code=503,
            detail="Failed to send verification email. Please check your email address and try again."
        )

    print(f"[AUTH] OTP sent — email: {email}")
    return {
        "success":            True,
        "message":            f"Verification code sent to {email}. It expires in {OTP_EXPIRE_MINUTES} minutes.",
        "email":              email,
        "expires_in_minutes": OTP_EXPIRE_MINUTES,
    }


@app.post("/auth/verify-otp", response_model=TokenResponse)
async def verify_otp(req: VerifyOtpRequest):
    email    = req.email.lower().strip()
    otp_code = req.otp_code.strip()

    if not email or not otp_code:
        raise HTTPException(status_code=422, detail="Email and OTP code are required")

    pool = await get_pool()

    async with pool.acquire() as conn:
        row = await conn.fetchrow("""
            SELECT id, otp_code, first_name, last_name, password_hash, expires_at, used
            FROM email_otps
            WHERE email = $1
              AND used   = FALSE
            ORDER BY created_at DESC
            LIMIT 1
        """, email)

    if not row:
        raise HTTPException(
            status_code=400,
            detail="No pending verification found for this email. Please request a new code."
        )

    expires_at = row["expires_at"]
    now        = datetime.now(timezone.utc)
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if now > expires_at:
        raise HTTPException(
            status_code=400,
            detail="Verification code has expired. Please request a new one."
        )

    if row["otp_code"] != otp_code:
        raise HTTPException(
            status_code=400,
            detail="Incorrect verification code. Please double-check and try again."
        )

    async with pool.acquire() as conn:
        await conn.execute(
            "UPDATE email_otps SET used = TRUE WHERE id = $1",
            row["id"]
        )

    async with pool.acquire() as conn:
        existing = await conn.fetchrow(
            "SELECT id FROM users WHERE email = $1", email
        )
        if existing:
            raise HTTPException(
                status_code=409,
                detail="An account with this email already exists. Please sign in."
            )

        user_row = await conn.fetchrow("""
            INSERT INTO users (first_name, last_name, email, password_hash, email_verified)
            VALUES ($1, $2, $3, $4, TRUE)
            RETURNING id, first_name, last_name, email, is_admin, created_at
        """,
            row["first_name"],
            row["last_name"],
            email,
            row["password_hash"],
        )

    user  = dict(user_row)
    token = create_jwt(user["id"], user["email"], user["is_admin"])

    print(f"[AUTH] ✓ Account created via OTP: {email} (id={user['id']})")
    return {
        "access_token": token,
        "user": {
            "id":        user["id"],
            "firstName": user["first_name"],
            "lastName":  user["last_name"],
            "email":     user["email"],
            "isAdmin":   user["is_admin"],
        },
    }


@app.post("/auth/resend-otp")
async def resend_otp(req: ResendOtpRequest):
    email = req.email.lower().strip()
    if not email:
        raise HTTPException(status_code=422, detail="Email is required")

    pool = await get_pool()

    async with pool.acquire() as conn:
        existing = await conn.fetchrow(
            "SELECT id FROM users WHERE email = $1", email
        )
    if existing:
        raise HTTPException(
            status_code=409,
            detail="This email is already registered. Please sign in."
        )

    async with pool.acquire() as conn:
        pending = await conn.fetchrow("""
            SELECT first_name, last_name, password_hash
            FROM email_otps
            WHERE email = $1
            ORDER BY created_at DESC
            LIMIT 1
        """, email)

    if not pending:
        raise HTTPException(
            status_code=400,
            detail="No pending registration found. Please start the signup process again."
        )

    async with pool.acquire() as conn:
        recent_count = await conn.fetchval("""
            SELECT COUNT(*) FROM email_otps
            WHERE email = $1
              AND created_at > NOW() - INTERVAL '10 minutes'
        """, email)

    if (recent_count or 0) >= 5:
        raise HTTPException(
            status_code=429,
            detail="Too many resend attempts. Please wait a few minutes."
        )

    otp_code   = _generate_otp()
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=OTP_EXPIRE_MINUTES)

    async with pool.acquire() as conn:
        await conn.execute(
            "DELETE FROM email_otps WHERE email = $1 AND used = FALSE",
            email
        )
        await conn.execute("""
            INSERT INTO email_otps
                (email, otp_code, first_name, last_name, password_hash, expires_at)
            VALUES ($1, $2, $3, $4, $5, $6)
        """,
            email,
            otp_code,
            pending["first_name"],
            pending["last_name"],
            pending["password_hash"],
            expires_at,
        )

    loop = asyncio.get_event_loop()
    email_sent = await loop.run_in_executor(
        None,
        lambda: _send_otp_email(email, otp_code, pending["first_name"])
    )

    if not email_sent:
        raise HTTPException(status_code=503, detail="Failed to resend email. Please try again.")

    print(f"[AUTH] OTP resent — email: {email}")
    return {
        "success":            True,
        "message":            f"New verification code sent to {email}.",
        "expires_in_minutes": OTP_EXPIRE_MINUTES,
    }


@app.post("/auth/login", response_model=TokenResponse)
async def login(req: LoginRequest, request: Request = None):
    # Security D: Per-IP brute-force protection on login
    if request and not check_rate_limit(request, "/auth/login", max_requests=20):
        raise HTTPException(status_code=429, detail="Too many login attempts. Please wait.")
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT * FROM users WHERE email = $1", req.email.lower().strip()
        )

    if not row or not pwd_context.verify(req.password, row["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    user = dict(row)

    # MVP: Email verification gate — enforced when REQUIRE_EMAIL_VERIFICATION=true
    if REQUIRE_EMAIL_VERIFICATION and not user.get("email_verified", False) and not user.get("is_admin", False):
        raise HTTPException(
            status_code=403,
            detail="Please verify your email address before signing in. Check your inbox for a verification code."
        )

    token = create_jwt(user["id"], user["email"], user["is_admin"])
    print(f"[AUTH] ✓ Login: {user['email']} (admin={user['is_admin']})")
    return {
        "access_token": token,
        "user": {
            "id":        user["id"],
            "firstName": user["first_name"],
            "lastName":  user["last_name"],
            "email":     user["email"],
            "isAdmin":   user["is_admin"],
        },
    }


@app.get("/auth/me")
async def get_me(authorization: Optional[str] = Header(None)):
    payload = await get_current_user(authorization)
    pool    = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT id, first_name, last_name, email, is_admin, email_verified FROM users WHERE id = $1",
            int(payload["sub"])
        )
    if not row:
        raise HTTPException(status_code=404, detail="User not found")
    user = dict(row)
    return {
        "id":            user["id"],
        "firstName":     user["first_name"],
        "lastName":      user["last_name"],
        "email":         user["email"],
        "isAdmin":       user["is_admin"],
        "emailVerified": user["email_verified"],
    }


# ──────────────────────────────────────────────
# Article / blog endpoints
# ──────────────────────────────────────────────
@app.post("/run")
async def run(request: Request, authorization: Optional[str] = Header(None)):
    # Require admin and check rate limit
    payload = await require_admin(authorization)
    user_id = int(payload["sub"])
    
    if not check_rate_limit(request, "/run"):
        pool = await get_pool()
        await log_admin_action(pool, user_id, "rate_limit_exceeded", "/run", "Too many requests")
        raise HTTPException(status_code=429, detail="Rate limit exceeded. Max 5 requests per hour.")
    
    pool = await get_pool()
    await log_admin_action(pool, user_id, "run_pipeline", "/run", "Triggered article generation pipeline")
    
    try:
        result = await run_pipeline()
        if result:
            return {
                "success":   True,
                "slug":      result.get("slug"),
                "image_url": result.get("image_url"),
            }
        return {
            "success": False,
            "message": f"No article generated (need {MIN_SOURCE_ARTICLES} source articles minimum)",
        }
    except Exception as e:
        print(f"[API] /run error: {type(e).__name__}: {e}")
        import traceback; traceback.print_exc()
        await log_admin_action(pool, user_id, "run_pipeline_error", "/run", str(e))
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/articles/comment-counts")
async def get_comment_counts():
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch("""
            SELECT
                a.id as article_id,
                COUNT(DISTINCT ac.id) as real_count,
                COUNT(DISTINCT ai.id) as ai_count
            FROM blog_articles a
            LEFT JOIN article_comments ac ON ac.article_id = a.id
            LEFT JOIN ai_comments ai ON ai.article_id = a.id
            GROUP BY a.id
        """)
    return {
        "counts": {
            str(r["article_id"]): r["real_count"] + r["ai_count"]
            for r in rows
        }
    }


@app.get("/articles")
async def get_articles():
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT * FROM blog_articles ORDER BY created_at DESC LIMIT 100"
        )
    articles = [record_to_dict(r) for r in rows]
    return {"success": True, "count": len(articles), "articles": articles}


@app.get("/articles/{article_id}")
async def get_article_by_id(article_id: int):
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT * FROM blog_articles WHERE id = $1", article_id
        )

    if row is None:
        raise HTTPException(status_code=404, detail=f"Article with id {article_id} not found")

    article = record_to_dict(row)

    created_at = article.get("created_at")
    if created_at:
        try:
            date_str = datetime.fromisoformat(str(created_at)).strftime("%B %d, %Y")
        except ValueError:
            date_str = str(created_at)
    else:
        date_str = ""

    return {
        "success": True,
        "article": {
            **article,
            "content":      article.get("body", ""),
            "image":        article.get("image_url", ""),
            "date":         date_str,
            "read_time":    article.get("read_time", ""),
            "author":       article.get("author", "GIA Editorial"),
            "likes":        article.get("likes", 0),
            "commentsList": [],
        },
    }


# ──────────────────────────────────────────────
# Likes endpoints
# ──────────────────────────────────────────────
@app.post("/articles/{article_id}/like")
async def toggle_like(article_id: int, authorization: Optional[str] = Header(None)):
    payload = await get_current_user(authorization)
    user_id = int(payload["sub"])
    pool    = await get_pool()

    async with pool.acquire() as conn:
        exists = await conn.fetchval(
            "SELECT id FROM blog_articles WHERE id = $1", article_id
        )
        if not exists:
            raise HTTPException(status_code=404, detail="Article not found")

        existing = await conn.fetchrow(
            "SELECT id FROM article_likes WHERE article_id=$1 AND user_id=$2",
            article_id, user_id
        )

        if existing:
            await conn.execute(
                "DELETE FROM article_likes WHERE article_id=$1 AND user_id=$2",
                article_id, user_id
            )
            await conn.execute(
                "UPDATE blog_articles SET likes = GREATEST(likes - 1, 0) WHERE id=$1",
                article_id
            )
            liked = False
        else:
            await conn.execute(
                "INSERT INTO article_likes (article_id, user_id) VALUES ($1, $2)",
                article_id, user_id
            )
            await conn.execute(
                "UPDATE blog_articles SET likes = likes + 1 WHERE id=$1",
                article_id
            )
            liked = True

        count = await conn.fetchval(
            "SELECT likes FROM blog_articles WHERE id=$1", article_id
        )

    # FIX C: Emit interaction event
    if liked:
        try:
            await emit_interaction_event(
                pool=pool,
                event_type="blog_like",
                entity_id=str(article_id),
                entity_type="article",
                payload={},
                user_id=user_id,
            )
        except Exception as e:
            print(f"[EVENT] ⚠ blog_like emit failed: {e}")

    print(f"[API] Like toggle — article={article_id} user={user_id} liked={liked} count={count}")
    return {"success": True, "liked": liked, "likes": count}


@app.get("/articles/{article_id}/like-status")
async def like_status(article_id: int, authorization: Optional[str] = Header(None)):
    if not authorization or not authorization.startswith("Bearer "):
        return {"liked": False}
    try:
        payload = decode_jwt(authorization.split(" ", 1)[1])
    except Exception:
        return {"liked": False}

    user_id = int(payload["sub"])
    pool    = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT id FROM article_likes WHERE article_id=$1 AND user_id=$2",
            article_id, user_id
        )
    return {"liked": row is not None}


# ──────────────────────────────────────────────
# Comments endpoints
# ──────────────────────────────────────────────
@app.get("/articles/{article_id}/comments")
async def get_comments(article_id: int):
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch("""
            SELECT
                c.id,
                c.text,
                c.created_at,
                u.first_name || ' ' || u.last_name AS username
            FROM article_comments c
            JOIN users u ON u.id = c.user_id
            WHERE c.article_id = $1
            ORDER BY c.created_at DESC
        """, article_id)

    comments = [
        {
            "id":   r["id"],
            "user": r["username"],
            "text": r["text"],
            "time": r["created_at"].strftime("%b %d, %Y · %H:%M"),
        }
        for r in rows
    ]
    return {"success": True, "comments": comments}


@app.post("/articles/{article_id}/comments")
async def add_comment(
    article_id: int,
    req: CommentRequest,
    request: Request,
    authorization: Optional[str] = Header(None),
):
    payload = await get_current_user(authorization)
    user_id = int(payload["sub"])

    # Security B: Rate limit comments per user (max 10 per hour to prevent spam)
    if not check_user_rate_limit(f"user_{user_id}", "/articles/comments", max_requests=10, window_seconds=3600):
        raise HTTPException(status_code=429, detail="Too many comments. Max 10 per hour.")

    text = req.text.strip()
    if not text:
        raise HTTPException(status_code=422, detail="Comment text cannot be empty")
    if len(text) > 2000:
        raise HTTPException(status_code=422, detail="Comment too long (max 2000 characters)")

    pool = await get_pool()
    async with pool.acquire() as conn:
        exists = await conn.fetchval(
            "SELECT id FROM blog_articles WHERE id = $1", article_id
        )
        if not exists:
            raise HTTPException(status_code=404, detail="Article not found")

        row = await conn.fetchrow("""
            INSERT INTO article_comments (article_id, user_id, text)
            VALUES ($1, $2, $3)
            RETURNING id, text, created_at
        """, article_id, user_id, text)

        user_row = await conn.fetchrow(
            "SELECT first_name, last_name FROM users WHERE id=$1", user_id
        )

    # FIX C: Emit interaction event for blog comment
    try:
        await emit_interaction_event(
            pool=pool,
            event_type="blog_comment",
            entity_id=str(article_id),
            entity_type="article",
            payload={"text_length": len(text)},
            user_id=user_id,
        )
    except Exception as e:
        print(f"[EVENT] ⚠ blog_comment emit failed: {e}")

    comment = {
        "id":   row["id"],
        "user": f"{user_row['first_name']} {user_row['last_name']}",
        "text": row["text"],
        "time": row["created_at"].strftime("%b %d, %Y · %H:%M"),
    }
    print(f"[API] Comment added — article={article_id} user={user_id}")
    return {"success": True, "comment": comment}


# ──────────────────────────────────────────────
# AI Comments endpoint
# ──────────────────────────────────────────────
@app.post("/generate-comments")
async def get_ai_comments(req: GenerateCommentsRequest):
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch("""
            SELECT id, user_name, text, time_label
            FROM ai_comments
            WHERE article_id = $1
            ORDER BY created_at ASC
        """, req.article_id)

    return {
        "comments": [
            {
                "id":   f"ai-{row['id']}",
                "user": row["user_name"],
                "text": row["text"],
                "time": row["time_label"],
                "isAI": True,
            }
            for row in rows
        ]
    }


# ──────────────────────────────────────────────
# Trends / memory / scraped-url endpoints
# ──────────────────────────────────────────────
@app.get("/trends")
async def get_trends():
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT * FROM trends ORDER BY created_at DESC LIMIT 100"
        )
    trends = [record_to_dict(r) for r in rows]
    return {"success": True, "count": len(trends), "trends": trends}


@app.post("/memory/store")
async def store_memory(request: MemoryStoreRequest):
    embedding = await generate_embedding(request.content)
    pool = await get_pool()
    async with pool.acquire() as conn:
        await conn.execute("""
            INSERT INTO memory_entries (type, content, payload, embedding, created_at)
            VALUES ($1, $2, $3::jsonb, $4::jsonb, NOW())
        """,
            request.type,
            request.content,
            json.dumps(request.payload),
            json.dumps(embedding),
        )
    print(f"[API] Memory stored — type: {request.type}")
    return {"success": True}


@app.get("/scraped-urls/stats")
async def scraped_url_stats():
    pool   = await get_pool()
    cutoff = datetime.utcnow() - timedelta(days=URL_REUSE_DAYS)
    async with pool.acquire() as conn:
        total  = await conn.fetchval("SELECT COUNT(*) FROM scraped_urls")
        recent = await conn.fetchval(
            "SELECT COUNT(*) FROM scraped_urls WHERE last_scraped >= $1", cutoff
        )
    return {
        "total_known_urls":            total,
        "blocked_within_reuse_window": recent,
        "available_for_rescrape":      total - recent,
        "url_reuse_days":              URL_REUSE_DAYS,
    }


@app.delete("/scraped-urls/reset")
async def reset_scraped_urls(request: Request, authorization: Optional[str] = Header(None)):
    # Require admin and check rate limit
    payload = await require_admin(authorization)
    user_id = int(payload["sub"])
    
    if not check_rate_limit(request, "/scraped-urls/reset"):
        pool = await get_pool()
        await log_admin_action(pool, user_id, "rate_limit_exceeded", "/scraped-urls/reset", "Too many requests")
        raise HTTPException(status_code=429, detail="Rate limit exceeded. Max 5 requests per hour.")
    
    pool = await get_pool()
    await log_admin_action(pool, user_id, "reset_scraped_urls", "/scraped-urls/reset", "Cleared URL history")
    
    async with pool.acquire() as conn:
        result = await conn.execute("DELETE FROM scraped_urls")
    deleted = int(result.split()[-1]) if result else 0
    print(f"[API] URL history cleared — {deleted} records deleted")
    return {"success": True, "deleted": deleted}


@app.get("/")
async def root():
    return {
        "message":  "GIA AI Blog Backend running (Supabase/PostgreSQL)",
        "python":   sys.version,
        "platform": sys.platform,
    }


# ──────────────────────────────────────────────
# Source rotation status endpoint
# ──────────────────────────────────────────────
@app.get("/source-rotation/status")
async def get_source_rotation_status():
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT last_used_source, updated_at FROM source_rotation_state WHERE id = 1"
        )
    last_used  = row["last_used_source"] if row else None
    updated_at = row["updated_at"].isoformat() if row and row["updated_at"] else None
    next_priority = _circular_priority_order(last_used)
    return {
        "last_used_source":    last_used,
        "updated_at":          updated_at,
        "next_priority_order": next_priority,
        "sources":             SOURCE_NAMES,
    }


@app.post("/source-rotation/reset")
async def reset_source_rotation(request: Request, authorization: Optional[str] = Header(None)):
    # Require admin and check rate limit
    payload = await require_admin(authorization)
    user_id = int(payload["sub"])
    
    if not check_rate_limit(request, "/source-rotation/reset"):
        pool = await get_pool()
        await log_admin_action(pool, user_id, "rate_limit_exceeded", "/source-rotation/reset", "Too many requests")
        raise HTTPException(status_code=429, detail="Rate limit exceeded. Max 5 requests per hour.")
    
    pool = await get_pool()
    await log_admin_action(pool, user_id, "reset_source_rotation", "/source-rotation/reset", "Reset source rotation state")
    
    async with pool.acquire() as conn:
        await conn.execute("""
            UPDATE source_rotation_state
            SET last_used_source = NULL, updated_at = NOW()
            WHERE id = 1
        """)
    print("[API] Source rotation state reset")
    return {"success": True, "message": "Rotation reset — next run starts from first source"}


# ──────────────────────────────────────────────
# Vector search endpoints
# ──────────────────────────────────────────────
@app.post("/memory/vector-search")
async def api_vector_search(req: VectorSearchRequest):
    if req.top_k < 1 or req.top_k > 50:
        raise HTTPException(status_code=422, detail="top_k must be between 1 and 50")

    results = await vector_search_memory(
        query_text=req.query,
        memory_type=req.memory_type,
        top_k=req.top_k,
        min_similarity=req.min_similarity,
    )
    return {"success": True, "count": len(results), "results": results}


@app.get("/memory/design-context")
async def api_design_context(
    query: str = "fashion design trends audience preferences",
    top_k_signals: int = 10,
    top_k_trends:  int = 10,
):
    # FIX D: Use single context assembler
    context = await assemble_design_context(
        query=query,
        top_k_signals=top_k_signals,
        top_k_trends=top_k_trends,
    )
    return {"success": True, **context}


@app.post("/design-signals/sync-embeddings")
async def sync_design_signal_embeddings():
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch("""
            SELECT DISTINCT ON (tag) tag, category, vote_score, like_score,
                   comment_score, trend_score, total_score
            FROM design_signals
            ORDER BY tag, computed_at DESC
        """)

    print(f"[SYNC-EMBED] Backfilling embeddings for {len(rows)} design signal tags…")
    count = 0
    for row in rows:
        try:
            await store_design_signal_embedding(
                tag=row["tag"],
                category=row["category"],
                vote_score=row["vote_score"],
                like_score=row["like_score"],
                comment_score=row["comment_score"],
                trend_score=row["trend_score"],
                total_score=row["total_score"],
            )
            count += 1
        except Exception as e:
            print(f"[SYNC-EMBED] ✗ tag={row['tag']}: {e}")

    return {"success": True, "synced": count}


@app.post("/trends/sync-embeddings")
async def sync_trend_embeddings():
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch("""
            SELECT title, description, related_tags, source_articles
            FROM trends
            ORDER BY created_at DESC
            LIMIT 200
        """)

    print(f"[SYNC-EMBED] Backfilling embeddings for {len(rows)} trends…")
    count = 0
    for row in rows:
        try:
            await store_trend_embedding(
                trend_title=row["title"],
                trend_description=row["description"] or "",
                related_tags=json.loads(row["related_tags"])    if row["related_tags"]    else [],
                source_articles=json.loads(row["source_articles"]) if row["source_articles"] else [],
            )
            count += 1
        except Exception as e:
            print(f"[SYNC-EMBED] ✗ title={row['title']}: {e}")

    return {"success": True, "synced": count}


# ──────────────────────────────────────────────
# FIX A: /style-agent is DEPRECATED — returns 410 Gone, clients must use /gpt/query
# ──────────────────────────────────────────────
@app.post("/style-agent")
async def style_agent(req: StyleAgentRequest):
    """
    DEPRECATED: This endpoint has been removed. Use POST /gpt/query instead.
    Returns HTTP 410 Gone to force client migration.
    """
    raise HTTPException(
        status_code=410,
        detail="This endpoint has been deprecated. Please use POST /gpt/query for all conversational AI features.",
        headers={"X-Upgrade-Required": "true"},
    )


# FIX A: /agent/styling is also DEPRECATED — returns 410 Gone, clients must use /gpt/query
# ──────────────────────────────────────────────
@app.post("/agent/styling")
async def agent_styling(req: StyleAgentRequest):
    """
    DEPRECATED: This endpoint has been removed. Use POST /gpt/query instead.
    Returns HTTP 410 Gone to force client migration.
    """
    raise HTTPException(
        status_code=410,
        detail="This endpoint has been deprecated. Please use POST /gpt/query for all conversational AI features.",
        headers={"X-Upgrade-Required": "true"},
    )


# ──────────────────────────────────────────────
# FIX C: Interaction event endpoint
# ──────────────────────────────────────────────
@app.post("/events/interaction")
async def post_interaction_event(
    req: InteractionEventRequest,
    request: Request = None,
    authorization: Optional[str] = Header(None),
):
    """
    Receive a canonical interaction event from the frontend.
    Valid event_types: blog_like | blog_comment | design_view | vote_cast |
                       save_look | chat_query | paid_feature_use
    Rate limited: 120 events/hour per IP (prevents flood abuse).
    """
    if req.event_type not in VALID_EVENT_TYPES:
        raise HTTPException(
            status_code=422,
            detail=f"Invalid event_type. Must be one of: {sorted(VALID_EVENT_TYPES)}"
        )

    # Per-IP abuse prevention for event ingestion
    if request and not check_rate_limit(request, "/events/interaction", max_requests=120):
        raise HTTPException(status_code=429, detail="Event rate limit exceeded. Please slow down.")

    pool     = await get_pool()
    user_payload = await get_optional_user(authorization)
    user_id  = int(user_payload["sub"]) if user_payload else None

    await emit_interaction_event(
        pool=pool,
        event_type=req.event_type,
        entity_id=req.entity_id,
        entity_type=req.entity_type,
        payload=req.payload,
        user_id=user_id,
    )

    return {"success": True, "event_type": req.event_type}


@app.post("/events/feedback-loop/run")
async def run_feedback_loop_endpoint(request: Request, authorization: Optional[str] = Header(None)):
    """Manually trigger the Feedback Loop Processor."""
    # Require admin and check rate limit
    payload = await require_admin(authorization)
    user_id = int(payload["sub"])
    
    if not check_rate_limit(request, "/events/feedback-loop/run"):
        pool = await get_pool()
        await log_admin_action(pool, user_id, "rate_limit_exceeded", "/events/feedback-loop/run", "Too many requests")
        raise HTTPException(status_code=429, detail="Rate limit exceeded. Max 5 requests per hour.")
    
    pool = await get_pool()
    await log_admin_action(pool, user_id, "run_feedback_loop", "/events/feedback-loop/run", "Triggered feedback loop processor")
    
    result = await run_feedback_loop_processor(pool)
    return {"success": True, **result}


@app.get("/events/interaction/recent")
async def get_recent_events(
    limit: int = 50,
    event_type: Optional[str] = None,
):
    pool = await get_pool()
    async with pool.acquire() as conn:
        if event_type:
            rows = await conn.fetch("""
                SELECT id, event_type, user_id, entity_id, entity_type, payload, created_at
                FROM interaction_events
                WHERE event_type = $1
                ORDER BY created_at DESC LIMIT $2
            """, event_type, limit)
        else:
            rows = await conn.fetch("""
                SELECT id, event_type, user_id, entity_id, entity_type, payload, created_at
                FROM interaction_events
                ORDER BY created_at DESC LIMIT $1
            """, limit)

    events = []
    for r in rows:
        d = dict(r)
        d["created_at"] = d["created_at"].isoformat()
        events.append(d)

    return {"success": True, "count": len(events), "events": events}


# ──────────────────────────────────────────────
# FIX B: Collection (domain primitive) endpoints
# ──────────────────────────────────────────────
@app.get("/collections")
async def get_collections(lifecycle: Optional[str] = None):
    """List all first-class collections (active, draft, published, archived)."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        if lifecycle:
            rows = await conn.fetch("""
                SELECT c.*, COUNT(gd.id) AS design_count
                FROM collections c
                LEFT JOIN generated_designs gd ON gd.collection_id = c.id
                WHERE c.lifecycle = $1
                GROUP BY c.id
                ORDER BY c.created_at DESC
            """, lifecycle)
        else:
            rows = await conn.fetch("""
                SELECT c.*, COUNT(gd.id) AS design_count
                FROM collections c
                LEFT JOIN generated_designs gd ON gd.collection_id = c.id
                GROUP BY c.id
                ORDER BY c.created_at DESC
            """)

    collections = []
    for r in rows:
        d = dict(r)
        for f in ("created_at", "published_at", "archived_at"):
            if d.get(f):
                d[f] = d[f].isoformat()
        collections.append(d)

    return {"success": True, "count": len(collections), "collections": collections}


@app.get("/collections/{collection_id}")
async def get_collection(collection_id: int):
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow("""
            SELECT c.*, COUNT(gd.id) AS design_count
            FROM collections c
            LEFT JOIN generated_designs gd ON gd.collection_id = c.id
            WHERE c.id = $1
            GROUP BY c.id
        """, collection_id)

    if not row:
        raise HTTPException(status_code=404, detail="Collection not found")

    d = dict(row)
    for f in ("created_at", "published_at", "archived_at"):
        if d.get(f):
            d[f] = d[f].isoformat()

    return {"success": True, "collection": d}


@app.post("/collections")
async def create_collection(
    req: CreateCollectionRequest,
    authorization: Optional[str] = Header(None),
):
    payload = await get_current_user(authorization)
    if not payload.get("is_admin"):
        raise HTTPException(status_code=403, detail="Admin only")

    if req.lifecycle not in ("draft", "active", "published", "archived"):
        raise HTTPException(status_code=422, detail="lifecycle must be: draft | active | published | archived")

    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow("""
            INSERT INTO collections (name, description, lifecycle)
            VALUES ($1, $2, $3)
            RETURNING id, name, description, lifecycle, created_at
        """, req.name, req.description, req.lifecycle)

    d = dict(row)
    d["created_at"] = d["created_at"].isoformat()
    return {"success": True, "collection": d}


@app.patch("/collections/{collection_id}")
async def update_collection(
    collection_id: int,
    req: UpdateCollectionRequest,
    authorization: Optional[str] = Header(None),
):
    payload = await get_current_user(authorization)
    if not payload.get("is_admin"):
        raise HTTPException(status_code=403, detail="Admin only")

    if req.lifecycle and req.lifecycle not in ("draft", "active", "published", "archived"):
        raise HTTPException(status_code=422, detail="lifecycle must be: draft | active | published | archived")

    pool = await get_pool()
    async with pool.acquire() as conn:
        updates = []
        vals    = []
        idx     = 1

        if req.name is not None:
            updates.append(f"name = ${idx}"); vals.append(req.name); idx += 1
        if req.description is not None:
            updates.append(f"description = ${idx}"); vals.append(req.description); idx += 1
        if req.lifecycle is not None:
            updates.append(f"lifecycle = ${idx}"); vals.append(req.lifecycle); idx += 1
            if req.lifecycle == "published":
                updates.append(f"published_at = NOW()")
            elif req.lifecycle == "archived":
                updates.append(f"archived_at = NOW()")

        if not updates:
            raise HTTPException(status_code=422, detail="Nothing to update")

        vals.append(collection_id)
        row = await conn.fetchrow(f"""
            UPDATE collections SET {', '.join(updates)}
            WHERE id = ${idx}
            RETURNING id, name, description, lifecycle, created_at, published_at, archived_at
        """, *vals)

    if not row:
        raise HTTPException(status_code=404, detail="Collection not found")

    d = dict(row)
    for f in ("created_at", "published_at", "archived_at"):
        if d.get(f):
            d[f] = d[f].isoformat()

    return {"success": True, "collection": d}


@app.get("/collections/{collection_id}/showroom")
async def get_collection_showroom(collection_id: int, page: int = 1, limit: int = 15):
    """Return showroom items belonging to a specific collection."""
    limit  = max(1, min(limit, 100))
    offset = (page - 1) * limit

    pool = await get_pool()
    async with pool.acquire() as conn:
        total = await conn.fetchval("""
            SELECT COUNT(*) FROM showroom s
            JOIN generated_designs gd ON gd.id = s.design_id
            WHERE gd.collection_id = $1
        """, collection_id)

        rows = await conn.fetch("""
            SELECT
                s.id, s.design_id, s.title, s.description, s.image_url,
                s.model_url, s.tags, s.likes, s.vision_score, s.created_at,
                gd.top_tags, gd.collection_id,
                CONCAT('design-', gd.id) AS product_item_id,
                COUNT(iv.id)::INT AS votes
            FROM showroom s
            JOIN generated_designs gd ON gd.id = s.design_id
            LEFT JOIN item_votes iv ON iv.item_id = CONCAT('design-', gd.id)
            WHERE gd.collection_id = $1
            GROUP BY s.id, s.design_id, s.title, s.description, s.image_url,
                     s.model_url, s.tags, s.likes, s.vision_score, s.created_at,
                     gd.top_tags, gd.collection_id, gd.id
            ORDER BY s.created_at DESC
            LIMIT $2 OFFSET $3
        """, collection_id, limit, offset)

    items = []
    for r in rows:
        d = dict(r)
        d["created_at"] = d["created_at"].isoformat()
        for field in ("tags", "top_tags"):
            if isinstance(d.get(field), str):
                try:
                    d[field] = json.loads(d[field])
                except Exception:
                    d[field] = []
        items.append(d)

    return {
        "success":     True,
        "collection_id": collection_id,
        "total":       total,
        "total_pages": math.ceil(total / limit) if total else 1,
        "page":        page,
        "items":       items,
    }


# ──────────────────────────────────────────────
# FIX A: GSNowGPT chat log endpoint
# ──────────────────────────────────────────────
@app.get("/gpt/chat-log")
async def get_gpt_chat_log(
    limit:      int           = 50,
    session_id: Optional[str] = None,
    authorization: Optional[str] = Header(None),
):
    payload = await get_current_user(authorization)
    if not payload.get("is_admin"):
        raise HTTPException(status_code=403, detail="Admin only")

    pool = await get_pool()
    async with pool.acquire() as conn:
        if session_id:
            rows = await conn.fetch("""
                SELECT id, session_id, user_id, intent, user_message,
                       response_type, response_payload, created_at
                FROM gsnowgpt_chat_log
                WHERE session_id = $1
                ORDER BY created_at DESC LIMIT $2
            """, session_id, limit)
        else:
            rows = await conn.fetch("""
                SELECT id, session_id, user_id, intent, user_message,
                       response_type, response_payload, created_at
                FROM gsnowgpt_chat_log
                ORDER BY created_at DESC LIMIT $1
            """, limit)

    logs = []
    for r in rows:
        d = dict(r)
        d["created_at"] = d["created_at"].isoformat()
        logs.append(d)

    return {"success": True, "count": len(logs), "logs": logs}


@app.get("/gpt/quota")
async def get_gpt_quota(request: Request = None, authorization: Optional[str] = Header(None)):
    """
    MVP monetization: Return user's current GSNowGPT message quota.
    Free users see their remaining daily messages.
    Paid users see unlimited status.
    Frontend uses this to display usage indicators and upgrade prompts.
    """
    pool         = await get_pool()
    user_payload = await get_optional_user(authorization)
    user_id      = int(user_payload["sub"]) if user_payload else None
    is_paid      = await _check_premium_access(user_id, pool) if user_id else False

    import time
    now = time.time()

    if is_paid:
        # Paid: virtually unlimited — report high ceiling
        rate_key = str(user_id)
        used_entries = RATE_LIMIT_REQUESTS.get((rate_key, "/gpt/query/paid"), [])
        used_this_hour = len([ts for ts in used_entries if now - ts < 3600])
        return {
            "plan":             "paid",
            "daily_limit":      None,
            "hourly_limit":     GPT_PAID_HOURLY_LIMIT,
            "used_this_hour":   used_this_hour,
            "remaining":        max(0, GPT_PAID_HOURLY_LIMIT - used_this_hour),
            "resets_in_seconds": None,
            "unlimited":        True,
        }
    else:
        # Free: daily limit
        rate_key = str(user_id) if user_id else (request.client.host if request else "anon")
        used_entries = RATE_LIMIT_REQUESTS.get((rate_key, "/gpt/query/free"), [])
        used_today   = [ts for ts in used_entries if now - ts < 86400]
        remaining    = max(0, GPT_FREE_DAILY_LIMIT - len(used_today))
        resets_in    = int(86400 - (now - min(used_today))) if used_today else 86400
        return {
            "plan":             "free",
            "daily_limit":      GPT_FREE_DAILY_LIMIT,
            "hourly_limit":     None,
            "used_today":       len(used_today),
            "remaining":        remaining,
            "resets_in_seconds": resets_in,
            "unlimited":        False,
            "upgrade_url":      "/pricing",
        }


# ──────────────────────────────────────────────
# Product Voting Endpoints
# ──────────────────────────────────────────────
# @app.post("/products/{product_id}/vote")
# async def vote_product(product_id: str, authorization: Optional[str] = Header(None)):
#     if not authorization or not authorization.startswith("Bearer "):
#         raise HTTPException(status_code=401, detail="Authentication required")

#     payload = decode_jwt(authorization.split(" ", 1)[1])
#     user_id = int(payload["sub"])

#     pool = await get_pool()

#     async with pool.acquire() as conn:
#         # FIX: Verify product exists and is active
#         product = await conn.fetchrow(
#             "SELECT id FROM product_catalog WHERE item_id=$1",
#             product_id
#         )
        
#         if not product:
#             raise HTTPException(status_code=404, detail="Product not found or is not active")

#         existing = await conn.fetchrow(
#             "SELECT id FROM item_votes WHERE item_id=$1 AND user_id=$2",
#             product_id, user_id
#         )

#         if existing:
#             raise HTTPException(status_code=400, detail="You have already voted for this product")

#         await conn.execute(
#             "INSERT INTO item_votes (item_id, user_id) VALUES ($1, $2)",
#             product_id, user_id
#         )

#         vote_count = await conn.fetchval(
#             "SELECT COUNT(*) FROM item_votes WHERE item_id=$1",
#             product_id
#         )

#     # FIX C: Emit canonical vote event
#     try:
#         await emit_interaction_event(
#             pool=pool,
#             event_type="vote_cast",
#             entity_id=product_id,
#             entity_type="product",
#             payload={"proxy": False},
#             user_id=user_id,
#         )
#     except Exception as e:
#         print(f"[EVENT] ⚠ vote_cast emit failed: {e}")

#     print(f"[VOTE] Product {product_id} voted by user {user_id} → total votes: {vote_count}")
#     return {"success": True, "votes": vote_count}

@app.post("/products/{product_id}/vote")
async def vote_product(product_id: str, request: Request = None, authorization: Optional[str] = Header(None)):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Authentication required")

    payload = decode_jwt(authorization.split(" ", 1)[1])
    user_id = int(payload["sub"])

    # Per-user rate limit: max 30 votes per hour (anti-spam)
    if not check_user_rate_limit(str(user_id), "/products/vote", max_requests=30, window_seconds=3600):
        raise HTTPException(status_code=429, detail="You're voting too fast. Please slow down.")

    pool = await get_pool()

    async with pool.acquire() as conn:
        # Verify product exists AND is active before allowing vote
        product_exists = await conn.fetchrow(
            "SELECT 1 FROM product_catalog WHERE item_id = $1 AND is_active = TRUE",
            product_id
        )
        if not product_exists:
            raise HTTPException(status_code=404, detail="Product not found or is not currently active")

        existing = await conn.fetchrow(
            "SELECT id FROM item_votes WHERE item_id=$1 AND user_id=$2",
            product_id, user_id
        )

        if existing:
            raise HTTPException(status_code=400, detail="You have already voted for this product")

        # Section 5 requirement: persist vote_explanation on item_votes row
        vote_row = await conn.fetchrow("""
            INSERT INTO item_votes (item_id, user_id, vote_explanation)
            VALUES ($1, $2, $3::jsonb)
            RETURNING id
        """, product_id, user_id, json.dumps({"method": "manual", "source": "user_vote"}))

        vote_count = await conn.fetchval(
            "SELECT COUNT(*) FROM item_votes WHERE item_id=$1",
            product_id
        )

    # Emit canonical vote event for feedback loop
    try:
        await emit_interaction_event(
            pool=pool,
            event_type="vote_cast",
            entity_id=product_id,
            entity_type="product",
            payload={"proxy": False, "vote_id": vote_row["id"] if vote_row else None},
            user_id=user_id,
        )
    except Exception as e:
        print(f"[EVENT] ⚠ vote_cast emit failed: {e}")

    print(f"[VOTE] Product {product_id} voted by user {user_id} → total votes: {vote_count}")
    return {"success": True, "votes": vote_count}

@app.get("/products/{product_id}/vote-status")
async def get_product_vote_status(product_id: str, authorization: Optional[str] = Header(None)):
    pool = await get_pool()

    async with pool.acquire() as conn:
        vote_count = await conn.fetchval(
            "SELECT COUNT(*) FROM item_votes WHERE item_id=$1",
            product_id
        )

    has_voted = False

    if authorization and authorization.startswith("Bearer "):
        try:
            payload = decode_jwt(authorization.split(" ", 1)[1])
            user_id = int(payload["sub"])

            async with pool.acquire() as conn:
                row = await conn.fetchrow(
                    "SELECT id FROM item_votes WHERE item_id=$1 AND user_id=$2",
                    product_id, user_id
                )
                has_voted = row is not None
        except Exception:
            has_voted = False

    return {"hasVoted": has_voted, "votes": vote_count}


@app.get("/auth/me/stats")
async def get_my_stats(authorization: Optional[str] = Header(None)):
    payload = await get_current_user(authorization)
    user_id = int(payload["sub"])
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow("""
            SELECT
                (SELECT COUNT(*) FROM item_votes WHERE user_id = $1) as votes_cast,
                (SELECT COUNT(*) FROM article_comments WHERE user_id = $1) as comments_made,
                (SELECT COUNT(*) FROM article_likes WHERE user_id = $1) as articles_liked,
                (SELECT COUNT(*) FROM article_comments WHERE user_id = $1) +
                (SELECT COUNT(*) FROM article_likes WHERE user_id = $1) +
                (SELECT COUNT(*) FROM item_votes WHERE user_id = $1) as activity,
                (SELECT created_at FROM users WHERE id = $1) as member_since,
                (SELECT COUNT(*) FROM user_collections WHERE user_id = $1) as models_in_collection
            """, user_id)
    if not row:
        return {"votes_cast": 0, "comments_made": 0, "articles_liked": 0, "activity": 0, "member_since": "—", "models_in_collection": 0}
    return {
        "votes_cast":           row["votes_cast"] or 0,
        "comments_made":        row["comments_made"] or 0,
        "articles_liked":       row["articles_liked"] or 0,
        "activity":             row["activity"] or 0,
        "member_since":         row["member_since"].isoformat() if row["member_since"] else "—",
        "models_in_collection": row["models_in_collection"] or 0,
    }


@app.get("/auth/me/activity")
async def get_my_activity(authorization: Optional[str] = Header(None)):
    payload = await get_current_user(authorization)
    user_id = int(payload["sub"])
    pool    = await get_pool()

    async with pool.acquire() as conn:
        vote_rows = await conn.fetch("""
            SELECT
                iv.item_id,
                iv.created_at,
                COALESCE(pc.name, iv.item_id) AS product_name
            FROM item_votes iv
            LEFT JOIN product_catalog pc ON pc.item_id = iv.item_id
            WHERE iv.user_id = $1
            ORDER BY iv.created_at DESC
            LIMIT 10
        """, user_id)

        comment_rows = await conn.fetch("""
            SELECT c.text, c.created_at, a.title AS article_title, a.id AS article_id
            FROM article_comments c
            JOIN blog_articles a ON a.id = c.article_id
            WHERE c.user_id = $1
            ORDER BY c.created_at DESC
            LIMIT 5
        """, user_id)

        like_rows = await conn.fetch("""
            SELECT al.created_at, a.title AS article_title, a.id AS article_id
            FROM article_likes al
            JOIN blog_articles a ON a.id = al.article_id
            WHERE al.user_id = $1
            ORDER BY al.created_at DESC
            LIMIT 5
        """, user_id)

    def fmt_time(dt):
        if not dt:
            return ""
        now  = datetime.utcnow()
        diff = now - dt.replace(tzinfo=None)
        if diff.days == 0:
            h = diff.seconds // 3600
            return f"{h}h ago" if h else "Just now"
        if diff.days == 1:
            return "Yesterday"
        if diff.days < 7:
            return f"{diff.days}d ago"
        return dt.strftime("%b %d")

    feed = []

    for r in vote_rows:
        product_name = r.get("product_name") or r["item_id"]
        feed.append({
            "type":  "vote",
            "icon":  "vote",
            "label": f'Voted on "{product_name}"',
            "time":  fmt_time(r["created_at"]),
            "ts":    r["created_at"].isoformat(),
        })

    for r in comment_rows:
        snippet = r["text"][:60] + ("…" if len(r["text"]) > 60 else "")
        feed.append({
            "type":       "comment",
            "icon":       "comment",
            "label":      f'Commented on "{r["article_title"]}"',
            "sublabel":   f'"{snippet}"',
            "article_id": r["article_id"],
            "time":       fmt_time(r["created_at"]),
            "ts":         r["created_at"].isoformat(),
        })

    for r in like_rows:
        feed.append({
            "type":       "like",
            "icon":       "like",
            "label":      f'Liked "{r["article_title"]}"',
            "article_id": r["article_id"],
            "time":       fmt_time(r["created_at"]),
            "ts":         r["created_at"].isoformat(),
        })

    feed.sort(key=lambda x: x["ts"], reverse=True)
    return {"success": True, "feed": feed}


# ──────────────────────────────────────────────
# Proxy Voting Endpoints
# ──────────────────────────────────────────────
@app.get("/proxy-voting/status")
async def get_proxy_status(authorization: Optional[str] = Header(None)):
    payload = await get_current_user(authorization)
    user_id = int(payload["sub"])

    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT enabled, next_run_at, last_run_at FROM user_proxy_settings WHERE user_id = $1",
            user_id
        )

    if not row:
        return {"enabled": False, "next_run_at": None, "last_run_at": None}

    return {
        "enabled":     row["enabled"],
        "next_run_at": row["next_run_at"].isoformat() if row["next_run_at"] else None,
        "last_run_at": row["last_run_at"].isoformat() if row["last_run_at"] else None,
    }


@app.post("/proxy-voting/toggle")
async def toggle_proxy_voting(req: ProxyToggleRequest, authorization: Optional[str] = Header(None)):
    payload = await get_current_user(authorization)
    user_id = int(payload["sub"])

    pool = await get_pool()

    if req.enabled:
        async with pool.acquire() as conn:
            vote_count = await conn.fetchval(
                "SELECT COUNT(*) FROM item_votes WHERE user_id = $1", user_id
            )
        if (vote_count or 0) < 1:
            raise HTTPException(
                status_code=400,
                detail="You must cast at least one vote before enabling proxy voting."
            )

    next_run_at = datetime.utcnow() + timedelta(hours=PROXY_VOTE_INTERVAL_HOURS) if req.enabled else None

    async with pool.acquire() as conn:
        await conn.execute("""
            INSERT INTO user_proxy_settings (user_id, enabled, next_run_at, updated_at)
            VALUES ($1, $2, $3, NOW())
            ON CONFLICT (user_id) DO UPDATE
                SET enabled     = EXCLUDED.enabled,
                    next_run_at = EXCLUDED.next_run_at,
                    updated_at  = NOW()
        """, user_id, req.enabled, next_run_at)

        row = await conn.fetchrow(
            "SELECT enabled, next_run_at, last_run_at FROM user_proxy_settings WHERE user_id = $1",
            user_id
        )

    print(f"[PROXY] user_id={user_id} → enabled={req.enabled}")

    return {
        "enabled":     row["enabled"],
        "next_run_at": row["next_run_at"].isoformat() if row["next_run_at"] else None,
        "last_run_at": row["last_run_at"].isoformat() if row["last_run_at"] else None,
    }


@app.get("/proxy-voting/preferences")
async def get_proxy_preferences(authorization: Optional[str] = Header(None)):
    """Get user's proxy voting preference profile."""
    payload = await get_current_user(authorization)
    user_id = int(payload["sub"])
    
    pool = await get_pool()
    prefs = await get_or_create_proxy_preferences(pool, user_id)
    
    return {
        "success": True,
        "user_id": user_id,
        "preferences": prefs,
    }


@app.put("/proxy-voting/preferences")
async def update_proxy_preferences(
    req: ProxyPreferenceUpdateRequest,
    authorization: Optional[str] = Header(None)
):
    """Update user's proxy voting preference profile."""
    payload = await get_current_user(authorization)
    user_id = int(payload["sub"])
    
    pool = await get_pool()
    
    # Build update dict from non-None values
    updates = {}
    for field, value in req.dict(exclude_unset=True).items():
        if value is not None:
            # Validate value is in range 0-100
            if not (0 <= value <= 100):
                raise HTTPException(status_code=422, detail=f"{field} must be between 0 and 100")
            updates[field] = value
    
    if not updates:
        # No updates provided
        prefs = await get_or_create_proxy_preferences(pool, user_id)
        return {"success": True, "message": "No changes made", "preferences": prefs}
    
    # Build SET clause dynamically
    set_clause = ", ".join([f"{k} = ${i+2}" for i, k in enumerate(updates.keys())])
    values = [user_id] + list(updates.values())
    
    async with pool.acquire() as conn:
        await conn.execute(f"""
            INSERT INTO proxy_preferences (user_id, {", ".join(updates.keys())})
            VALUES ($1, {", ".join([f"${i+2}" for i in range(len(updates))])})
            ON CONFLICT (user_id) DO UPDATE
                SET {set_clause}, updated_at = NOW()
        """, *values)
    
    # Return updated preferences
    prefs = await get_or_create_proxy_preferences(pool, user_id)
    return {"success": True, "message": "Preferences updated", "preferences": prefs}


@app.get("/proxy-voting/vote-explanation/{vote_id}")
async def get_vote_explanation(vote_id: int, authorization: Optional[str] = Header(None)):
    """Get explanation metadata for a specific proxy vote (audit/debug)."""
    payload = await get_current_user(authorization)
    user_id = int(payload["sub"])
    
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow("""
            SELECT * FROM proxy_vote_explanations
            WHERE id = $1 AND user_id = $2
        """, vote_id, user_id)
    
    if not row:
        raise HTTPException(status_code=404, detail="Vote explanation not found")
    
    # Convert to dict and format timestamps
    explanation = dict(row)
    explanation["created_at"] = explanation["created_at"].isoformat()
    
    return {"success": True, "explanation": explanation}


@app.get("/proxy-voting/recent-explanations")
async def get_recent_explanations(
    limit: int = 10,
    authorization: Optional[str] = Header(None)
):
    """Get recent proxy vote explanations for transparency/audit."""
    limit = max(1, min(limit, 50))  # Clamp between 1 and 50
    
    payload = await get_current_user(authorization)
    user_id = int(payload["sub"])
    
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch("""
            SELECT id, product_id, combined_score, score_computation_method,
                   matched_preferences, boosted_by, tie_break_reason, created_at
            FROM proxy_vote_explanations
            WHERE user_id = $1
            ORDER BY created_at DESC
            LIMIT $2
        """, user_id, limit)
    
    explanations = []
    for row in rows:
        exp = dict(row)
        exp["created_at"] = exp["created_at"].isoformat()
        explanations.append(exp)
    
    return {
        "success": True,
        "count": len(explanations),
        "explanations": explanations,
    }


# ──────────────────────────────────────────────
# Stripe Payment Endpoints
# ──────────────────────────────────────────────
def get_stripe_period(subscription_id: str):
    if not subscription_id:
        return None, None
    try:
        sub = stripe.Subscription.retrieve(subscription_id, expand=["items"])
        if sub.items and sub.items.data:
            item       = sub.items.data[0]
            started_at = datetime.utcfromtimestamp(item.current_period_start)
            ends_at    = datetime.utcfromtimestamp(item.current_period_end)
            return started_at, ends_at
        started_at = datetime.utcfromtimestamp(sub.current_period_start) if sub.current_period_start else None
        ends_at    = datetime.utcfromtimestamp(sub.current_period_end)   if sub.current_period_end   else None
        return started_at, ends_at
    except Exception as e:
        print(f"[STRIPE] Could not fetch subscription period for {subscription_id}: {e}")
        return None, None


@app.get("/payment/billing-config")
async def get_billing_config():
    """Public billing configuration for frontend."""
    return {
        "free_demo_mode": FREE_DEMO_MODE,
        "stripe_configured": bool(STRIPE_SECRET_KEY),
        "default_price_id": STRIPE_PRICE_PREMIUM_MONTHLY,
        "gpt_free_daily_limit": GPT_FREE_DAILY_LIMIT,
        "gpt_paid_hourly_limit": GPT_PAID_HOURLY_LIMIT,
    }


@app.post("/payment/create-checkout-session")
async def create_checkout_session(
    req: CreateCheckoutRequest,
    authorization: Optional[str] = Header(None),
):
    if not stripe.api_key:
        raise HTTPException(status_code=503, detail="Stripe is not configured")

    payload = await get_current_user(authorization)
    user_id = int(payload["sub"])

    try:
        session = stripe.checkout.Session.create(
            payment_method_types=["card"],
            mode="subscription",
            line_items=[{"price": req.price_id, "quantity": 1}],
            success_url=(
                req.success_url
                or f"{os.getenv('FRONTEND_URL', 'http://localhost:5173')}/pricing/success?session_id={{CHECKOUT_SESSION_ID}}"
            ),
            cancel_url=(
                req.cancel_url
                or f"{os.getenv('FRONTEND_URL', 'http://localhost:5173')}/pricing"
            ),
            metadata={
                "user_id":   str(user_id),
                "plan_name": req.plan_name,
            },
        )
        print(f"[STRIPE] Checkout session created for user {user_id} | Plan: {req.plan_name}")
        return {"url": session.url, "session_id": session.id}

    except stripe.StripeError as e:
        print(f"[STRIPE ERROR] {e}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        print(f"[STRIPE] Unexpected error: {e}")
        raise HTTPException(status_code=500, detail="Failed to create checkout session")


@app.post("/payment/webhook")
async def stripe_webhook(request: Request):
    # Security B: Rate-limit webhook ingestion to prevent replay flooding
    if not check_rate_limit(request, "/payment/webhook", max_requests=100):
        raise HTTPException(status_code=429, detail="Webhook rate limit exceeded.")

    webhook_secret = os.getenv("STRIPE_WEBHOOK_SECRET")
    if not webhook_secret:
        print("[WEBHOOK] STRIPE_WEBHOOK_SECRET not set")
        return {"status": "error"}

    payload    = await request.body()
    sig_header = request.headers.get("stripe-signature")

    try:
        event = stripe.Webhook.construct_event(payload, sig_header, webhook_secret)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid signature or payload")

    event_type = event["type"]
    data       = event["data"]["object"]
    print(f"[WEBHOOK] Received: {event_type}")

    if event_type == "checkout.session.completed":
        session     = data
        metadata    = getattr(session, "metadata", {}) or {}
        user_id_str = metadata.get("user_id")   if hasattr(metadata, "get") else None
        plan_name   = metadata.get("plan_name") if hasattr(metadata, "get") else None
        session_id  = session.get("id")
        subscription_id = session.get("subscription")

        if user_id_str and subscription_id:
            started_at, ends_at = get_stripe_period(subscription_id)
            pool = await get_pool()
            async with pool.acquire() as conn:
                await conn.execute("""
                    INSERT INTO user_subscriptions
                        (user_id, stripe_session_id, stripe_subscription_id, plan_name, status, started_at, ends_at)
                    VALUES ($1, $2, $3, $4, 'active', $5, $6)
                    ON CONFLICT (stripe_session_id) DO UPDATE
                        SET stripe_subscription_id = EXCLUDED.stripe_subscription_id,
                            plan_name   = EXCLUDED.plan_name,
                            status      = 'active',
                            started_at  = EXCLUDED.started_at,
                            ends_at     = EXCLUDED.ends_at,
                            updated_at  = NOW()
                """, int(user_id_str), session_id, subscription_id, plan_name, started_at, ends_at)

            # Emit paid feature event
            try:
                await emit_interaction_event(
                    pool=pool,
                    event_type="paid_feature_use",
                    entity_id=session_id,
                    entity_type="subscription",
                    payload={"plan_name": plan_name},
                    user_id=int(user_id_str),
                )
            except Exception:
                pass

            print(f"✅ [WEBHOOK] Subscription saved → user={user_id_str} | plan={plan_name} | ends={ends_at}")

    elif event_type == "invoice.payment_succeeded":
        subscription_id = data.get("subscription")
        if subscription_id:
            started_at, ends_at = get_stripe_period(subscription_id)
            pool = await get_pool()
            async with pool.acquire() as conn:
                await conn.execute("""
                    UPDATE user_subscriptions
                    SET started_at = $1, ends_at = $2, status = 'active', updated_at = NOW()
                    WHERE stripe_subscription_id = $3
                """, started_at, ends_at, subscription_id)

    elif event_type == "customer.subscription.deleted":
        subscription_id = data.get("id")
        if subscription_id:
            pool = await get_pool()
            async with pool.acquire() as conn:
                await conn.execute("""
                    UPDATE user_subscriptions
                    SET status = 'cancelled', updated_at = NOW()
                    WHERE stripe_subscription_id = $1
                """, subscription_id)

    return {"status": "success"}


@app.post("/payment/confirm-subscription")
async def confirm_subscription(
    request: Request,
    authorization: Optional[str] = Header(None),
):
    # Security B: Rate limit confirm calls to prevent replay
    if not check_rate_limit(request, "/payment/confirm-subscription", max_requests=10):
        raise HTTPException(status_code=429, detail="Rate limit exceeded.")
    body       = await request.json()
    session_id = body.get("session_id")

    if not session_id:
        raise HTTPException(status_code=400, detail="session_id is required")

    try:
        stripe_session = stripe.checkout.Session.retrieve(session_id)
    except stripe.StripeError as e:
        raise HTTPException(status_code=400, detail=f"Stripe error: {e}")
    except Exception:
        raise HTTPException(status_code=400, detail="Failed to retrieve session")

    if stripe_session.payment_status != "paid":
        raise HTTPException(status_code=400, detail="Payment not completed")

    metadata    = getattr(stripe_session, "metadata", None) or {}
    user_id_str = metadata.get("user_id")   if hasattr(metadata, "get") else getattr(metadata, "user_id",   None)
    plan_name   = metadata.get("plan_name") if hasattr(metadata, "get") else getattr(metadata, "plan_name", None)

    if not user_id_str:
        raise HTTPException(status_code=400, detail="No user_id in session metadata")

    subscription_id        = stripe_session.subscription
    started_at, ends_at    = get_stripe_period(subscription_id)

    pool = await get_pool()
    async with pool.acquire() as conn:
        await conn.execute("""
            INSERT INTO user_subscriptions
                (user_id, stripe_session_id, stripe_subscription_id, plan_name, status, started_at, ends_at)
            VALUES ($1, $2, $3, $4, 'active', $5, $6)
            ON CONFLICT (stripe_session_id) DO UPDATE
                SET stripe_subscription_id = EXCLUDED.stripe_subscription_id,
                    plan_name   = EXCLUDED.plan_name,
                    status      = 'active',
                    started_at  = EXCLUDED.started_at,
                    ends_at     = EXCLUDED.ends_at,
                    updated_at  = NOW()
        """, int(user_id_str), session_id, subscription_id, plan_name, started_at, ends_at)

    print(f"✅ [CONFIRM] Subscription stored → user={user_id_str} | plan={plan_name} | ends={ends_at}")
    return {"success": True, "plan": plan_name or "Premium"}


@app.post("/payment/cancel-subscription")
async def cancel_subscription(request: Request, authorization: Optional[str] = Header(None)):
    # Security B: Rate limit cancellation endpoint
    if not check_rate_limit(request, "/payment/cancel-subscription", max_requests=5):
        raise HTTPException(status_code=429, detail="Rate limit exceeded.")
    payload = await get_current_user(authorization)
    user_id = int(payload["sub"])

    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow("""
            SELECT stripe_subscription_id
            FROM user_subscriptions
            WHERE user_id = $1 AND status = 'active'
            ORDER BY created_at DESC LIMIT 1
        """, user_id)

        if not row or not row["stripe_subscription_id"]:
            raise HTTPException(status_code=400, detail="No active subscription found")

        sub_id = row["stripe_subscription_id"]

    try:
        stripe.Subscription.modify(sub_id, cancel_at_period_end=True)

        async with pool.acquire() as conn:
            await conn.execute("""
                UPDATE user_subscriptions
                SET status = 'cancelled', updated_at = NOW()
                WHERE stripe_subscription_id = $1
            """, sub_id)

        return {"success": True, "message": "Subscription cancelled at the end of the current billing period."}
    except stripe.StripeError as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/payment/switch-plan")
async def switch_plan(req: SwitchPlanRequest, request: Request = None, authorization: Optional[str] = Header(None)):
    # Security B: Rate limit plan switching
    if request and not check_rate_limit(request, "/payment/switch-plan", max_requests=5):
        raise HTTPException(status_code=429, detail="Rate limit exceeded.")
    payload = await get_current_user(authorization)
    user_id = int(payload["sub"])

    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow("""
            SELECT stripe_subscription_id
            FROM user_subscriptions
            WHERE user_id = $1 AND status = 'active'
            ORDER BY created_at DESC LIMIT 1
        """, user_id)

        if not row or not row["stripe_subscription_id"]:
            raise HTTPException(status_code=400, detail="No active subscription to switch")

        current_sub_id = row["stripe_subscription_id"]

    try:
        sub     = stripe.Subscription.retrieve(current_sub_id)
        if not sub.items.data:
            raise HTTPException(status_code=400, detail="Invalid subscription")

        item_id     = sub.items.data[0].id
        updated_sub = stripe.Subscription.modify(
            current_sub_id,
            items=[{"id": item_id, "price": req.new_price_id}],
            proration_behavior="create_prorations",
        )

        async with pool.acquire() as conn:
            await conn.execute("""
                UPDATE user_subscriptions
                SET plan_name = $1, updated_at = NOW()
                WHERE stripe_subscription_id = $2
            """, req.new_plan_name, current_sub_id)

        return {
            "success":      True,
            "message":      f"Plan switched to {req.new_plan_name}.",
            "subscription": updated_sub,
        }

    except stripe.StripeError as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.get("/auth/me/subscription")
async def get_my_subscription(authorization: Optional[str] = Header(None)):
    payload = await get_current_user(authorization)
    user_id = int(payload["sub"])
    pool    = await get_pool()

    async with pool.acquire() as conn:
        row = await conn.fetchrow("""
            SELECT plan_name, status, started_at, ends_at
            FROM user_subscriptions
            WHERE user_id = $1 AND status = 'active'
            ORDER BY created_at DESC LIMIT 1
        """, user_id)

    subscribed = bool(row and row["started_at"])
    premium_unlocked = subscribed or FREE_DEMO_MODE

    if not subscribed:
        return {
            "subscribed": False,
            "plan": None,
            "since": None,
            "ends_at": None,
            "free_demo_mode": FREE_DEMO_MODE,
            "premium_unlocked": premium_unlocked,
        }

    return {
        "subscribed": True,
        "plan":       row["plan_name"],
        "status":     row["status"],
        "since":      row["started_at"].isoformat() if row["started_at"] else None,
        "ends_at":    row["ends_at"].isoformat()    if row["ends_at"]    else None,
        "free_demo_mode": FREE_DEMO_MODE,
        "premium_unlocked": premium_unlocked,
    }


# ──────────────────────────────────────────────
# Collection (user-facing saved items) endpoints
# ──────────────────────────────────────────────
@app.get("/auth/me/collection/status/{item_id}")
async def get_collection_status(item_id: str, authorization: Optional[str] = Header(None)):
    if not authorization or not authorization.startswith("Bearer "):
        return {"isInCollection": False}

    payload = await get_current_user(authorization)
    user_id = int(payload["sub"])

    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT id FROM user_collections WHERE user_id = $1 AND item_id = $2",
            user_id, item_id
        )

    return {"isInCollection": row is not None}


@app.get("/auth/me/collection")
async def get_my_collection(authorization: Optional[str] = Header(None)):
    payload = await get_current_user(authorization)
    user_id = int(payload["sub"])
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch("""
            SELECT
                uc.item_id,
                COALESCE(s.title, 'Unknown Model') as title,
                COALESCE(uc.image_url, s.image_url, '') as image_url,
                COALESCE(uc.model_url, '') as model_url,
                uc.added_at
            FROM user_collections uc
            LEFT JOIN showroom s
                ON s.design_id = CAST( (string_to_array(uc.item_id, '-'))[2] AS BIGINT )
            WHERE uc.user_id = $1
            ORDER BY uc.added_at DESC
        """, user_id)
    models = [dict(r) | {"added_at": r["added_at"].isoformat() if r["added_at"] else None} for r in rows]
    return {"success": True, "models": models}


@app.post("/auth/me/collection")
async def add_to_collection(
    req: CollectionRequest,
    request: Request,
    authorization: Optional[str] = Header(None),
):
    payload = await get_current_user(authorization)
    user_id = int(payload["sub"])

    # Security B: Rate limit collection additions per user (max 50 per hour)
    if not check_user_rate_limit(f"user_{user_id}", "/auth/me/collection", max_requests=50, window_seconds=3600):
        raise HTTPException(status_code=429, detail="Too many collection additions. Max 50 per hour.")

    pool = await get_pool()

    async with pool.acquire() as conn:
        exists = await conn.fetchval(
            "SELECT EXISTS(SELECT 1 FROM user_collections WHERE user_id = $1 AND item_id = $2)",
            user_id, req.item_id
        )

        if exists:
            message   = "Already in collection"
            was_added = False
        else:
            await conn.execute(
                """INSERT INTO user_collections (user_id, item_id, model_url, image_url, added_at)
                   VALUES ($1, $2, $3, $4, NOW())""",
                user_id, req.item_id,
                req.model_url or None,
                req.image_url or None,
            )
            message   = "Model added to your collection!"
            was_added = True

    # FIX C: Emit save_look event
    if was_added:
        try:
            await emit_interaction_event(
                pool=pool,
                event_type="save_look",
                entity_id=req.item_id,
                entity_type="design",
                payload={},
                user_id=user_id,
            )
        except Exception as e:
            print(f"[EVENT] ⚠ save_look emit failed: {e}")

    return {"success": True, "message": message, "isInCollection": True}


# ──────────────────────────────────────────────
# Design Agent endpoints
# ──────────────────────────────────────────────
@app.post("/run-design")
async def run_design_endpoint(request: Request, authorization: Optional[str] = Header(None)):
    # Require admin and check rate limit
    payload = await require_admin(authorization)
    user_id = int(payload["sub"])
    
    if not check_rate_limit(request, "/run-design"):
        pool = await get_pool()
        await log_admin_action(pool, user_id, "rate_limit_exceeded", "/run-design", "Too many requests")
        raise HTTPException(status_code=429, detail="Rate limit exceeded. Max 5 requests per hour.")
    
    pool = await get_pool()
    await log_admin_action(pool, user_id, "run_design_agent", "/run-design", "Triggered design generation")
    
    try:
        result = await run_design_agent(pool)
        if result:
            return {"success": True, **result}
        return {"success": False, "message": "Agent gated or failed — check logs"}
    except Exception as e:
        import traceback; traceback.print_exc()
        await log_admin_action(pool, user_id, "run_design_agent_error", "/run-design", str(e))
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/showroom")
async def get_showroom(page: int = 1, limit: int = 15, collection_id: Optional[int] = None):
    # FIX B: collection_id query param makes showroom collection-first (optional filter)
    limit  = max(1, min(limit, 100))
    page   = max(1, page)
    offset = (page - 1) * limit

    pool = await get_pool()

    async with pool.acquire() as conn:
        if collection_id is not None:
            total: int = await conn.fetchval(
                "SELECT COUNT(*) FROM showroom s JOIN generated_designs gd ON gd.id = s.design_id WHERE gd.collection_id = $1",
                collection_id
            )
            rows = await conn.fetch("""
                SELECT
                    s.id, s.design_id, s.title, s.description, s.image_url,
                    s.model_url, s.tags, s.likes, s.vision_score, s.created_at,
                    gd.top_tags, gd.brief_json, gd.score_json, gd.collection_id,
                    CONCAT('design-', gd.id) AS product_item_id,
                    COUNT(iv.id)::INT AS votes
                FROM showroom s
                JOIN generated_designs gd ON gd.id = s.design_id
                LEFT JOIN item_votes iv ON iv.item_id = CONCAT('design-', gd.id)
                WHERE gd.collection_id = $3
                GROUP BY
                    s.id, s.design_id, s.title, s.description, s.image_url,
                    s.model_url, s.tags, s.likes, s.vision_score, s.created_at,
                    gd.top_tags, gd.brief_json, gd.score_json, gd.collection_id, gd.id
                ORDER BY s.created_at DESC
                LIMIT $1 OFFSET $2
            """, limit, offset, collection_id)
        else:
            total: int = await conn.fetchval(
                "SELECT COUNT(*) FROM showroom s JOIN generated_designs gd ON gd.id = s.design_id"
            )
            rows = await conn.fetch("""
                SELECT
                    s.id, s.design_id, s.title, s.description, s.image_url,
                    s.model_url, s.tags, s.likes, s.vision_score, s.created_at,
                    gd.top_tags, gd.brief_json, gd.score_json, gd.collection_id,
                    CONCAT('design-', gd.id) AS product_item_id,
                    COUNT(iv.id)::INT AS votes
                FROM showroom s
                JOIN generated_designs gd ON gd.id = s.design_id
                LEFT JOIN item_votes iv ON iv.item_id = CONCAT('design-', gd.id)
                GROUP BY
                    s.id, s.design_id, s.title, s.description, s.image_url,
                    s.model_url, s.tags, s.likes, s.vision_score, s.created_at,
                    gd.top_tags, gd.brief_json, gd.score_json, gd.collection_id, gd.id
                ORDER BY s.created_at DESC
                LIMIT $1 OFFSET $2
            """, limit, offset)

    items = []
    for r in rows:
        d = dict(r)
        d["created_at"] = d["created_at"].isoformat()
        for field in ("tags", "top_tags", "brief_json", "score_json"):
            if isinstance(d.get(field), str):
                try:
                    d[field] = json.loads(d[field])
                except Exception:
                    d[field] = []
        items.append(d)

    total_pages = math.ceil(total / limit) if total > 0 else 1

    return {
        "success":       True,
        "total":         total,
        "total_pages":   total_pages,
        "page":          page,
        "limit":         limit,
        "count":         len(items),
        "collection_id": collection_id,
        "items":         items,
    }

@app.get("/showroom/{showroom_id}")
async def get_showroom_item(showroom_id: int):
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow("""
            SELECT
                s.id,
                s.design_id,
                s.title,
                s.description,
                s.image_url,
                s.model_url,
                s.tags,
                s.likes,
                s.vision_score,
                s.created_at,
                gd.brief_json,
                gd.top_tags,
                gd.score_json,
                gd.prompt_used,
                gd.cycle_number,
                gd.collection_id,
                CONCAT('design-', gd.id) AS product_item_id,
                COUNT(iv.id)::INT AS votes
            FROM showroom s
            JOIN generated_designs gd ON gd.id = s.design_id
            LEFT JOIN item_votes iv ON iv.item_id = CONCAT('design-', gd.id)
            WHERE s.id = $1
            GROUP BY
                s.id, s.design_id, s.title, s.description, s.image_url,
                s.model_url, s.tags, s.likes, s.vision_score, s.created_at,
                gd.brief_json, gd.top_tags, gd.score_json, gd.prompt_used, gd.id, gd.cycle_number,
                gd.collection_id
        """, showroom_id)

    if not row:
        raise HTTPException(status_code=404, detail="Design not found")

    d = dict(row)
    d["created_at"] = d["created_at"].isoformat()
    for field in ("tags", "top_tags", "brief_json", "score_json"):
        if isinstance(d.get(field), str):
            try:
                d[field] = json.loads(d[field])
            except Exception:
                d[field] = []

    # Emit design_view event (fire-and-forget)
    pool = await get_pool()
    try:
        await emit_interaction_event(
            pool=pool,
            event_type="design_view",
            entity_id=str(showroom_id),
            entity_type="design",
            payload={"design_id": d.get("design_id")},
            user_id=None,
        )
    except Exception:
        pass

    return {"success": True, "item": d}


@app.get("/collections/{collection_id}/ranking")
async def get_collection_ranking(collection_id: int, limit: int = 10):
    """
    API for collection-level ranking: top voted designs per collection.
    """
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch("""
            SELECT
                s.id,
                s.design_id,
                s.title,
                s.description,
                s.image_url,
                s.model_url,
                s.tags,
                s.likes,
                s.vision_score,
                s.created_at,
                gd.top_tags,
                gd.brief_json,
                gd.score_json,
                CONCAT('design-', gd.id) AS product_item_id,
                COUNT(iv.id)::INT AS votes
            FROM showroom s
            JOIN generated_designs gd ON gd.id = s.design_id
            LEFT JOIN item_votes iv ON iv.item_id = CONCAT('design-', gd.id)
            WHERE gd.collection_id = $1
            GROUP BY
                s.id, s.design_id, s.title, s.description, s.image_url,
                s.model_url, s.tags, s.likes, s.vision_score, s.created_at,
                gd.top_tags, gd.brief_json, gd.score_json, gd.id
            ORDER BY COUNT(iv.id) DESC, s.likes DESC
            LIMIT $2
        """, collection_id, limit)

    items = []
    for r in rows:
        d = dict(r)
        d["created_at"] = d["created_at"].isoformat()
        for field in ("tags", "top_tags", "brief_json", "score_json"):
            if isinstance(d.get(field), str):
                try:
                    d[field] = json.loads(d[field])
                except Exception:
                    d[field] = []
        items.append(d)

    return {"success": True, "collection_id": collection_id, "count": len(items), "ranked_items": items}


@app.get("/design-signals")
async def get_design_signals(limit: int = 30):
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch("""
            SELECT DISTINCT ON (tag) tag, vote_score, like_score,
                   comment_score, trend_score, total_score, computed_at
            FROM design_signals ORDER BY tag, computed_at DESC
        """)
    signals = sorted(
        [dict(r) | {"computed_at": r["computed_at"].isoformat()} for r in rows],
        key=lambda x: x["total_score"], reverse=True
    )
    return {"success": True, "count": len(signals), "signals": signals[:limit]}


@app.get("/generated-designs")
async def get_generated_designs():
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch("""
            SELECT id, cycle_number, collection_id, status, publishable, image_url, model_url,
                   top_tags, created_at, published_at
            FROM generated_designs
            ORDER BY created_at DESC
        """)
    items = []
    for r in rows:
        d = dict(r)
        d["created_at"]   = d["created_at"].isoformat()   if d["created_at"]   else None
        d["published_at"] = d["published_at"].isoformat() if d["published_at"] else None
        items.append(d)
    return {"success": True, "count": len(items), "items": items}


# ──────────────────────────────────────────────
# Design Cycles endpoints
# ──────────────────────────────────────────────
@app.get("/design-cycles")
async def get_design_cycles():
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch("""
            SELECT
                dc.cycle_number,
                dc.started_at,
                dc.completed_at,
                COUNT(gd.id) FILTER (WHERE gd.status != 'rejected') AS design_count,
                COUNT(gd.id) FILTER (WHERE gd.publishable = TRUE)   AS published_count
            FROM design_cycles dc
            LEFT JOIN generated_designs gd ON gd.cycle_number = dc.cycle_number
            GROUP BY dc.cycle_number, dc.started_at, dc.completed_at
            ORDER BY dc.cycle_number DESC
        """)

    cycles = []
    for r in rows:
        d = dict(r)
        d["started_at"]   = d["started_at"].isoformat()   if d["started_at"]   else None
        d["completed_at"] = d["completed_at"].isoformat() if d["completed_at"] else None
        d["is_active"]    = d["completed_at"] is None
        cycles.append(d)

    return {"success": True, "count": len(cycles), "cycles": cycles}


@app.get("/design-cycles/active")
async def get_active_cycle():
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow("""
            SELECT
                dc.cycle_number,
                dc.started_at,
                COUNT(gd.id) FILTER (WHERE gd.status != 'rejected') AS design_count,
                COUNT(gd.id) FILTER (WHERE gd.publishable = TRUE)   AS published_count
            FROM design_cycles dc
            LEFT JOIN generated_designs gd ON gd.cycle_number = dc.cycle_number
            WHERE dc.completed_at IS NULL
            GROUP BY dc.cycle_number, dc.started_at
            ORDER BY dc.cycle_number DESC
            LIMIT 1
        """)

    if not row:
        return {"success": True, "cycle": None, "message": "No active cycle — CIA will start one when prerequisites are met"}

    d = dict(row)
    d["started_at"] = d["started_at"].isoformat()
    d["is_active"]  = True
    d["remaining"]  = max(0, CIA_MIN_DESIGNS - (d["design_count"] or 0))
    d["target"]     = CIA_MIN_DESIGNS

    return {"success": True, "cycle": d}


# ──────────────────────────────────────────────
# Cycle Integrity Agent endpoints
# ──────────────────────────────────────────────
@app.post("/cycle-integrity/run")
async def run_cycle_integrity_endpoint(request: Request, authorization: Optional[str] = Header(None)):
    # Require admin and check rate limit
    payload = await require_admin(authorization)
    user_id = int(payload["sub"])
    
    if not check_rate_limit(request, "/cycle-integrity/run"):
        pool = await get_pool()
        await log_admin_action(pool, user_id, "rate_limit_exceeded", "/cycle-integrity/run", "Too many requests")
        raise HTTPException(status_code=429, detail="Rate limit exceeded. Max 5 requests per hour.")
    
    pool = await get_pool()
    await log_admin_action(pool, user_id, "run_cia", "/cycle-integrity/run", "Triggered cycle integrity check")
    
    try:
        result = await run_cycle_integrity_agent()
        return {"success": True, **result}
    except Exception as e:
        await log_admin_action(pool, user_id, "run_cia_error", "/cycle-integrity/run", str(e))
        import traceback; traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/cycle-integrity/status")
async def get_cycle_integrity_status(cycle_number: Optional[int] = None):
    pool = await get_pool()

    if cycle_number is not None:
        async with pool.acquire() as conn:
            row = await conn.fetchrow("""
                SELECT id, run_at, cycle_number, gate_results, overall_status, action_taken, notes
                FROM cycle_integrity_log
                WHERE cycle_number = $1
                ORDER BY run_at DESC
                LIMIT 1
            """, cycle_number)
    else:
        async with pool.acquire() as conn:
            row = await conn.fetchrow("""
                SELECT id, run_at, cycle_number, gate_results, overall_status, action_taken, notes
                FROM cycle_integrity_log
                ORDER BY run_at DESC
                LIMIT 1
            """)

    if not row:
        return {
            "success": True,
            "status":  None,
            "message": "No cycle integrity runs recorded yet",
        }

    d = dict(row)
    d["run_at"] = d["run_at"].isoformat()
    if isinstance(d.get("gate_results"), str):
        try:
            d["gate_results"] = json.loads(d["gate_results"])
        except Exception:
            d["gate_results"] = {}

    return {"success": True, "status": d}


@app.get("/cycle-integrity/history")
async def get_cycle_integrity_history(limit: int = 50):
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch("""
            SELECT id, run_at, cycle_number, overall_status, action_taken, notes
            FROM cycle_integrity_log
            ORDER BY run_at DESC
            LIMIT $1
        """, limit)

    history = []
    for r in rows:
        d = dict(r)
        d["run_at"] = d["run_at"].isoformat()
        history.append(d)

    return {"success": True, "count": len(history), "history": history}


@app.get("/cycle-integrity/gates")
async def get_gate_definitions():
    return {
        "success": True,
        "gates": [
            {
                "name":        "trend_data_exists",
                "description": "Has the Trend Curation Agent collected enough trends/signals?",
                "threshold":   CIA_MIN_TRENDS,
                "unit":        "trends",
            },
            {
                "name":        "design_brief_ready",
                "description": "Has memory been processed into a usable design brief?",
                "threshold":   CIA_MIN_TRENDS,
                "unit":        "signals or explicit briefs",
            },
            {
                "name":        "designs_generated",
                "description": f"Have {CIA_MIN_DESIGNS} designs been generated for this cycle?",
                "threshold":   CIA_MIN_DESIGNS,
                "unit":        "designs",
            },
            {
                "name":        "vision_scoring_complete",
                "description": "Have enough designs been evaluated by the vision scorer?",
                "threshold":   CIA_MIN_SCORED_DESIGNS,
                "unit":        "scored designs",
            },
            {
                "name":        "showroom_published",
                "description": "Are designs from this cycle visible in the showroom?",
                "threshold":   CIA_MIN_SHOWROOM_ITEMS,
                "unit":        "showroom items",
            },
            {
                "name":        "voting_captured",
                "description": "Are user votes on this cycle's showroom items captured?",
                "threshold":   CIA_MIN_VOTES,
                "unit":        "votes",
            },
            {
                "name":        "feedback_captured",
                "description": "Are user interactions stored in memory for the next cycle?",
                "threshold":   CIA_MIN_FEEDBACK_ITEMS,
                "unit":        "memory entries or signals",
            },
        ],
        "thresholds": {
            "CIA_MIN_TRENDS":         CIA_MIN_TRENDS,
            "CIA_MIN_DESIGNS":        CIA_MIN_DESIGNS,
            "CIA_MIN_SCORED_DESIGNS": CIA_MIN_SCORED_DESIGNS,
            "CIA_MIN_SHOWROOM_ITEMS": CIA_MIN_SHOWROOM_ITEMS,
            "CIA_MIN_VOTES":          CIA_MIN_VOTES,
            "CIA_MIN_FEEDBACK_ITEMS": CIA_MIN_FEEDBACK_ITEMS,
        },
        "note": "Cycles are content-driven and identified by cycle_number (INTEGER). No date dependency.",
    }


# ──────────────────────────────────────────────
# FIX E: Agent status / health endpoint
# ──────────────────────────────────────────────
@app.get("/agents/status")
async def get_agents_status():
    """
    FIX E: Named agents with explicit status metrics.
    Returns the current health/status of each defined agent.
    """
    pool = await get_pool()
    async with pool.acquire() as conn:
        # Trend Curation Agent
        trend_count  = await conn.fetchval("SELECT COUNT(*) FROM trends")
        latest_trend = await conn.fetchrow("SELECT created_at FROM trends ORDER BY created_at DESC LIMIT 1")

        # Memory / RAG Agent
        memory_count  = await conn.fetchval("SELECT COUNT(*) FROM memory_entries")
        signal_count  = await conn.fetchval("SELECT COUNT(DISTINCT tag) FROM design_signals")
        latest_memory = await conn.fetchrow("SELECT created_at FROM memory_entries ORDER BY created_at DESC LIMIT 1")

        # Design Coordination Agent
        design_count  = await conn.fetchval("SELECT COUNT(*) FROM generated_designs WHERE status != 'rejected'")
        active_cycle  = await conn.fetchrow("SELECT cycle_number, started_at FROM design_cycles WHERE completed_at IS NULL ORDER BY cycle_number DESC LIMIT 1")

        # Cycle Integrity Agent
        latest_cia   = await conn.fetchrow("SELECT overall_status, action_taken, run_at FROM cycle_integrity_log ORDER BY run_at DESC LIMIT 1")

        # Feedback Loop Processor
        event_count  = await conn.fetchval("SELECT COUNT(*) FROM interaction_events WHERE created_at >= NOW() - INTERVAL '24 hours'")
        latest_event = await conn.fetchrow("SELECT created_at FROM interaction_events ORDER BY created_at DESC LIMIT 1")

        # GSNowGPT Orchestration
        chat_count_24h = await conn.fetchval("SELECT COUNT(*) FROM gsnowgpt_chat_log WHERE created_at >= NOW() - INTERVAL '24 hours'")
        latest_chat    = await conn.fetchrow("SELECT intent, created_at FROM gsnowgpt_chat_log ORDER BY created_at DESC LIMIT 1")

        # Query Agent (articles / retrieval)
        article_count  = await conn.fetchval("SELECT COUNT(*) FROM blog_articles")
        latest_article = await conn.fetchrow("SELECT created_at FROM blog_articles ORDER BY created_at DESC LIMIT 1")

    def iso(row, field="created_at"):
        if row and row.get(field):
            return row[field].isoformat()
        return None

    return {
        "success": True,
        "agents": {
            "gsnowgpt_orchestration": {
                **agent_registry.get_status("gsnowgpt_orchestration"),
                "trigger":         "api",
                "endpoint":        "POST /gpt/query",
                "status":          "active",
                "chats_last_24h":  int(chat_count_24h or 0),
                "last_intent":     latest_chat["intent"] if latest_chat else None,
                "last_activity":   iso(latest_chat),
            },
            "trend_curation": {
                **agent_registry.get_status("trend_curation"),
                "trigger":         "scheduler",
                "interval":        f"every {SCRAPE_INTERVAL_HOURS}h",
                "status":          "active",
                "trend_count":     int(trend_count or 0),
                "last_trend_at":   iso(latest_trend),
            },
            "query_retrieval": {
                **agent_registry.get_status("query_retrieval"),
                "trigger":         "api",
                "endpoint":        "GET /articles | /gpt/query (intent=retrieval)",
                "status":          "active",
                "article_count":   int(article_count or 0),
                "last_article_at": iso(latest_article),
            },
            "feedback_loop": {
                **agent_registry.get_status("feedback_loop"),
                "trigger":         "scheduler + event",
                "interval":        "every 6h + after CIA run",
                "status":          "active",
                "events_24h":      int(event_count or 0),
                "last_event_at":   iso(latest_event),
            },
            "memory_rag": {
                **agent_registry.get_status("memory_rag"),
                "trigger":         "event + api",
                "endpoint":        "POST /memory/store | /design-signals/sync-embeddings",
                "status":          "active",
                "memory_entries":  int(memory_count or 0),
                "signal_tags":     int(signal_count or 0),
                "last_memory_at":  iso(latest_memory),
            },
            "design_coordination": {
                **agent_registry.get_status("design_coordination"),
                "trigger":         "scheduler (CIA)",
                "status":          "active",
                "designs_total":   int(design_count or 0),
                "active_cycle":    active_cycle["cycle_number"] if active_cycle else None,
                "cycle_started":   iso(active_cycle) if active_cycle else None,
            },
            "cycle_integrity": {
                **agent_registry.get_status("cycle_integrity"),
                "trigger":         "scheduler",
                "interval":        "every 1h",
                "status":          "active",
                "last_status":     latest_cia["overall_status"] if latest_cia else None,
                "last_action":     latest_cia["action_taken"]   if latest_cia else None,
                "last_run_at":     iso(latest_cia, "run_at")    if latest_cia else None,
            },
            "proxy_voting": {
                **agent_registry.get_status("proxy_voting"),
                "trigger":         "scheduler",
                "interval":        "every 24h",
                "status":          "active",
            },
        },
        "event_types_supported": sorted(VALID_EVENT_TYPES),
        "intent_routes":         list(INTENT_ROUTING.keys()),
        "premium_intent_features": PREMIUM_INTENT_FEATURES,
    }

# ──────────────────────────────────────────────
# MVP: Admin export endpoint — GET /admin/export-users
# ──────────────────────────────────────────────
@app.get("/admin/export-users")
async def export_users(
    request: Request,
    authorization: Optional[str] = Header(None),
    format: str = "json",
):
    """
    MVP Technical Specification: Admin CSV/JSON export of users for marketing.
    Requires admin access. Rate limited.
    """
    payload = await require_admin(authorization)
    user_id = int(payload["sub"])

    if not check_rate_limit(request, "/admin/export-users", max_requests=10):
        pool = await get_pool()
        await log_admin_action(pool, user_id, "rate_limit_exceeded", "/admin/export-users", "Too many requests")
        raise HTTPException(status_code=429, detail="Rate limit exceeded.")

    pool = await get_pool()
    await log_admin_action(pool, user_id, "export_users", "/admin/export-users", f"format={format}")

    async with pool.acquire() as conn:
        rows = await conn.fetch("""
            SELECT
                u.id, u.first_name, u.last_name, u.email,
                u.is_admin, u.email_verified, u.created_at,
                us.plan_name AS subscription_plan,
                us.status    AS subscription_status,
                us.ends_at   AS subscription_ends_at,
                (SELECT COUNT(*) FROM item_votes iv WHERE iv.user_id = u.id)       AS votes_cast,
                (SELECT COUNT(*) FROM article_comments ac WHERE ac.user_id = u.id) AS comments_made,
                (SELECT COUNT(*) FROM article_likes al WHERE al.user_id = u.id)    AS articles_liked
            FROM users u
            LEFT JOIN LATERAL (
                SELECT plan_name, status, ends_at
                FROM user_subscriptions
                WHERE user_id = u.id AND status = 'active'
                ORDER BY created_at DESC LIMIT 1
            ) us ON TRUE
            ORDER BY u.created_at DESC
        """)

    users = []
    for r in rows:
        d = dict(r)
        for f in ("created_at", "subscription_ends_at"):
            if d.get(f):
                d[f] = d[f].isoformat()
        users.append(d)

    if format.lower() == "csv":
        import io, csv as csv_mod
        from fastapi.responses import StreamingResponse
        output = io.StringIO()
        if users:
            writer = csv_mod.DictWriter(output, fieldnames=users[0].keys())
            writer.writeheader()
            writer.writerows(users)
        output.seek(0)
        return StreamingResponse(
            iter([output.getvalue()]),
            media_type="text/csv",
            headers={"Content-Disposition": "attachment; filename=gia-users-export.csv"},
        )

    return {"success": True, "count": len(users), "users": users}


# ──────────────────────────────────────────────
# Health check endpoint
# ──────────────────────────────────────────────
@app.get("/health")
async def health():
    """Simple health check — confirms DB pool is alive."""
    try:
        pool = await get_pool()
        async with pool.acquire() as conn:
            await conn.fetchval("SELECT 1")
        return {"status": "ok", "db": "connected"}
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"DB connection failed: {e}")






# import os
# import sys
# import asyncio
# import threading
# import re
# import string
# import xml.etree.ElementTree as ET
# from datetime import datetime, timedelta
# from dotenv import load_dotenv
# from fastapi import FastAPI, HTTPException, Header, Request
# import asyncpg
# import httpx
# from apscheduler.schedulers.asyncio import AsyncIOScheduler
# from fastapi.middleware.cors import CORSMiddleware

# from playwright.async_api import async_playwright
# from typing import List, Dict, Any, Set, Optional
# from pydantic import BaseModel
# from passlib.context import CryptContext
# from jose import JWTError, jwt
# import secrets
# from urllib.parse import urljoin, urlparse
# import random
# import json
# import math
# import stripe
# from datetime import timezone

# # ── Email / OTP imports ────────────────────────────────────────────────────────
# import smtplib
# import ssl
# from email.mime.text import MIMEText
# from email.mime.multipart import MIMEMultipart

# load_dotenv(override=True)
# print("[BOOT] .env loaded")

# from design_agent import run_design_agent, mark_cycle_complete, get_current_cycle_number

# POSTGRESQL_URI        = os.getenv("POSTGRESQL_URI")
# OPENAI_API_KEY        = os.getenv("OPENAI_API_KEY")
# PEXELS_API_KEY        = os.getenv("PEXELS_API_KEY")
# SCRAPE_INTERVAL_HOURS = int(os.getenv("SCRAPE_INTERVAL_HOURS", 1))
# MIN_SOURCE_ARTICLES   = int(os.getenv("MIN_SOURCE_ARTICLES",   1))
# MAX_PER_SOURCE        = int(os.getenv("MAX_PER_SOURCE",        1))
# CANDIDATE_LIMIT       = int(os.getenv("CANDIDATE_LIMIT",       40))
# MAX_SCRAPE_RETRIES    = int(os.getenv("MAX_SCRAPE_RETRIES",     5))
# RETRY_DELAY_SECONDS   = int(os.getenv("RETRY_DELAY_SECONDS",  30))
# URL_REUSE_DAYS        = int(os.getenv("URL_REUSE_DAYS",        7))

# CIA_MIN_TRENDS          = int(os.getenv("CIA_MIN_TRENDS",          3))
# CIA_MIN_DESIGNS         = int(os.getenv("CIA_MIN_DESIGNS",        150))
# CIA_MIN_SCORED_DESIGNS  = int(os.getenv("CIA_MIN_SCORED_DESIGNS", 100))
# CIA_MIN_SHOWROOM_ITEMS  = int(os.getenv("CIA_MIN_SHOWROOM_ITEMS",   1))
# CIA_MIN_VOTES           = int(os.getenv("CIA_MIN_VOTES",            1))
# CIA_MIN_FEEDBACK_ITEMS  = int(os.getenv("CIA_MIN_FEEDBACK_ITEMS",   1))

# JWT_SECRET      = os.getenv("JWT_SECRET", secrets.token_hex(32))
# JWT_ALGORITHM   = "HS256"
# JWT_EXPIRE_DAYS = int(os.getenv("JWT_EXPIRE_DAYS", 7))

# # ── Proxy voting scheduling policy ─────────────────────────────────────────────
# PROXY_VOTE_INTERVAL_HOURS = int(os.getenv("PROXY_VOTE_INTERVAL_HOURS", 24))
# PROXY_VOTE_INTERVAL_MINUTES = int(os.getenv("PROXY_VOTE_INTERVAL_MINUTES", PROXY_VOTE_INTERVAL_HOURS * 60))

# STRIPE_SECRET_KEY     = os.getenv("STRIPE_SECRET_KEY")
# STRIPE_WEBHOOK_SECRET = os.getenv("STRIPE_WEBHOOK_SECRET")
# STRIPE_PRICE_PREMIUM_MONTHLY = os.getenv("STRIPE_PRICE_PREMIUM_MONTHLY")  # Optional default Stripe Price ID
# FREE_DEMO_MODE        = os.getenv("FREE_DEMO_MODE", "false").lower() == "true"  # Demo mode: premium features free
# # FRONTEND_URL          = os.getenv("FRONTEND_URL", "https://giamvpv1.infinityquantumsolutions.com")
# FRONTEND_URL          = os.getenv("FRONTEND_URL", "http://localhost:5173")

# # ── CORS configuration (environment-specific allowed origins) ──────────────────
# ALLOWED_ORIGINS = os.getenv("ALLOWED_ORIGINS", FRONTEND_URL).split(",")
# ALLOWED_ORIGINS = [origin.strip() for origin in ALLOWED_ORIGINS if origin.strip()]
# if not ALLOWED_ORIGINS:
#     ALLOWED_ORIGINS = [FRONTEND_URL]

# # ── Admin bootstrap secret (from environment ONLY — never hardcoded) ──────────
# ADMIN_BOOTSTRAP_SECRET = os.getenv("ADMIN_BOOTSTRAP_SECRET")
# if not ADMIN_BOOTSTRAP_SECRET:
#     print("⚠️  ADMIN_BOOTSTRAP_SECRET not set — admin bootstrap is DISABLED. Set this in .env to use the bootstrap script.")

# # ── GSNowGPT free-tier daily message limit ────────────────────────────────────
# GPT_FREE_DAILY_LIMIT = int(os.getenv("GPT_FREE_DAILY_LIMIT", 10))   # Free users: N msgs/day
# GPT_PAID_HOURLY_LIMIT = int(os.getenv("GPT_PAID_HOURLY_LIMIT", 200)) # Paid users: effectively unlimited
# RATE_LIMIT_REQUESTS = {}  # In-memory rate limit tracking: {(ip, endpoint): [timestamps]}
# RATE_LIMIT_WINDOW_SECONDS = 3600  # 1 hour window
# RATE_LIMIT_MAX_REQUESTS = 5  # Max 5 requests per endpoint per hour

# # ── Gmail / OTP config ─────────────────────────────────────────────────────────
# GMAIL_SENDER_EMAIL    = os.getenv("GMAIL_SENDER_EMAIL")
# GMAIL_APP_PASSWORD    = os.getenv("GMAIL_APP_PASSWORD")
# OTP_EXPIRE_MINUTES    = int(os.getenv("OTP_EXPIRE_MINUTES", 10))
# REQUIRE_EMAIL_VERIFICATION = os.getenv("REQUIRE_EMAIL_VERIFICATION", "true").lower() == "true"

# if not GMAIL_SENDER_EMAIL or not GMAIL_APP_PASSWORD:
#     print("⚠️  GMAIL_SENDER_EMAIL / GMAIL_APP_PASSWORD not set — email OTP will fail!")

# if not STRIPE_SECRET_KEY:
#     print("⚠️ STRIPE_SECRET_KEY is not set in .env — Stripe payments will fail!")

# stripe.api_key = STRIPE_SECRET_KEY

# # MVP – Stripe and secrets (Item 4): Production-safe secret handling
# # CRITICAL: Key rotation policy – rotate Stripe keys quarterly via ADMIN_BOOTSTRAP_SECRET management
# # TODO: Implement vault integration (e.g., HashiCorp Vault, AWS Secrets Manager) for production
# if STRIPE_SECRET_KEY:
#     env_mode = os.getenv('ENVIRONMENT', 'development').lower()
#     if STRIPE_SECRET_KEY.startswith("sk_test_"):
#         if env_mode == 'production':
#             raise RuntimeError(
#                 "[FATAL] Test Stripe key (sk_test_*) detected in PRODUCTION environment. "
#                 "Set STRIPE_SECRET_KEY to a valid sk_live_* key immediately."
#             )
#         print("⚠️  STRIPE_SECRET_KEY is a TEST key — payments will not charge real cards.")
#     elif STRIPE_SECRET_KEY.startswith("sk_live_"):
#         print("✅ STRIPE_SECRET_KEY is a LIVE key — real payments enabled. [Key rotation: quarterly]")
#     else:
#         print("⚠️  STRIPE_SECRET_KEY format unrecognised — verify before going live.")
#     # NOTE: For PCI compliance, never log or transmit full key. Key is only used locally.
# else:
#     if os.getenv('ENVIRONMENT', 'development').lower() == 'production' and not FREE_DEMO_MODE:
#         raise RuntimeError("[FATAL] STRIPE_SECRET_KEY is REQUIRED in production environment (unless FREE_DEMO_MODE=true).")

# pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# print(f"""
# [BOOT] Configuration:
#   POSTGRESQL_URI        = {'SET ✓' if POSTGRESQL_URI else 'MISSING ✗'}
#   SCRAPE_INTERVAL_HOURS = {SCRAPE_INTERVAL_HOURS}
#   MIN_SOURCE_ARTICLES   = {MIN_SOURCE_ARTICLES}
#   MAX_PER_SOURCE        = {MAX_PER_SOURCE}
#   CANDIDATE_LIMIT       = {CANDIDATE_LIMIT}
#   MAX_SCRAPE_RETRIES    = {MAX_SCRAPE_RETRIES}
#   RETRY_DELAY_SECONDS   = {RETRY_DELAY_SECONDS}
#   URL_REUSE_DAYS        = {URL_REUSE_DAYS}
#   OPENAI_API_KEY        = {'SET ✓' if OPENAI_API_KEY else 'MISSING ✗'}
#   PEXELS_API_KEY        = {'SET ✓' if PEXELS_API_KEY else 'MISSING ✗'}
#   JWT_SECRET            = {'SET ✓' if os.getenv('JWT_SECRET') else 'AUTO-GENERATED (set in .env for persistence)'}
#   GMAIL_SENDER_EMAIL    = {'SET ✓' if GMAIL_SENDER_EMAIL else 'MISSING ✗'}
#   GMAIL_APP_PASSWORD    = {'SET ✓' if GMAIL_APP_PASSWORD else 'MISSING ✗'}
#   OTP_EXPIRE_MINUTES    = {OTP_EXPIRE_MINUTES}
#   REQUIRE_EMAIL_VERIFICATION = {REQUIRE_EMAIL_VERIFICATION}
#   CIA_MIN_TRENDS        = {CIA_MIN_TRENDS}
#   CIA_MIN_DESIGNS       = {CIA_MIN_DESIGNS}
#   CIA_MIN_SCORED_DESIGNS= {CIA_MIN_SCORED_DESIGNS}
#   CIA_MIN_SHOWROOM_ITEMS= {CIA_MIN_SHOWROOM_ITEMS}
#   CIA_MIN_VOTES         = {CIA_MIN_VOTES}
#   CIA_MIN_FEEDBACK_ITEMS= {CIA_MIN_FEEDBACK_ITEMS}
#   GPT_FREE_DAILY_LIMIT  = {GPT_FREE_DAILY_LIMIT}
#   GPT_PAID_HOURLY_LIMIT = {GPT_PAID_HOURLY_LIMIT}
#   FREE_DEMO_MODE        = {FREE_DEMO_MODE}
#   STRIPE_PRICE_PREMIUM_MONTHLY = {'SET ✓' if STRIPE_PRICE_PREMIUM_MONTHLY else 'NOT SET'}
#   REQUIRE_EMAIL_VERIFICATION = {REQUIRE_EMAIL_VERIFICATION}  {"[ENFORCED]" if REQUIRE_EMAIL_VERIFICATION else "[DISABLED - set REQUIRE_EMAIL_VERIFICATION=true in .env for production]"}
#   Python version        = {sys.version}
#   Platform              = {sys.platform}
# """)


# # ──────────────────────────────────────────────
# # GSNowGPT Intent Routing and Premium Features
# # ──────────────────────────────────────────────
# VALID_EVENT_TYPES = {
#     "paid_feature_use", "blog_comment", "vote_cast", "blog_like", "save_look", "chat_query", "design_view"
# }

# INTENT_ROUTING = {
#     "trend_summary":     "trend_agent",
#     "styling":           "style_agent",
#     "collection_summary": "collection_agent",
#     "saved_looks":       "user_prefs_agent",
#     "proxy_status":      "proxy_agent",
#     "account_summary":   "account_agent",
#     "account_action":    "account_agent",
#     "retrieval":         "query_agent",
#     "premium_styling":   "premium_style_agent",
#     "premium_trends":    "premium_trend_agent",
#     "premium_collection": "premium_collection_agent",
# }

# PREMIUM_INTENT_FEATURES = {
#     "premium_styling": "Advanced AI styling with custom parameters",
#     "premium_trends": "Exclusive trend insights and forecasts",
#     "premium_collection": "Curated premium design collections",
# }


# # ──────────────────────────────────────────────
# # Agent Registry and Execution
# # ──────────────────────────────────────────────
# class AgentRegistry:
#     def __init__(self):
#         self.agents = {}

#     def register(self, name, triggers, handler):
#         self.agents[name] = {
#             'triggers': set(triggers),
#             'handler': handler,
#             'count': 0,
#             'last_result': None,
#             'last_run': None,
#         }

#     async def execute_agent_contract(self, name, trigger, *args, **kwargs):
#         if name not in self.agents:
#             raise ValueError(f"Agent {name} not registered")
#         if trigger not in self.agents[name]['triggers']:
#             raise ValueError(f"Trigger {trigger} not allowed for agent {name}")
        
#         result = await self.agents[name]['handler'](*args, **kwargs)
#         self.agents[name]['count'] += 1
#         self.agents[name]['last_result'] = result
#         self.agents[name]['last_run'] = datetime.now(timezone.utc)
#         return result

#     def get_status(self, name):
#         return self.agents.get(name, {})


# # Instantiate registry
# agent_registry = AgentRegistry()


# # ──────────────────────────────────────────────
# # Forum handle generator
# # ──────────────────────────────────────────────
# def _generate_forum_handle() -> str:
#     adjectives = [
#         "artistic", "silent", "cosmic", "velvet", "rustic", "minimal", "pastel", "wild",
#         "lazy", "classic", "edgy", "sleek", "bold", "muted", "retro", "golden", "crisp",
#         "urban", "subtle", "sharp", "raw", "clean", "dark", "bright", "soft", "neon",
#         "dusty", "cool", "quiet", "vivid", "sleepy", "local", "vintage", "honest",
#     ]
#     nouns = [
#         "deer", "wolf", "crow", "moth", "fox", "sparrow", "oak", "reef", "stone", "tide",
#         "dust", "leaf", "peak", "grove", "cliff", "bloom", "dusk", "mist", "ray", "vale",
#         "mode", "look", "drip", "fit", "vibe", "eye", "lens", "cut", "line", "thread",
#         "coat", "heel", "seam", "knit", "weave", "stitch", "drape", "fold", "hem",
#     ]
#     patterns = [
#         lambda: f"{random.choice(adjectives)}{random.choice(nouns)}{random.randint(1, 999)}",
#         lambda: f"{random.choice(nouns)}_{random.choice(adjectives)}{random.randint(10, 99)}",
#         lambda: "".join(random.choices(string.ascii_lowercase, k=random.randint(3, 5))) + f"{random.randint(0, 99):02d}",
#         lambda: f"{random.choice(adjectives)}_{random.choice(nouns)}",
#         lambda: f"x_{random.choice(nouns)}_{random.choice(adjectives)[:4]}x",
#         lambda: f"throwaway_{random.choice(nouns)}{random.randint(10, 999)}",
#         lambda: f"{random.choice(adjectives)}{random.randint(1000, 9999)}",
#         lambda: f"{random.choice(nouns)}.{random.choice(adjectives)}",
#         lambda: f"_{random.choice(adjectives)}{random.choice(nouns)}_",
#         lambda: "".join(random.choices(string.ascii_lowercase, k=random.randint(4, 7))),
#     ]
#     return random.choice(patterns)()


# # ──────────────────────────────────────────────
# # FastAPI + PostgreSQL connection pool
# # ──────────────────────────────────────────────
# app = FastAPI(title="GIA AI Blog Backend")

# # CORS hardening (Security A): Restrict to minimal required methods and headers
# app.add_middleware(
#     CORSMiddleware,
#     allow_origins=ALLOWED_ORIGINS,
#     allow_credentials=True,
#     # Allow only GET, POST, OPTIONS. PUT/PATCH/DELETE are admin-only and stricter auth applies.
#     allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
#     # Allow only essential headers; no X-Requested-With (not needed for JSON APIs)
#     allow_headers=["Authorization", "Content-Type"],
#     expose_headers=["Content-Length", "X-Upgrade-Required", "X-RateLimit-Remaining"],
#     max_age=3600,
# )

# # Register agents
# async def dummy_trend_agent():
#     return {"message": "Trends scraped"}

# async def dummy_style_agent():
#     return {"message": "Style generated"}

# async def dummy_collection_agent():
#     return {"message": "Collection summarized"}

# async def dummy_user_prefs_agent():
#     return {"message": "User prefs handled"}

# async def dummy_proxy_agent():
#     return {"message": "Proxy status"}

# async def dummy_account_agent():
#     return {"message": "Account action"}

# async def dummy_query_agent():
#     return {"message": "Query retrieved"}

# async def dummy_feedback_agent():
#     return {"message": "Feedback processed"}

# async def dummy_memory_agent():
#     return {"message": "Memory updated"}

# async def dummy_design_agent():
#     return {"message": "Design coordinated"}

# async def dummy_cia_agent():
#     return {"message": "Integrity checked"}

# agent_registry.register("trend_curation", ["scheduler"], dummy_trend_agent)
# agent_registry.register("query_retrieval", ["api"], dummy_query_agent)
# agent_registry.register("feedback_loop", ["scheduler", "event"], dummy_feedback_agent)
# agent_registry.register("memory_rag", ["event", "api"], dummy_memory_agent)
# agent_registry.register("design_coordination", ["scheduler"], dummy_design_agent)
# agent_registry.register("cycle_integrity", ["scheduler"], dummy_cia_agent)
# agent_registry.register("gsnowgpt_orchestration", ["api"], dummy_query_agent)  # placeholder
# agent_registry.register("proxy_voting", ["scheduler"], dummy_proxy_agent)

# _pool: asyncpg.Pool = None


# async def get_pool() -> asyncpg.Pool:
#     global _pool
#     if _pool is None:
#         raise RuntimeError("Database pool not initialized")
#     return _pool


# async def init_db(pool: asyncpg.Pool):
#     """Create all tables, indexes, and seed data."""
#     async with pool.acquire() as conn:

#         await conn.execute("""
#             CREATE TABLE IF NOT EXISTS blog_articles (
#                 id           BIGSERIAL PRIMARY KEY,
#                 slug         TEXT UNIQUE NOT NULL,
#                 title        TEXT NOT NULL,
#                 excerpt      TEXT,
#                 body         TEXT,
#                 image_url    TEXT,
#                 tags         JSONB DEFAULT '[]',
#                 trends       JSONB DEFAULT '[]',
#                 article_urls JSONB DEFAULT '[]',
#                 sources      JSONB DEFAULT '[]',
#                 created_at   TIMESTAMPTZ DEFAULT NOW()
#             );

#             CREATE TABLE IF NOT EXISTS trends (
#                 id              BIGSERIAL PRIMARY KEY,
#                 title           TEXT NOT NULL,
#                 description     TEXT,
#                 related_tags    JSONB DEFAULT '[]',
#                 source_articles JSONB DEFAULT '[]',
#                 created_at      TIMESTAMPTZ DEFAULT NOW()
#             );

#             CREATE TABLE IF NOT EXISTS memory_entries (
#                 id         BIGSERIAL PRIMARY KEY,
#                 type       TEXT NOT NULL,
#                 content    TEXT NOT NULL,
#                 payload    JSONB DEFAULT '{}',
#                 embedding  JSONB DEFAULT '[]',
#                 created_at TIMESTAMPTZ DEFAULT NOW()
#             );

#             CREATE TABLE IF NOT EXISTS scraped_urls (
#                 id           BIGSERIAL PRIMARY KEY,
#                 url          TEXT UNIQUE NOT NULL,
#                 last_scraped TIMESTAMPTZ DEFAULT NOW()
#             );

#             CREATE TABLE IF NOT EXISTS users (
#                 id            BIGSERIAL PRIMARY KEY,
#                 first_name    TEXT NOT NULL,
#                 last_name     TEXT NOT NULL,
#                 email         TEXT UNIQUE NOT NULL,
#                 password_hash TEXT NOT NULL,
#                 is_admin      BOOLEAN DEFAULT FALSE,
#                 email_verified BOOLEAN DEFAULT FALSE,
#                 created_at    TIMESTAMPTZ DEFAULT NOW()
#             );

#             CREATE TABLE IF NOT EXISTS article_comments (
#                 id         BIGSERIAL PRIMARY KEY,
#                 article_id BIGINT NOT NULL REFERENCES blog_articles(id) ON DELETE CASCADE,
#                 user_id    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
#                 text       TEXT NOT NULL,
#                 created_at TIMESTAMPTZ DEFAULT NOW()
#             );

#             CREATE TABLE IF NOT EXISTS article_likes (
#                 id         BIGSERIAL PRIMARY KEY,
#                 article_id BIGINT NOT NULL,
#                 user_id    BIGINT NOT NULL,
#                 created_at TIMESTAMPTZ DEFAULT NOW(),
#                 UNIQUE(article_id, user_id)
#             );

#             CREATE TABLE IF NOT EXISTS user_proxy_settings (
#                 user_id      BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
#                 enabled      BOOLEAN DEFAULT FALSE,
#                 next_run_at  TIMESTAMPTZ,
#                 last_run_at  TIMESTAMPTZ,
#                 updated_at   TIMESTAMPTZ DEFAULT NOW()
#             );

#             CREATE TABLE IF NOT EXISTS admin_audit_log (
#                 id          BIGSERIAL PRIMARY KEY,
#                 user_id     BIGINT REFERENCES users(id) ON DELETE SET NULL,
#                 action      TEXT NOT NULL,
#                 endpoint    TEXT NOT NULL,
#                 details     TEXT,
#                 created_at  TIMESTAMPTZ DEFAULT NOW()
#             );
#             CREATE INDEX IF NOT EXISTS idx_admin_audit_log_user_id ON admin_audit_log(user_id);
#             CREATE INDEX IF NOT EXISTS idx_admin_audit_log_created_at ON admin_audit_log(created_at DESC);

#             CREATE TABLE IF NOT EXISTS proxy_preferences (
#                 user_id                         BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
#                 aesthetic_minimalist_weight     FLOAT DEFAULT 50.0,
#                 aesthetic_bold_weight           FLOAT DEFAULT 50.0,
#                 aesthetic_eclectic_weight       FLOAT DEFAULT 50.0,
#                 material_luxury_weight          FLOAT DEFAULT 50.0,
#                 material_sustainable_weight     FLOAT DEFAULT 50.0,
#                 material_experimental_weight    FLOAT DEFAULT 50.0,
#                 silhouette_fitted_weight        FLOAT DEFAULT 50.0,
#                 silhouette_relaxed_weight       FLOAT DEFAULT 50.0,
#                 silhouette_structured_weight    FLOAT DEFAULT 50.0,
#                 design_classic_weight           FLOAT DEFAULT 50.0,
#                 design_trendy_weight            FLOAT DEFAULT 50.0,
#                 design_avant_garde_weight       FLOAT DEFAULT 50.0,
#                 category_apparel_weight         FLOAT DEFAULT 50.0,
#                 category_accessories_weight     FLOAT DEFAULT 50.0,
#                 category_footwear_weight        FLOAT DEFAULT 50.0,
#                 category_jewelry_weight         FLOAT DEFAULT 50.0,
#                 updated_at                      TIMESTAMPTZ DEFAULT NOW()
#             );

#             CREATE TABLE IF NOT EXISTS proxy_vote_explanations (
#                 id                              BIGSERIAL PRIMARY KEY,
#                 vote_id                         BIGINT REFERENCES item_votes(id) ON DELETE CASCADE,
#                 product_id                      TEXT NOT NULL,
#                 user_id                         BIGINT REFERENCES users(id) ON DELETE CASCADE,
#                 preference_score                FLOAT,
#                 history_score                   FLOAT,
#                 combined_score                  FLOAT,
#                 matched_preferences             TEXT[],
#                 matched_tags                    TEXT[],
#                 boosted_by                      TEXT[],
#                 penalty_applied                 TEXT,
#                 tie_break_reason                TEXT,
#                 score_computation_method        TEXT,
#                 -- FIX F: persist full explanation JSON for audit
#                 full_explanation_json           JSONB DEFAULT '{}',
#                 created_at                      TIMESTAMPTZ DEFAULT NOW()
#             );
#             CREATE INDEX IF NOT EXISTS idx_proxy_vote_explanations_user_id ON proxy_vote_explanations(user_id);
#             CREATE INDEX IF NOT EXISTS idx_proxy_vote_explanations_vote_id ON proxy_vote_explanations(vote_id);
#             CREATE INDEX IF NOT EXISTS idx_proxy_vote_explanations_created_at ON proxy_vote_explanations(created_at DESC);

#             CREATE TABLE IF NOT EXISTS product_catalog (
#                 item_id       TEXT PRIMARY KEY,
#                 name          TEXT NOT NULL,
#                 description   TEXT,
#                 price         TEXT,
#                 category      TEXT,
#                 tags          JSONB DEFAULT '[]',
#                 is_active     BOOLEAN DEFAULT TRUE,
#                 collection_id BIGINT,
#                 created_at    TIMESTAMPTZ DEFAULT NOW()
#             );

#             CREATE TABLE IF NOT EXISTS item_votes (
#                 id         BIGSERIAL PRIMARY KEY,
#                 item_id    TEXT NOT NULL,
#                 user_id    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
#                 created_at TIMESTAMPTZ DEFAULT NOW(),
#                 UNIQUE(item_id, user_id)
#             );

#             -- FIX F: Add vote_explanation JSONB column for proxy vote explanations
#             ALTER TABLE item_votes ADD COLUMN IF NOT EXISTS vote_explanation JSONB DEFAULT '{}';

#             CREATE TABLE IF NOT EXISTS design_signals (
#                 id              BIGSERIAL PRIMARY KEY,
#                 tag             TEXT NOT NULL UNIQUE,
#                 category        TEXT,
#                 vote_score      INT DEFAULT 0,
#                 like_score      INT DEFAULT 0,
#                 comment_score   INT DEFAULT 0,
#                 trend_score     INT DEFAULT 0,
#                 total_score     INT DEFAULT 0,
#                 computed_at     TIMESTAMPTZ DEFAULT NOW()
#             );

#             CREATE TABLE IF NOT EXISTS design_cycles (
#                 cycle_number  INT PRIMARY KEY,
#                 started_at    TIMESTAMPTZ DEFAULT NOW(),
#                 completed_at  TIMESTAMPTZ
#             );

#             CREATE TABLE IF NOT EXISTS generated_designs (
#                 id              BIGSERIAL PRIMARY KEY,
#                 cycle_number    INT NOT NULL DEFAULT 1,
#                 prompt_used     TEXT NOT NULL,
#                 brief_json      JSONB DEFAULT '{}',
#                 image_url       TEXT,
#                 model_url       TEXT,
#                 score_json      JSONB DEFAULT '{}',
#                 publishable     BOOLEAN DEFAULT FALSE,
#                 published_at    TIMESTAMPTZ,
#                 top_tags        JSONB DEFAULT '[]',
#                 status          TEXT DEFAULT 'pending',
#                 created_at      TIMESTAMPTZ DEFAULT NOW()
#             );

#             CREATE TABLE IF NOT EXISTS showroom (
#                 id              BIGSERIAL PRIMARY KEY,
#                 design_id       BIGINT NOT NULL REFERENCES generated_designs(id) ON DELETE CASCADE,
#                 title           TEXT NOT NULL,
#                 description     TEXT,
#                 image_url       TEXT NOT NULL,
#                 model_url       TEXT,
#                 tags            JSONB DEFAULT '[]',
#                 vision_score    FLOAT,
#                 likes           INT DEFAULT 0,
#                 created_at      TIMESTAMPTZ DEFAULT NOW()
#             );

#             CREATE TABLE IF NOT EXISTS cycle_integrity_log (
#                 id              BIGSERIAL PRIMARY KEY,
#                 run_at          TIMESTAMPTZ DEFAULT NOW(),
#                 cycle_number    INT NOT NULL DEFAULT 1,
#                 gate_results    JSONB DEFAULT '{}',
#                 overall_status  TEXT NOT NULL,
#                 action_taken    TEXT,
#                 notes           TEXT
#             );
#         """)

#         # ── OTP pending registrations table ────────────────────────────────────
#         await conn.execute("""
#             CREATE TABLE IF NOT EXISTS email_otps (
#                 id           BIGSERIAL PRIMARY KEY,
#                 email        TEXT NOT NULL,
#                 otp_code     TEXT NOT NULL,
#                 first_name   TEXT NOT NULL,
#                 last_name    TEXT NOT NULL,
#                 password_hash TEXT NOT NULL,
#                 expires_at   TIMESTAMPTZ NOT NULL,
#                 used         BOOLEAN DEFAULT FALSE,
#                 created_at   TIMESTAMPTZ DEFAULT NOW()
#             );
#             CREATE INDEX IF NOT EXISTS idx_email_otps_email      ON email_otps(email);
#             CREATE INDEX IF NOT EXISTS idx_email_otps_expires_at ON email_otps(expires_at);
#         """)

#         await conn.execute("""
#             CREATE TABLE IF NOT EXISTS user_subscriptions (
#                 id                     BIGSERIAL PRIMARY KEY,
#                 user_id                BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
#                 stripe_session_id      TEXT UNIQUE NOT NULL,
#                 stripe_subscription_id TEXT UNIQUE,
#                 plan_name              TEXT,
#                 status                 TEXT DEFAULT 'active',
#                 started_at             TIMESTAMPTZ,
#                 ends_at                TIMESTAMPTZ,
#                 created_at             TIMESTAMPTZ DEFAULT NOW(),
#                 updated_at             TIMESTAMPTZ DEFAULT NOW()
#             );
#         """)

#         await conn.execute("ALTER TABLE user_subscriptions ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ;")
#         await conn.execute("ALTER TABLE user_subscriptions ADD COLUMN IF NOT EXISTS ends_at TIMESTAMPTZ;")
#         # FIX B: Ensure is_active exists on product_catalog for active-item enforcement
#         await conn.execute("ALTER TABLE product_catalog ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;")
#         # FIX B: Ensure collection_id exists on product_catalog
#         await conn.execute("ALTER TABLE product_catalog ADD COLUMN IF NOT EXISTS collection_id BIGINT;")
#         # Account lifecycle: email_verified column
#         await conn.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT FALSE;")

#         await conn.execute("""
#             CREATE TABLE IF NOT EXISTS ai_comments (
#                 id         BIGSERIAL PRIMARY KEY,
#                 article_id BIGINT NOT NULL REFERENCES blog_articles(id) ON DELETE CASCADE,
#                 user_name  TEXT NOT NULL,
#                 text       TEXT NOT NULL,
#                 time_label TEXT NOT NULL,
#                 created_at TIMESTAMPTZ DEFAULT NOW(),
#                 UNIQUE(article_id, user_name, text)
#             )
#         """)

#         await conn.execute("""
#             CREATE TABLE IF NOT EXISTS user_collections (
#                 id         BIGSERIAL PRIMARY KEY,
#                 user_id    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
#                 item_id    TEXT NOT NULL,
#                 added_at   TIMESTAMPTZ DEFAULT NOW(),
#                 UNIQUE(user_id, item_id)
#             );
#         """)

#         await conn.execute("""
#             CREATE TABLE IF NOT EXISTS source_rotation_state (
#                 id               INT PRIMARY KEY DEFAULT 1,
#                 last_used_source TEXT,
#                 updated_at       TIMESTAMPTZ DEFAULT NOW(),
#                 CONSTRAINT single_row CHECK (id = 1)
#             );
#         """)

#         await conn.execute("""
#             INSERT INTO source_rotation_state (id, last_used_source, updated_at)
#             VALUES (1, NULL, NOW())
#             ON CONFLICT (id) DO NOTHING;
#         """)

#         # ── FIX B: Collections table (collection-driven domain) ────────────────
#         await conn.execute("""
#             CREATE TABLE IF NOT EXISTS collections (
#                 id           BIGSERIAL PRIMARY KEY,
#                 name         TEXT NOT NULL,
#                 description  TEXT,
#                 lifecycle    TEXT NOT NULL DEFAULT 'draft',
#                 cycle_number INT,
#                 created_at   TIMESTAMPTZ DEFAULT NOW(),
#                 published_at TIMESTAMPTZ,
#                 archived_at  TIMESTAMPTZ
#             );
#             CREATE INDEX IF NOT EXISTS idx_collections_lifecycle ON collections(lifecycle);
#             CREATE INDEX IF NOT EXISTS idx_collections_cycle_number ON collections(cycle_number);
#         """)

#         await conn.execute("""
#             ALTER TABLE generated_designs ADD COLUMN IF NOT EXISTS collection_id BIGINT REFERENCES collections(id);
#             ALTER TABLE showroom          ADD COLUMN IF NOT EXISTS collection_id BIGINT REFERENCES collections(id);
#         """)

#         # ── FIX C: Canonical interaction events table ──────────────────────────
#         await conn.execute("""
#             CREATE TABLE IF NOT EXISTS interaction_events (
#                 id           BIGSERIAL PRIMARY KEY,
#                 event_type   TEXT NOT NULL,
#                 user_id      BIGINT REFERENCES users(id) ON DELETE SET NULL,
#                 entity_id    TEXT,
#                 entity_type  TEXT,
#                 payload      JSONB DEFAULT '{}',
#                 processed_at TIMESTAMPTZ,   -- NULL = unprocessed; set by feedback loop
#                 created_at   TIMESTAMPTZ DEFAULT NOW()
#             );
#             CREATE INDEX IF NOT EXISTS idx_interaction_events_type         ON interaction_events(event_type);
#             CREATE INDEX IF NOT EXISTS idx_interaction_events_created_at   ON interaction_events(created_at DESC);
#             CREATE INDEX IF NOT EXISTS idx_interaction_events_user_id      ON interaction_events(user_id);
#             CREATE INDEX IF NOT EXISTS idx_interaction_events_processed_at ON interaction_events(processed_at);
#         """)

#         # ── FIX A: GSNowGPT chat events log ───────────────────────────────────
#         await conn.execute("""
#             CREATE TABLE IF NOT EXISTS gsnowgpt_chat_log (
#                 id            BIGSERIAL PRIMARY KEY,
#                 session_id    TEXT,
#                 user_id       BIGINT REFERENCES users(id) ON DELETE SET NULL,
#                 intent        TEXT,
#                 user_message  TEXT NOT NULL,
#                 response_type TEXT,
#                 response_payload JSONB DEFAULT '{}',
#                 created_at    TIMESTAMPTZ DEFAULT NOW()
#             );
#             CREATE INDEX IF NOT EXISTS idx_gsnowgpt_chat_log_session    ON gsnowgpt_chat_log(session_id);
#             CREATE INDEX IF NOT EXISTS idx_gsnowgpt_chat_log_user_id    ON gsnowgpt_chat_log(user_id);
#             CREATE INDEX IF NOT EXISTS idx_gsnowgpt_chat_log_intent     ON gsnowgpt_chat_log(intent);
#             CREATE INDEX IF NOT EXISTS idx_gsnowgpt_chat_log_created_at ON gsnowgpt_chat_log(created_at DESC);
#         """)

#         print("[DB] ✅ Tables created/verified")

#         await conn.execute("""
#             CREATE INDEX IF NOT EXISTS idx_scraped_urls_url          ON scraped_urls(url);
#             CREATE INDEX IF NOT EXISTS idx_scraped_urls_last_scraped ON scraped_urls(last_scraped);
#             CREATE INDEX IF NOT EXISTS idx_blog_articles_created_at  ON blog_articles(created_at DESC);
#             CREATE INDEX IF NOT EXISTS idx_trends_created_at         ON trends(created_at DESC);
#             CREATE INDEX IF NOT EXISTS idx_memory_created_at         ON memory_entries(created_at DESC);
#             CREATE INDEX IF NOT EXISTS idx_users_email               ON users(email);
#             CREATE INDEX IF NOT EXISTS idx_comments_article_id       ON article_comments(article_id);
#             CREATE INDEX IF NOT EXISTS idx_likes_article_id          ON article_likes(article_id);
#             CREATE INDEX IF NOT EXISTS idx_item_votes_item_id        ON item_votes(item_id);
#             CREATE INDEX IF NOT EXISTS idx_design_signals_tag        ON design_signals(tag);
#             CREATE INDEX IF NOT EXISTS idx_design_signals_total_score ON design_signals(total_score DESC);
#             CREATE INDEX IF NOT EXISTS idx_design_signals_computed_at ON design_signals(computed_at DESC);
#             CREATE INDEX IF NOT EXISTS idx_design_cycles_cycle_number ON design_cycles(cycle_number DESC);
#             CREATE INDEX IF NOT EXISTS idx_design_cycles_completed_at ON design_cycles(completed_at);
#             CREATE INDEX IF NOT EXISTS idx_generated_designs_cycle_number ON generated_designs(cycle_number DESC);
#             CREATE INDEX IF NOT EXISTS idx_generated_designs_publishable  ON generated_designs(publishable);
#             CREATE INDEX IF NOT EXISTS idx_generated_designs_status       ON generated_designs(status);
#             CREATE INDEX IF NOT EXISTS idx_generated_designs_collection_id ON generated_designs(collection_id);
#             CREATE INDEX IF NOT EXISTS idx_showroom_created_at            ON showroom(created_at DESC);
#             CREATE INDEX IF NOT EXISTS idx_showroom_collection_id         ON showroom(collection_id);
#             CREATE INDEX IF NOT EXISTS idx_memory_entries_type            ON memory_entries(type);
#             CREATE INDEX IF NOT EXISTS idx_cycle_integrity_log_run_at     ON cycle_integrity_log(run_at DESC);
#             CREATE INDEX IF NOT EXISTS idx_cycle_integrity_log_cycle_number ON cycle_integrity_log(cycle_number DESC);
#             CREATE INDEX IF NOT EXISTS idx_user_collections_user_id ON user_collections(user_id);
#             CREATE INDEX IF NOT EXISTS idx_user_collections_item_id ON user_collections(item_id);
#             CREATE INDEX IF NOT EXISTS idx_comments_user_id ON article_comments(user_id);
#         """)

#         print("[DB] ✅ Indexes created")

#         await conn.execute("""
#             ALTER TABLE blog_articles ADD COLUMN IF NOT EXISTS image_url TEXT;
#             ALTER TABLE blog_articles ADD COLUMN IF NOT EXISTS likes INT DEFAULT 0;
#             ALTER TABLE generated_designs ADD COLUMN IF NOT EXISTS image_url TEXT;
#             ALTER TABLE generated_designs ADD COLUMN IF NOT EXISTS model_url TEXT;
#             ALTER TABLE generated_designs ADD COLUMN IF NOT EXISTS score_json JSONB DEFAULT '{}';
#             ALTER TABLE generated_designs ADD COLUMN IF NOT EXISTS cycle_number INT DEFAULT 1;
#             ALTER TABLE showroom ADD COLUMN IF NOT EXISTS model_url TEXT;
#             ALTER TABLE showroom ADD COLUMN IF NOT EXISTS vision_score FLOAT;
#             ALTER TABLE cycle_integrity_log ADD COLUMN IF NOT EXISTS cycle_number INT DEFAULT 1;
#         """)

#         try:
#             await conn.execute("ALTER TABLE generated_designs DROP COLUMN IF EXISTS cycle_date;")
#         except Exception:
#             pass

#         try:
#             await conn.execute("ALTER TABLE cycle_integrity_log DROP COLUMN IF EXISTS cycle_date;")
#         except Exception:
#             pass

#         # ── item_votes: persist per-vote explanation JSON for full audit ────────
#         # Section 5: requirement to persist explanation on each vote row.
#         # vote_explanation stores the proxy explanation (or manual vote metadata).
#         try:
#             await conn.execute(
#                 "ALTER TABLE item_votes ADD COLUMN IF NOT EXISTS vote_explanation JSONB DEFAULT '{}';"
#             )
#         except Exception:
#             pass

#         # FIX F: Ensure full_explanation_json persisted on proxy_vote_explanations
#         try:
#             await conn.execute("ALTER TABLE proxy_vote_explanations ADD COLUMN IF NOT EXISTS full_explanation_json JSONB DEFAULT '{}';")
#         except Exception:
#             pass

#         # FIX C: Ensure design_signals.tag has a UNIQUE constraint for proper upsert
#         # (required for ON CONFLICT (tag) DO UPDATE to work correctly)
#         try:
#             await conn.execute("""
#                 DO $$
#                 BEGIN
#                     IF NOT EXISTS (
#                         SELECT 1 FROM pg_constraint
#                         WHERE conname = 'design_signals_tag_key'
#                           AND conrelid = 'design_signals'::regclass
#                     ) THEN
#                         -- Deduplicate: keep only the highest-scoring row per tag before adding constraint
#                         DELETE FROM design_signals ds
#                         WHERE id NOT IN (
#                             SELECT DISTINCT ON (tag) id
#                             FROM design_signals
#                             ORDER BY tag, total_score DESC, computed_at DESC
#                         );
#                         ALTER TABLE design_signals ADD CONSTRAINT design_signals_tag_key UNIQUE (tag);
#                     END IF;
#                 END
#                 $$;
#             """)
#             print("[DB] ✅ design_signals.tag UNIQUE constraint ensured")
#         except Exception as e:
#             print(f"[DB] ⚠ design_signals UNIQUE constraint migration: {e}")

#         # Section 4 closed loop: processed_at for idempotent feedback processing
#         try:
#             await conn.execute("ALTER TABLE interaction_events ADD COLUMN IF NOT EXISTS processed_at TIMESTAMPTZ;")
#             await conn.execute("CREATE INDEX IF NOT EXISTS idx_interaction_events_processed_at ON interaction_events(processed_at);")
#         except Exception:
#             pass

#         print("[DB] ✅ Migrations applied")

#         # ── Admin bootstrap: DISABLED — do not seed a known password in production ──
#         # To create the initial admin, set ADMIN_BOOTSTRAP_SECRET in .env and
#         # run the one-time bootstrap script separately.
#         print("[DB] ⚠ Admin bootstrap via startup is DISABLED for security. Use bootstrap script with ADMIN_BOOTSTRAP_SECRET.")
#         print("[DB] ✅ Admin user NOT auto-seeded")

#     print("[DB] 🚀 Database fully initialized")


# async def run_schema_migrations(pool: asyncpg.Pool):
#     """
#     Programmatic schema reconciliation: run ALTER TABLE to align with current init_db.
#     This ensures old backups match the code's expected schema.
#     """
#     async with pool.acquire() as conn:
#         # Add any missing columns from old backups
#         await conn.execute("ALTER TABLE item_votes ADD COLUMN IF NOT EXISTS vote_explanation JSONB DEFAULT '{}';")
#         await conn.execute("ALTER TABLE product_catalog ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;")
#         await conn.execute("ALTER TABLE product_catalog ADD COLUMN IF NOT EXISTS collection_id BIGINT;")
#         await conn.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT FALSE;")
#         await conn.execute("ALTER TABLE generated_designs ADD COLUMN IF NOT EXISTS collection_id BIGINT REFERENCES collections(id);")
#         await conn.execute("ALTER TABLE showroom ADD COLUMN IF NOT EXISTS collection_id BIGINT REFERENCES collections(id);")
#         await conn.execute("ALTER TABLE interaction_events ADD COLUMN IF NOT EXISTS processed_at TIMESTAMPTZ;")
#         # Add more as needed to match init_db
#         print("[MIGRATION] ✅ Schema reconciled with current init_db")


# async def verify_backup_completeness(pool: asyncpg.Pool) -> Dict[str, int]:
#     """
#     MVP – Database snapshot (Item 5): Verify that all critical tables are present and have data.
#     Returns a dict of table names → row counts.
#     Use this after restoring from backup to ensure no tables were lost.
#     """
#     critical_tables = [
#         "users",
#         "blog_articles",
#         "trends",
#         "memory_entries",
#         "generated_designs",
#         "showroom",
#         "collections",
#         "design_signals",
#         "interaction_events",  # CRITICAL: feedback pipeline
#         "gsnowgpt_chat_log",    # CRITICAL: conversation history
#         "item_votes",
#         "user_subscriptions",
#     ]
    
#     counts = {}
#     async with pool.acquire() as conn:
#         for table in critical_tables:
#             try:
#                 count = await conn.fetchval(f"SELECT COUNT(*) FROM {table}")
#                 counts[table] = int(count or 0)
#             except Exception as e:
#                 counts[table] = -1  # -1 indicates table missing or error
#                 print(f"[BACKUP-VERIFY] ✗ Table {table}: {e}")
    
#     missing = [t for t, c in counts.items() if c == -1]
#     if missing:
#         print(f"[BACKUP-VERIFY] ⚠ MISSING TABLES: {missing}")
#     else:
#         print(f"[BACKUP-VERIFY] ✅ All critical tables present. Row counts: {counts}")
    
#     return counts


# # ──────────────────────────────────────────────
# # Pydantic models
# # ──────────────────────────────────────────────
# class MemoryStoreRequest(BaseModel):
#     type:    str
#     content: str
#     payload: Dict[str, Any] = {}


# class SendOtpRequest(BaseModel):
#     firstName: str
#     lastName:  str
#     email:     str
#     password:  str


# class VerifyOtpRequest(BaseModel):
#     email:    str
#     otp_code: str


# class ResendOtpRequest(BaseModel):
#     email: str


# class LoginRequest(BaseModel):
#     email:    str
#     password: str


# class TokenResponse(BaseModel):
#     access_token: str
#     token_type:   str = "bearer"
#     user:         Dict[str, Any]


# class CommentRequest(BaseModel):
#     text: str


# class ProxyToggleRequest(BaseModel):
#     enabled: bool


# class CreateCheckoutRequest(BaseModel):
#     price_id:    str
#     plan_name:   str
#     success_url: Optional[str] = None
#     cancel_url:  Optional[str] = None


# class SwitchPlanRequest(BaseModel):
#     new_price_id:  str
#     new_plan_name: str


# class GenerateCommentsRequest(BaseModel):
#     article_title:   str
#     article_content: str = ""
#     count:           int = 4
#     article_id:      int


# class StyleAgentRequest(BaseModel):
#     message:              str
#     product_name:         Optional[str] = None
#     product_desc:         Optional[str] = None
#     product_price:        Optional[str] = None
#     conversation_history: List[Dict[str, str]] = []


# class CollectionRequest(BaseModel):
#     item_id: str


# class VectorSearchRequest(BaseModel):
#     query:          str
#     memory_type:    str   = "design_signal"
#     top_k:          int   = 10
#     min_similarity: float = 0.20


# # ── Proxy voting preference profile and explanation models ─────────────────────
# class ProxyPreferenceProfile(BaseModel):
#     """Explicit preference-driven model for proxy voting."""
#     user_id: int
    
#     # Aesthetic preferences (0-100 normalized weights)
#     aesthetic_minimalist_weight:    float = 50.0  # Clean, simple designs
#     aesthetic_bold_weight:          float = 50.0  # Dramatic, eye-catching designs
#     aesthetic_eclectic_weight:      float = 50.0  # Eclectic, mixed-style designs
    
#     # Material preferences (0-100 normalized weights)
#     material_luxury_weight:         float = 50.0  # Premium materials (silk, leather, etc)
#     material_sustainable_weight:    float = 50.0  # Eco-friendly materials
#     material_experimental_weight:   float = 50.0  # Novel/innovative materials
    
#     # Silhouette preferences (0-100 normalized weights)
#     silhouette_fitted_weight:       float = 50.0  # Fitted/bodycon
#     silhouette_relaxed_weight:      float = 50.0  # Loose/comfortable
#     silhouette_structured_weight:   float = 50.0  # Structured/architectural
    
#     # Design type preferences (0-100 normalized weights)
#     design_classic_weight:          float = 50.0  # Timeless, classic
#     design_trendy_weight:           float = 50.0  # Trend-following
#     design_avant_garde_weight:      float = 50.0  # Experimental/avant-garde
    
#     # Category preferences (0-100 normalized weights)
#     category_apparel_weight:        float = 50.0
#     category_accessories_weight:    float = 50.0
#     category_footwear_weight:       float = 50.0
#     category_jewelry_weight:        float = 50.0
    
#     updated_at: datetime = datetime.utcnow()


# class ProxyVoteExplanation(BaseModel):
#     """Explanation metadata for a proxy vote (for audit/debug/UI transparency)."""
#     vote_id: Optional[int] = None
#     product_id: str
#     user_id: int
    
#     # Score breakdown
#     preference_score: float  # Score from explicit preferences
#     history_score: float     # Score from voting history
#     combined_score: float    # Total weighted score
    
#     # Scoring details
#     matched_preferences: List[str]  # Which preference categories matched
#     matched_tags: List[str]          # Tags that matched history
#     boosted_by: List[str]            # Boost reason codes
#     penalty_applied: Optional[str]   # If any penalty
    
#     # Tie-break information
#     tie_break_reason: Optional[str]  # How tie was broken (if needed)
    
#     # Audit
#     score_computation_method: str    # "preference-driven", "history-inferred", "random"
#     created_at: datetime = datetime.utcnow()


# class ProxyPreferenceUpdateRequest(BaseModel):
#     """Request to update user's proxy voting preferences."""
#     aesthetic_minimalist_weight: Optional[float] = None
#     aesthetic_bold_weight: Optional[float] = None
#     aesthetic_eclectic_weight: Optional[float] = None
#     material_luxury_weight: Optional[float] = None
#     material_sustainable_weight: Optional[float] = None
#     material_experimental_weight: Optional[float] = None
#     silhouette_fitted_weight: Optional[float] = None
#     silhouette_relaxed_weight: Optional[float] = None
#     silhouette_structured_weight: Optional[float] = None
#     design_classic_weight: Optional[float] = None
#     design_trendy_weight: Optional[float] = None
#     design_avant_garde_weight: Optional[float] = None
#     category_apparel_weight: Optional[float] = None
#     category_accessories_weight: Optional[float] = None
#     category_footwear_weight: Optional[float] = None
#     category_jewelry_weight: Optional[float] = None


# # ── FIX A: GSNowGPT unified conversational entry ──────────────────────────────
# class GSNowGPTRequest(BaseModel):
#     message:              str
#     session_id:           Optional[str] = None
#     product_name:         Optional[str] = None
#     product_desc:         Optional[str] = None
#     product_price:        Optional[str] = None
#     conversation_history: List[Dict[str, str]] = []


# # ── FIX B: Collection management models ───────────────────────────────────────
# class CreateCollectionRequest(BaseModel):
#     name:        str
#     description: Optional[str] = None
#     lifecycle:   str = "draft"


# class UpdateCollectionRequest(BaseModel):
#     name:        Optional[str] = None
#     description: Optional[str] = None
#     lifecycle:   Optional[str] = None


# # ── FIX C: Interaction event emission model ───────────────────────────────────
# class InteractionEventRequest(BaseModel):
#     event_type:  str   # blog_like | blog_comment | design_view | vote_cast | save_look | chat_query | paid_feature_use
#     entity_id:   Optional[str] = None
#     entity_type: Optional[str] = None
#     payload:     Dict[str, Any] = {}


# # ──────────────────────────────────────────────
# # JWT helpers
# # ──────────────────────────────────────────────
# def create_jwt(user_id: int, email: str, is_admin: bool) -> str:
#     payload = {
#         "sub":      str(user_id),
#         "email":    email,
#         "is_admin": is_admin,
#         "exp":      datetime.utcnow() + timedelta(days=JWT_EXPIRE_DAYS),
#     }
#     return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


# def decode_jwt(token: str) -> Dict:
#     try:
#         return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
#     except JWTError as e:
#         raise HTTPException(status_code=401, detail=f"Invalid token: {e}")


# async def get_current_user(authorization: Optional[str]) -> Dict:
#     if not authorization or not authorization.startswith("Bearer "):
#         raise HTTPException(status_code=401, detail="Missing or malformed Authorization header")
#     token = authorization.split(" ", 1)[1]
#     return decode_jwt(token)


# async def get_optional_user(authorization: Optional[str]) -> Optional[Dict]:
#     """Return decoded JWT or None — never raises."""
#     if not authorization or not authorization.startswith("Bearer "):
#         return None
#     try:
#         return decode_jwt(authorization.split(" ", 1)[1])
#     except Exception:
#         return None


# # ──────────────────────────────────────────────
# # Authorization and rate limiting for expensive endpoints
# # ──────────────────────────────────────────────
# async def require_admin(authorization: Optional[str] = Header(None)) -> Dict:
#     """Require admin role for protected endpoints."""
#     payload = await get_current_user(authorization)
#     pool = await get_pool()
    
#     async with pool.acquire() as conn:
#         user = await conn.fetchrow(
#             "SELECT is_admin FROM users WHERE id = $1",
#             int(payload["sub"])
#         )
    
#     if not user or not user["is_admin"]:
#         raise HTTPException(
#             status_code=403,
#             detail="Admin access required to execute this operation"
#         )
    
#     return payload


# def check_rate_limit(request: Request, endpoint: str, max_requests: int = RATE_LIMIT_MAX_REQUESTS) -> bool:
#     """Simple rate limiter by client IP and endpoint. Returns True if within limits, False if exceeded."""
#     import time

#     client_ip = request.client.host if request.client else "unknown"
#     key = (client_ip, endpoint)
#     now = time.time()

#     # Clean old entries
#     if key in RATE_LIMIT_REQUESTS:
#         RATE_LIMIT_REQUESTS[key] = [
#             ts for ts in RATE_LIMIT_REQUESTS[key]
#             if now - ts < RATE_LIMIT_WINDOW_SECONDS
#         ]

#     # Check limit
#     if key not in RATE_LIMIT_REQUESTS:
#         RATE_LIMIT_REQUESTS[key] = []

#     if len(RATE_LIMIT_REQUESTS[key]) >= max_requests:
#         return False

#     RATE_LIMIT_REQUESTS[key].append(now)
#     return True


# def check_user_rate_limit(user_key: str, endpoint: str, max_requests: int, window_seconds: int = 3600) -> bool:
#     """Per-user rate limiter (by user_id or email string + endpoint)."""
#     import time
#     key = (user_key, endpoint)
#     now = time.time()
#     if key in RATE_LIMIT_REQUESTS:
#         RATE_LIMIT_REQUESTS[key] = [
#             ts for ts in RATE_LIMIT_REQUESTS[key]
#             if now - ts < window_seconds
#         ]
#     if key not in RATE_LIMIT_REQUESTS:
#         RATE_LIMIT_REQUESTS[key] = []
#     if len(RATE_LIMIT_REQUESTS[key]) >= max_requests:
#         return False
#     RATE_LIMIT_REQUESTS[key].append(now)
#     return True


# async def log_admin_action(pool: asyncpg.Pool, user_id: int, action: str, endpoint: str, details: str = ""):
#     """Log admin actions for audit trail."""
#     try:
#         async with pool.acquire() as conn:
#             await conn.execute(
#                 """
#                 INSERT INTO admin_audit_log (user_id, action, endpoint, details, created_at)
#                 VALUES ($1, $2, $3, $4, NOW())
#                 """,
#                 user_id, action, endpoint, details
#             )
#     except Exception as e:
#         print(f"[AUDIT] Failed to log action: {e}")


# # ──────────────────────────────────────────────
# # OTP helpers
# # ──────────────────────────────────────────────
# def _generate_otp() -> str:
#     return str(random.randint(100000, 999999))


# def _send_otp_email(to_email: str, otp_code: str, first_name: str) -> bool:
#     if not GMAIL_SENDER_EMAIL or not GMAIL_APP_PASSWORD:
#         print("[OTP-EMAIL] ✗ Gmail credentials not configured")
#         return False

#     subject = "Your GIA Verification Code"

#     html_body = f"""
#     <!DOCTYPE html>
#     <html>
#     <head>
#       <meta charset="UTF-8"/>
#       <style>
#         body {{ font-family: 'Helvetica Neue', Arial, sans-serif; background: #0a0a0a; margin: 0; padding: 0; }}
#         .wrapper {{ max-width: 480px; margin: 40px auto; background: #141414; border-radius: 16px;
#                     border: 1px solid #2a2a2a; overflow: hidden; }}
#         .header {{ background: #1a1a1a; padding: 32px 40px; text-align: center;
#                    border-bottom: 1px solid #2a2a2a; }}
#         .logo {{ font-size: 28px; font-weight: 800; color: #ffffff; letter-spacing: -1px; }}
#         .logo span {{ color: #ec4899; }}
#         .body {{ padding: 40px; }}
#         .greeting {{ color: #a1a1aa; font-size: 15px; margin-bottom: 12px; }}
#         .msg {{ color: #e4e4e7; font-size: 15px; line-height: 1.6; margin-bottom: 32px; }}
#         .otp-box {{ background: #000000; border: 1px solid #ec4899; border-radius: 12px;
#                     padding: 24px; text-align: center; margin-bottom: 32px; }}
#         .otp-label {{ color: #a1a1aa; font-size: 12px; text-transform: uppercase;
#                       letter-spacing: 2px; margin-bottom: 12px; }}
#         .otp-code {{ font-size: 42px; font-weight: 800; color: #ec4899;
#                      letter-spacing: 12px; }}
#         .expiry {{ color: #71717a; font-size: 13px; text-align: center; margin-bottom: 24px; }}
#         .warning {{ color: #71717a; font-size: 12px; line-height: 1.5;
#                     border-top: 1px solid #2a2a2a; padding-top: 24px; }}
#         .footer {{ background: #0f0f0f; padding: 20px 40px; text-align: center;
#                    color: #52525b; font-size: 12px; border-top: 1px solid #2a2a2a; }}
#       </style>
#     </head>
#     <body>
#       <div class="wrapper">
#         <div class="header">
#           <div class="logo">GIA<span>.</span></div>
#         </div>
#         <div class="body">
#           <div class="greeting">Hello, {first_name} 👋</div>
#           <div class="msg">
#             Welcome to <strong style="color:#ffffff">GIA Fashion</strong>. To complete your
#             registration, please use the verification code below.
#           </div>
#           <div class="otp-box">
#             <div class="otp-label">Verification Code</div>
#             <div class="otp-code">{otp_code}</div>
#           </div>
#           <div class="expiry">⏱ This code expires in <strong style="color:#e4e4e7">{OTP_EXPIRE_MINUTES} minutes</strong>.</div>
#           <div class="warning">
#             If you did not request this code, you can safely ignore this email.
#             Someone may have entered your email address by mistake.
#           </div>
#         </div>
#         <div class="footer">© {datetime.utcnow().year} GIA Fashion. All rights reserved.</div>
#       </div>
#     </body>
#     </html>
#     """

#     plain_body = (
#         f"Hello {first_name},\n\n"
#         f"Your GIA verification code is: {otp_code}\n\n"
#         f"This code expires in {OTP_EXPIRE_MINUTES} minutes.\n\n"
#         f"If you did not request this, please ignore this email.\n\n"
#         f"— GIA Fashion Team"
#     )

#     msg = MIMEMultipart("alternative")
#     msg["Subject"] = subject
#     msg["From"]    = f"GIA Fashion <{GMAIL_SENDER_EMAIL}>"
#     msg["To"]      = to_email

#     msg.attach(MIMEText(plain_body, "plain"))
#     msg.attach(MIMEText(html_body,  "html"))

#     try:
#         context = ssl.create_default_context()
#         with smtplib.SMTP("smtp.gmail.com", 587) as server:
#             server.ehlo()
#             server.starttls(context=context)
#             server.ehlo()
#             server.login(GMAIL_SENDER_EMAIL, GMAIL_APP_PASSWORD)
#             server.sendmail(GMAIL_SENDER_EMAIL, to_email, msg.as_string())
#         print(f"[OTP-EMAIL] ✓ OTP sent to {to_email}")
#         return True
#     except smtplib.SMTPAuthenticationError:
#         print("[OTP-EMAIL] ✗ Gmail auth failed — check GMAIL_SENDER_EMAIL and GMAIL_APP_PASSWORD")
#         return False
#     except Exception as e:
#         print(f"[OTP-EMAIL] ✗ {type(e).__name__}: {e}")
#         return False


# # ──────────────────────────────────────────────
# # Source definitions
# # ──────────────────────────────────────────────
# SOURCES: List[Dict] = [
#     {
#         "name":     "Vogue",
#         "base_url": "https://www.vogue.com",
#         "rss": [
#             "https://www.vogue.com/feed/rss",
#             "https://www.vogue.com/fashion/rss",
#         ],
#         "sitemap": ["https://www.vogue.com/sitemap.xml"],
#         "crawl_seeds": [
#             "https://www.vogue.com/fashion",
#             "https://www.vogue.com/style",
#             "https://www.vogue.com/runway",
#         ],
#         "url_patterns":  ["/article/", "/story/", "/fashion/", "/style/", "/runway/"],
#         "url_blocklist": ["/video/", "/podcast/", "/horoscope/", "/beauty/"],
#         "playwright_wait":          "domcontentloaded",
#         "playwright_extra_wait_ms": 5000,
#     },
#     {
#         "name":     "Elle",
#         "base_url": "https://www.elle.com",
#         "rss": [
#             "https://www.elle.com/rss/all.xml/",
#             "https://www.elle.com/fashion/rss",
#         ],
#         "sitemap": ["https://www.elle.com/sitemap.xml"],
#         "crawl_seeds": [
#             "https://www.elle.com/fashion/",
#             "https://www.elle.com/fashion/trend-reports/",
#             "https://www.elle.com/fashion/celebrity-style/",
#         ],
#         "url_patterns":  ["/fashion/", "/style/", "/article/"],
#         "url_blocklist": ["/video/", "/podcast/", "/beauty/"],
#         "playwright_wait":          "networkidle",
#         "playwright_extra_wait_ms": 3000,
#     },
#     {
#         "name":     "Harper's Bazaar",
#         "base_url": "https://www.harpersbazaar.com",
#         "rss": [
#             "https://www.harpersbazaar.com/rss/all.xml/",
#             "https://www.harpersbazaar.com/fashion/rss",
#         ],
#         "sitemap": ["https://www.harpersbazaar.com/sitemap.xml"],
#         "crawl_seeds": [
#             "https://www.harpersbazaar.com/fashion/",
#             "https://www.harpersbazaar.com/fashion/trends/",
#             "https://www.harpersbazaar.com/fashion/street-style/",
#         ],
#         "url_patterns":  ["/fashion/", "/style/", "/article/"],
#         "url_blocklist": ["/video/", "/podcast/", "/beauty/"],
#         "playwright_wait":          "networkidle",
#         "playwright_extra_wait_ms": 3000,
#     },
# ]

# SOURCE_NAMES: List[str] = [s["name"] for s in SOURCES]
# SOURCE_BY_NAME: Dict[str, Dict] = {s["name"]: s for s in SOURCES}

# print(f"[BOOT] Sources configured: {SOURCE_NAMES}")


# # ──────────────────────────────────────────────
# # Circular Source Rotation
# # ──────────────────────────────────────────────
# async def get_last_used_source() -> Optional[str]:
#     pool = await get_pool()
#     async with pool.acquire() as conn:
#         row = await conn.fetchrow(
#             "SELECT last_used_source FROM source_rotation_state WHERE id = 1"
#         )
#     name = row["last_used_source"] if row else None
#     print(f"[ROTATION] Last used source from DB: {name!r}")
#     return name


# async def set_last_used_source(source_name: str):
#     pool = await get_pool()
#     async with pool.acquire() as conn:
#         await conn.execute("""
#             INSERT INTO source_rotation_state (id, last_used_source, updated_at)
#             VALUES (1, $1, NOW())
#             ON CONFLICT (id) DO UPDATE
#                 SET last_used_source = EXCLUDED.last_used_source,
#                     updated_at       = NOW()
#         """, source_name)
#     print(f"[ROTATION] Persisted last_used_source = {source_name!r}")


# def _circular_priority_order(last_used: Optional[str]) -> List[str]:
#     n = len(SOURCE_NAMES)
#     if not last_used or last_used not in SOURCE_NAMES:
#         start_idx = 0
#     else:
#         last_idx  = SOURCE_NAMES.index(last_used)
#         start_idx = (last_idx + 1) % n
#     order = [SOURCE_NAMES[(start_idx + i) % n] for i in range(n)]
#     print(f"[ROTATION] Priority order (last_used={last_used!r}): {order}")
#     return order


# async def select_source_with_articles(
#     priority_order: List[str],
#     known_urls: Set[str],
# ) -> Optional[Dict]:
#     for name in priority_order:
#         source = SOURCE_BY_NAME[name]
#         print(f"[ROTATION] Probing source '{name}' for fresh URLs…")
#         try:
#             rss_urls = await discover_via_rss(source, known_urls)
#             if rss_urls:
#                 print(f"[ROTATION] ✓ '{name}' has {len(rss_urls)} fresh RSS URL(s) — selected")
#                 return source

#             sitemap_urls = await discover_via_sitemap(source, known_urls)
#             if sitemap_urls:
#                 print(f"[ROTATION] ✓ '{name}' has {len(sitemap_urls)} fresh sitemap URL(s) — selected")
#                 return source

#             print(f"[ROTATION] ✗ '{name}' has no fresh URLs")
#         except Exception as e:
#             print(f"[ROTATION] ✗ Probe failed for '{name}': {type(e).__name__}: {e}")

#     print(f"[ROTATION] ✗ No source has fresh URLs — will fall back to first in priority order")
#     return None


# # ──────────────────────────────────────────────
# # Logging helpers
# # ──────────────────────────────────────────────
# def log_sep(label: str):
#     print(f"\n{'='*65}")
#     print(f"  {label}")
#     print(f"{'='*65}")

# def log_sec(label: str):
#     print(f"\n{'─'*55}")
#     print(f"  {label}")
#     print(f"{'─'*55}")


# # ──────────────────────────────────────────────
# # URL freshness helpers
# # ──────────────────────────────────────────────
# async def is_url_fresh(url: str) -> bool:
#     pool   = await get_pool()
#     cutoff = datetime.utcnow() - timedelta(days=URL_REUSE_DAYS)
#     async with pool.acquire() as conn:
#         row = await conn.fetchrow(
#             "SELECT last_scraped FROM scraped_urls WHERE url = $1", url
#         )
#     if row is None:
#         return True
#     last = row["last_scraped"].replace(tzinfo=None)
#     if last < cutoff:
#         return True
#     print(f"[SKIP] Scraped {(datetime.utcnow()-last).days}d ago (blocked for {URL_REUSE_DAYS}d): {url}")
#     return False


# async def mark_url_scraped(url: str):
#     pool = await get_pool()
#     async with pool.acquire() as conn:
#         await conn.execute("""
#             INSERT INTO scraped_urls (url, last_scraped)
#             VALUES ($1, NOW())
#             ON CONFLICT (url) DO UPDATE SET last_scraped = NOW()
#         """, url)


# async def get_recently_scraped_urls() -> Set[str]:
#     pool   = await get_pool()
#     cutoff = datetime.utcnow() - timedelta(days=URL_REUSE_DAYS)
#     async with pool.acquire() as conn:
#         rows = await conn.fetch(
#             "SELECT url FROM scraped_urls WHERE last_scraped >= $1", cutoff
#         )
#     return {r["url"] for r in rows}


# # ──────────────────────────────────────────────
# # URL validation
# # ──────────────────────────────────────────────
# def is_valid_article_url(url: str, source: Dict) -> bool:
#     if not url or not url.startswith("http"):
#         return False
#     parsed    = urlparse(url)
#     base_host = urlparse(source["base_url"]).netloc
#     if base_host not in parsed.netloc:
#         return False
#     path = parsed.path
#     if not any(p in path for p in source["url_patterns"]):
#         return False
#     if any(b in url for b in source["url_blocklist"]):
#         return False
#     segments = [s for s in path.split("/") if s]
#     if len(segments) < 2:
#         return False
#     return True


# # ──────────────────────────────────────────────
# # RSS / Atom discovery
# # ──────────────────────────────────────────────
# async def discover_via_rss(source: Dict, known_urls: Set[str]) -> List[str]:
#     log_sec(f"[RSS] {source['name']}")
#     found: List[str] = []
#     headers = {"User-Agent": "Mozilla/5.0 (compatible; GIABot/1.0)"}
#     async with httpx.AsyncClient(timeout=30, follow_redirects=True, headers=headers) as client:
#         for feed_url in source.get("rss", []):
#             print(f"[RSS]   Fetching: {feed_url}")
#             try:
#                 res = await client.get(feed_url)
#                 print(f"[RSS]   HTTP {res.status_code}")
#                 if res.status_code != 200:
#                     continue
#                 root  = ET.fromstring(res.text)
#                 items = root.findall(".//item")
#                 items += root.findall(".//{http://www.w3.org/2005/Atom}entry")
#                 print(f"[RSS]   {len(items)} feed items")
#                 for item in items:
#                     url = None
#                     link_el = item.find("link")
#                     if link_el is not None:
#                         url = (link_el.text or "").strip()
#                     if not url:
#                         al = item.find("{http://www.w3.org/2005/Atom}link")
#                         if al is not None:
#                             url = al.get("href", "").strip()
#                     if url and is_valid_article_url(url, source) and url not in known_urls:
#                         found.append(url)
#             except ET.ParseError as e:
#                 print(f"[RSS]   ✗ XML parse error: {e}")
#             except Exception as e:
#                 print(f"[RSS]   ✗ {type(e).__name__}: {e}")
#     unique = list(dict.fromkeys(found))
#     print(f"[RSS]   → {len(unique)} fresh valid URLs")
#     return unique


# # ──────────────────────────────────────────────
# # Sitemap discovery
# # ──────────────────────────────────────────────
# async def discover_via_sitemap(source: Dict, known_urls: Set[str]) -> List[str]:
#     log_sec(f"[SITEMAP] {source['name']}")
#     found: List[str] = []
#     headers = {"User-Agent": "Mozilla/5.0 (compatible; GIABot/1.0)"}
#     async with httpx.AsyncClient(timeout=30, follow_redirects=True, headers=headers) as client:
#         queue   = list(source.get("sitemap", []))
#         visited = set()
#         while queue:
#             sitemap_url = queue.pop(0)
#             if sitemap_url in visited:
#                 continue
#             visited.add(sitemap_url)
#             print(f"[SITEMAP]   Fetching: {sitemap_url}")
#             try:
#                 res = await client.get(sitemap_url)
#                 print(f"[SITEMAP]   HTTP {res.status_code}")
#                 if res.status_code != 200:
#                     continue
#                 root = ET.fromstring(res.text)
#                 if "sitemapindex" in root.tag.lower():
#                     locs = [el.text.strip() for el in root.iter()
#                             if (el.tag.endswith("}loc") or el.tag == "loc") and el.text]
#                     fashion_locs = [l for l in locs
#                                     if any(k in l for k in ["fashion","style","article","story","runway"])]
#                     print(f"[SITEMAP]   Index → {len(locs)} children, following {len(fashion_locs)} fashion ones")
#                     queue.extend(fashion_locs[:10])
#                 else:
#                     locs = [el.text.strip() for el in root.iter()
#                             if (el.tag.endswith("}loc") or el.tag == "loc") and el.text]
#                     print(f"[SITEMAP]   Regular → {len(locs)} URLs")
#                     for url in locs:
#                         if is_valid_article_url(url, source) and url not in known_urls:
#                             found.append(url)
#             except ET.ParseError as e:
#                 print(f"[SITEMAP]   ✗ XML parse error: {e}")
#             except Exception as e:
#                 print(f"[SITEMAP]   ✗ {type(e).__name__}: {e}")
#     random.shuffle(found)
#     unique = list(dict.fromkeys(found))
#     print(f"[SITEMAP]   → {len(unique)} fresh valid URLs")
#     return unique


# # ──────────────────────────────────────────────
# # SOURCE IMAGE EXTRACTION
# # ──────────────────────────────────────────────
# async def extract_article_image(url: str, html: Optional[str] = None) -> Optional[str]:
#     try:
#         if html is None:
#             print(f"[IMG-EXTRACT] Fetching HTML for image from: {url[:80]}")
#             headers = {
#                 "User-Agent": (
#                     "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
#                     "AppleWebKit/537.36 (KHTML, like Gecko) "
#                     "Chrome/124.0 Safari/537.36"
#                 ),
#                 "Accept-Language": "en-US,en;q=0.9",
#             }
#             async with httpx.AsyncClient(timeout=30, follow_redirects=True, headers=headers) as client:
#                 res = await client.get(url)
#                 if res.status_code != 200:
#                     print(f"[IMG-EXTRACT] ✗ HTTP {res.status_code}")
#                     return None
#                 html = res.text

#         og_patterns = [
#             r'<meta[^>]+property=["\']og:image["\'][^>]+content=["\']([^"\']+)["\']',
#             r'<meta[^>]+content=["\']([^"\']+)["\'][^>]+property=["\']og:image["\']',
#             r'<meta[^>]+property=["\']og:image:url["\'][^>]+content=["\']([^"\']+)["\']',
#             r'<meta[^>]+content=["\']([^"\']+)["\'][^>]+property=["\']og:image:url["\']',
#         ]
#         for pattern in og_patterns:
#             match = re.search(pattern, html, re.IGNORECASE)
#             if match:
#                 img_url = match.group(1).strip()
#                 if img_url.startswith("http"):
#                     print(f"[IMG-EXTRACT] ✓ og:image found: {img_url[:100]}")
#                     return img_url

#         tw_patterns = [
#             r'<meta[^>]+name=["\']twitter:image["\'][^>]+content=["\']([^"\']+)["\']',
#             r'<meta[^>]+content=["\']([^"\']+)["\'][^>]+name=["\']twitter:image["\']',
#             r'<meta[^>]+name=["\']twitter:image:src["\'][^>]+content=["\']([^"\']+)["\']',
#             r'<meta[^>]+content=["\']([^"\']+)["\'][^>]+name=["\']twitter:image:src["\']',
#         ]
#         for pattern in tw_patterns:
#             match = re.search(pattern, html, re.IGNORECASE)
#             if match:
#                 img_url = match.group(1).strip()
#                 if img_url.startswith("http"):
#                     print(f"[IMG-EXTRACT] ✓ twitter:image found: {img_url[:100]}")
#                     return img_url

#         link_match = re.search(
#             r'<link[^>]+rel=["\']image_src["\'][^>]+href=["\']([^"\']+)["\']',
#             html, re.IGNORECASE
#         )
#         if link_match:
#             img_url = link_match.group(1).strip()
#             if img_url.startswith("http"):
#                 print(f"[IMG-EXTRACT] ✓ image_src link found: {img_url[:100]}")
#                 return img_url

#         jsonld_match = re.search(
#             r'<script[^>]+type=["\']application/ld\+json["\'][^>]*>([\s\S]*?)</script>',
#             html, re.IGNORECASE
#         )
#         if jsonld_match:
#             try:
#                 ld_data = json.loads(jsonld_match.group(1))
#                 if isinstance(ld_data, list):
#                     ld_data = ld_data[0] if ld_data else {}
#                 for key in ("image", "thumbnailUrl", "thumbnail"):
#                     img_val = ld_data.get(key)
#                     if isinstance(img_val, str) and img_val.startswith("http"):
#                         print(f"[IMG-EXTRACT] ✓ JSON-LD image found: {img_val[:100]}")
#                         return img_val
#                     if isinstance(img_val, dict):
#                         url_val = img_val.get("url", "")
#                         if url_val.startswith("http"):
#                             print(f"[IMG-EXTRACT] ✓ JSON-LD image.url found: {url_val[:100]}")
#                             return url_val
#                     if isinstance(img_val, list) and img_val:
#                         first = img_val[0]
#                         if isinstance(first, str) and first.startswith("http"):
#                             print(f"[IMG-EXTRACT] ✓ JSON-LD image[0] found: {first[:100]}")
#                             return first
#                         if isinstance(first, dict):
#                             url_val = first.get("url", "")
#                             if url_val.startswith("http"):
#                                 print(f"[IMG-EXTRACT] ✓ JSON-LD image[0].url found: {url_val[:100]}")
#                                 return url_val
#             except Exception:
#                 pass

#         base = urlparse(url)
#         content_area_match = re.search(
#             r'(?:<article|<main|class=["\'][^"\']*(?:article|content|body|story)[^"\']*["\'])'
#             r'([\s\S]{0,5000})',
#             html, re.IGNORECASE
#         )
#         search_area = content_area_match.group(1) if content_area_match else html

#         img_tags = re.findall(
#             r'<img[^>]+(?:src|data-src|data-lazy-src)=["\']([^"\']+)["\'][^>]*>',
#             search_area, re.IGNORECASE
#         )

#         skip_keywords = [
#             "logo", "icon", "avatar", "pixel", "spacer", "1x1", "badge",
#             "spinner", "placeholder", "blank", "transparent", "tracking",
#             "analytics", "ad.", "ads.", "doubleclick", "googlesyndication",
#         ]

#         for img in img_tags:
#             if img.startswith("//"):
#                 img = f"{base.scheme}:{img}"
#             elif img.startswith("/"):
#                 img = f"{base.scheme}://{base.netloc}{img}"
#             if not img.startswith("http"):
#                 continue

#             img_lower = img.lower()
#             if any(skip in img_lower for skip in skip_keywords):
#                 continue

#             has_image_ext  = any(ext in img_lower for ext in [".jpg", ".jpeg", ".png", ".webp"])
#             has_image_path = any(kw  in img_lower for kw  in ["/image", "/photo", "/media", "/assets", "cdn", "upload"])

#             if has_image_ext or has_image_path:
#                 print(f"[IMG-EXTRACT] ✓ <img> tag fallback found: {img[:100]}")
#                 return img

#         print(f"[IMG-EXTRACT] ✗ No suitable image found in source article: {url[:80]}")
#         return None

#     except Exception as e:
#         print(f"[IMG-EXTRACT] ✗ {type(e).__name__}: {e}")
#         return None


# # ──────────────────────────────────────────────
# # TITLE EXTRACTION FROM HTML
# # ──────────────────────────────────────────────
# def extract_title_from_html(html: str, url: str = "") -> Optional[str]:
#     if not html:
#         return None

#     og_patterns = [
#         r'<meta[^>]+property=["\']og:title["\'][^>]+content=["\']([^"\']+)["\']',
#         r'<meta[^>]+content=["\']([^"\']+)["\'][^>]+property=["\']og:title["\']',
#     ]
#     for pattern in og_patterns:
#         match = re.search(pattern, html, re.IGNORECASE)
#         if match:
#             title = match.group(1).strip()
#             if title:
#                 print(f"[TITLE-EXTRACT] ✓ og:title: {repr(title[:80])}")
#                 return _clean_title(title)

#     tw_patterns = [
#         r'<meta[^>]+name=["\']twitter:title["\'][^>]+content=["\']([^"\']+)["\']',
#         r'<meta[^>]+content=["\']([^"\']+)["\'][^>]+name=["\']twitter:title["\']',
#     ]
#     for pattern in tw_patterns:
#         match = re.search(pattern, html, re.IGNORECASE)
#         if match:
#             title = match.group(1).strip()
#             if title:
#                 print(f"[TITLE-EXTRACT] ✓ twitter:title: {repr(title[:80])}")
#                 return _clean_title(title)

#     jsonld_match = re.search(
#         r'<script[^>]+type=["\']application/ld\+json["\'][^>]*>([\s\S]*?)</script>',
#         html, re.IGNORECASE
#     )
#     if jsonld_match:
#         try:
#             ld = json.loads(jsonld_match.group(1))
#             if isinstance(ld, list):
#                 ld = ld[0] if ld else {}
#             headline = ld.get("headline") or ld.get("name")
#             if headline and isinstance(headline, str) and len(headline.strip()) > 5:
#                 print(f"[TITLE-EXTRACT] ✓ JSON-LD headline: {repr(headline[:80])}")
#                 return _clean_title(headline)
#         except Exception:
#             pass

#     h1_match = re.search(r'<h1[^>]*>(.*?)</h1>', html, re.IGNORECASE | re.DOTALL)
#     if h1_match:
#         title = re.sub(r'<[^>]+>', '', h1_match.group(1)).strip()
#         if len(title) > 10:
#             print(f"[TITLE-EXTRACT] ✓ <h1>: {repr(title[:80])}")
#             return _clean_title(title)

#     title_tag = re.search(r'<title[^>]*>(.*?)</title>', html, re.IGNORECASE | re.DOTALL)
#     if title_tag:
#         raw = re.sub(r'<[^>]+>', '', title_tag.group(1)).strip()
#         raw = re.sub(
#             r'\s*[\|\-–—]\s*(Vogue|Elle|Harper\'?s?\s*Bazaar|BAZAAR|InStyle|W Magazine)[^\|]*$',
#             '', raw, flags=re.IGNORECASE
#         ).strip()
#         if len(raw) > 10:
#             print(f"[TITLE-EXTRACT] ✓ <title> tag: {repr(raw[:80])}")
#             return _clean_title(raw)

#     print(f"[TITLE-EXTRACT] ✗ Could not extract real title from HTML for: {url[:80]}")
#     return None


# def _clean_title(title: str) -> str:
#     title = title.replace('&amp;', '&')
#     title = title.replace('&quot;', '"')
#     title = title.replace('&#39;', "'")
#     title = title.replace('&apos;', "'")
#     title = title.replace('&nbsp;', ' ')
#     title = title.replace('&#8216;', '\u2018')
#     title = title.replace('&#8217;', '\u2019')
#     title = title.replace('&#8220;', '\u201c')
#     title = title.replace('&#8221;', '\u201d')
#     title = title.replace('&#8211;', '\u2013')
#     title = title.replace('&#8212;', '\u2014')
#     title = re.sub(r'\s+', ' ', title).strip()
#     return title


# # ──────────────────────────────────────────────
# # Playwright in its own thread (Windows-safe)
# # ──────────────────────────────────────────────
# def _run_playwright_in_thread(coro_factory):
#     result_holder = {}

#     def thread_main():
#         if sys.platform == "win32":
#             loop = asyncio.ProactorEventLoop()
#         else:
#             loop = asyncio.new_event_loop()
#         asyncio.set_event_loop(loop)
#         try:
#             result_holder["result"] = loop.run_until_complete(coro_factory())
#         except Exception as exc:
#             result_holder["error"] = exc
#         finally:
#             loop.close()

#     t = threading.Thread(target=thread_main, daemon=True)
#     t.start()
#     t.join()

#     if "error" in result_holder:
#         raise result_holder["error"]
#     return result_holder.get("result", [])


# async def run_playwright_scrape_in_thread(sources: List[Dict], known_urls: Set[str]) -> List[Dict]:
#     loop = asyncio.get_event_loop()

#     async def playwright_main() -> List[Dict]:
#         all_found: List[Dict] = []
#         async with async_playwright() as p:
#             print(f"[PLAYWRIGHT-THREAD] Launching Chromium…")
#             browser = await p.chromium.launch(
#                 headless=True,
#                 args=[
#                     "--no-sandbox",
#                     "--disable-setuid-sandbox",
#                     "--disable-blink-features=AutomationControlled",
#                     "--disable-dev-shm-usage",
#                 ]
#             )
#             print(f"[PLAYWRIGHT-THREAD] ✅ Browser launched")
#             for source in sources:
#                 articles = await _playwright_scrape_source(browser, source, known_urls)
#                 all_found.extend(articles)
#             await browser.close()
#             print(f"[PLAYWRIGHT-THREAD] Browser closed. Total articles: {len(all_found)}")
#         return all_found

#     result = await loop.run_in_executor(
#         None,
#         lambda: _run_playwright_in_thread(playwright_main)
#     )
#     return result


# async def _playwright_scrape_source(browser, source: Dict, known_urls: Set[str]) -> List[Dict]:
#     log_sep(f"[PLAYWRIGHT-THREAD] SCRAPING — {source['name']}")
#     found:    List[Dict] = []
#     seen:     Set[str]   = set()
#     examined = 0

#     for seed in source.get("crawl_seeds", []):
#         print(f"[PLAYWRIGHT-THREAD]   Seed: {seed}")
#         page = await browser.new_page()
#         try:
#             wait  = source.get("playwright_wait", "domcontentloaded")
#             extra = source.get("playwright_extra_wait_ms", 3000)
#             await page.goto(seed, wait_until=wait, timeout=90_000)
#             await page.wait_for_timeout(extra)

#             for _ in range(6):
#                 await page.evaluate("window.scrollBy(0, window.innerHeight * 1.5)")
#                 await page.wait_for_timeout(1200)

#             hrefs = await page.eval_on_selector_all(
#                 "a[href]", "els => els.map(e => e.href).filter(Boolean)"
#             )
#             print(f"[PLAYWRIGHT-THREAD]   Raw hrefs: {len(hrefs)}")

#             for h in hrefs:
#                 if h.startswith("/"):
#                     h = urljoin(source["base_url"], h)
#                 if (is_valid_article_url(h, source)
#                         and h not in known_urls
#                         and h not in seen
#                         and len(found) < MAX_PER_SOURCE):
#                     seen.add(h)
#                     if examined >= CANDIDATE_LIMIT:
#                         break
#                     examined += 1
#                     print(f"[PLAYWRIGHT-THREAD]   [{examined}] Fetching: {h}")
#                     content, source_image, page_title = await _playwright_fetch_content(browser, h, source)
#                     if len(content) >= 200:
#                         url_slug_title = h.rstrip("/").split("/")[-1].replace("-", " ").title()
#                         real_title = page_title or url_slug_title
#                         found.append({
#                             "url":          h,
#                             "content":      content,
#                             "source_image": source_image,
#                             "source":       source["name"],
#                             "title":        real_title,
#                         })

#         except Exception as e:
#             print(f"[PLAYWRIGHT-THREAD]   ✗ {seed}: {type(e).__name__}: {e}")
#         finally:
#             await page.close()

#     print(f"[PLAYWRIGHT-THREAD] {source['name']} done — {len(found)} articles")
#     return found


# async def _playwright_fetch_content(browser, url: str, source: Dict) -> tuple:
#     page = await browser.new_page()
#     source_image = None
#     page_title   = None
#     try:
#         wait = source.get("playwright_wait", "domcontentloaded")
#         await page.goto(url, wait_until=wait, timeout=60_000)
#         await page.wait_for_timeout(1500)

#         try:
#             result = await page.evaluate("""() => {
#                 const ogTitle = document.querySelector('meta[property="og:title"]');
#                 const twTitle = document.querySelector('meta[name="twitter:title"]');
#                 const h1      = document.querySelector('h1');

#                 let title = null;
#                 if (ogTitle && ogTitle.getAttribute('content')) {
#                     title = ogTitle.getAttribute('content').trim();
#                 } else if (twTitle && twTitle.getAttribute('content')) {
#                     title = twTitle.getAttribute('content').trim();
#                 } else if (h1 && h1.innerText) {
#                     title = h1.innerText.trim();
#                 } else {
#                     const raw = document.title || '';
#                     title = raw.replace(/\\s*[\\|\\-\\u2013\\u2014]\\s*(Vogue|Elle|Harper.?s?\\s*Bazaar|BAZAAR|InStyle|W Magazine)[^]*$/i, '').trim() || raw.trim();
#                 }

#                 const ogImg   = document.querySelector('meta[property="og:image"]');
#                 const ogImgU  = document.querySelector('meta[property="og:image:url"]');
#                 const twImg   = document.querySelector('meta[name="twitter:image"]');
#                 const twImgS  = document.querySelector('meta[name="twitter:image:src"]');
#                 const imgSrc  = document.querySelector('link[rel="image_src"]');

#                 let img = null;
#                 if (ogImg   && ogImg.getAttribute('content'))  img = ogImg.getAttribute('content');
#                 else if (ogImgU  && ogImgU.getAttribute('content')) img = ogImgU.getAttribute('content');
#                 else if (twImg   && twImg.getAttribute('content'))  img = twImg.getAttribute('content');
#                 else if (twImgS  && twImgS.getAttribute('content')) img = twImgS.getAttribute('content');
#                 else if (imgSrc  && imgSrc.getAttribute('href'))     img = imgSrc.getAttribute('href');
#                 else {
#                     const articleImgs = document.querySelectorAll('article img, main img, [class*="article"] img');
#                     for (const el of articleImgs) {
#                         const src = el.src || el.dataset.src || el.dataset.lazySrc;
#                         if (src && src.startsWith('http') && !src.includes('logo') && !src.includes('icon')) {
#                             img = src;
#                             break;
#                         }
#                     }
#                 }

#                 return [title || null, img || null];
#             }""")

#             if isinstance(result, list) and len(result) == 2:
#                 page_title, source_image = result
#             else:
#                 page_title, source_image = None, None

#             if page_title:
#                 page_title = _clean_title(page_title)
#                 print(f"[PLAYWRIGHT] ✓ Title extracted: {repr(page_title[:80])}")
#             else:
#                 print(f"[PLAYWRIGHT] ✗ No title found via JS for: {url[:80]}")

#             if source_image:
#                 print(f"[PLAYWRIGHT] ✓ Source image extracted: {source_image[:100]}")
#             else:
#                 print(f"[PLAYWRIGHT] ✗ No og:image found via JS for: {url[:80]}")

#         except Exception as meta_err:
#             print(f"[PLAYWRIGHT] ✗ Meta extraction JS error: {meta_err}")
#             page_title, source_image = None, None

#         selectors = [
#             "article p", "[class*='article-body'] p", "[class*='article__body'] p",
#             "[class*='body-text'] p", "main p", "p"
#         ]
#         for sel in selectors:
#             try:
#                 text = await page.eval_on_selector_all(
#                     sel,
#                     "els => els.map(e => e.innerText.trim()).filter(t => t.length > 40).join(' ')"
#                 )
#                 if len(text) > 200:
#                     return text[:4000], source_image, page_title
#             except Exception:
#                 continue
#         return "", source_image, page_title
#     except Exception as e:
#         print(f"[PLAYWRIGHT-THREAD]   ✗ fetch {url}: {type(e).__name__}: {e}")
#         return "", None, None
#     finally:
#         await page.close()


# # ──────────────────────────────────────────────
# # HTTP content fetch
# # ──────────────────────────────────────────────
# async def fetch_content_http(url: str) -> tuple:
#     try:
#         headers = {
#             "User-Agent": (
#                 "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
#                 "AppleWebKit/537.36 (KHTML, like Gecko) "
#                 "Chrome/124.0 Safari/537.36"
#             ),
#             "Accept-Language": "en-US,en;q=0.9",
#         }
#         async with httpx.AsyncClient(timeout=30, follow_redirects=True, headers=headers) as client:
#             res = await client.get(url)
#             if res.status_code != 200:
#                 print(f"[HTTP]   ✗ HTTP {res.status_code} for {url}")
#                 return "", None, None
#             html = res.text

#             real_title = extract_title_from_html(html, url)

#             paras   = re.findall(r"<p[^>]*>(.*?)</p>", html, re.DOTALL | re.IGNORECASE)
#             clean   = [re.sub(r"<[^>]+>", "", p).strip() for p in paras]
#             content = " ".join(t for t in clean if len(t) > 40)[:4000]
#             print(f"[HTTP]   {url} → {len(content)} chars | title: {repr((real_title or '')[:60])}")
#             return content, html, real_title
#     except Exception as e:
#         print(f"[HTTP]   ✗ {type(e).__name__}: {e}")
#         return "", None, None


# # ──────────────────────────────────────────────
# # Per-source HTTP orchestrator
# # ──────────────────────────────────────────────
# async def scrape_source_http(source: Dict, known_urls: Set[str]) -> List[Dict]:
#     log_sep(f"SCRAPING SOURCE (HTTP) — {source['name']}")
#     candidates: List[str] = []

#     rss_urls = await discover_via_rss(source, known_urls)
#     candidates.extend(rss_urls)
#     print(f"[{source['name']}] After RSS     : {len(candidates)} candidates")

#     if len(candidates) < CANDIDATE_LIMIT:
#         sitemap_urls = await discover_via_sitemap(source, known_urls)
#         for u in sitemap_urls:
#             if u not in candidates:
#                 candidates.append(u)
#         print(f"[{source['name']}] After sitemap : {len(candidates)} candidates")

#     if not candidates:
#         print(f"[WARN]  {source['name']} — zero HTTP candidates")
#         return []

#     random.shuffle(candidates)
#     print(f"[{source['name']}] Examining up to {CANDIDATE_LIMIT} of {len(candidates)} candidates")

#     articles: List[Dict] = []
#     examined = 0

#     for url in candidates:
#         if len(articles) >= MAX_PER_SOURCE:
#             break
#         if examined >= CANDIDATE_LIMIT:
#             break
#         examined += 1
#         print(f"\n[{source['name']}] [{examined}] {url}")

#         if not await is_url_fresh(url):
#             continue

#         content, html, real_title = await fetch_content_http(url)
#         if len(content) < 200:
#             print(f"[{source['name']}]   ✗ Too short ({len(content)} chars), skipping")
#             continue

#         await mark_url_scraped(url)

#         url_slug_title = url.rstrip("/").split("/")[-1].replace("-", " ").title()
#         title = real_title or url_slug_title

#         if real_title:
#             print(f"[{source['name']}]   ✓ Real title: {repr(real_title[:70])}")
#         else:
#             print(f"[{source['name']}]   ⚠ No real title found — using URL slug: {repr(url_slug_title[:70])}")

#         articles.append({
#             "url":     url,
#             "content": content,
#             "html":    html,
#             "source":  source["name"],
#             "title":   title,
#         })
#         print(f"[{source['name']}]   ✓ ADDED ({len(content)} chars) [{len(articles)}/{MAX_PER_SOURCE}]")

#     return articles


# # ──────────────────────────────────────────────
# # Main scrape loop — CIRCULAR PRIORITY ORDER
# # ──────────────────────────────────────────────
# async def scrape_all_with_retry() -> List[Dict]:
#     log_sep("SCRAPE — CIRCULAR PRIORITY ORDER")
#     print(f"[SCRAPE] Goal: {MIN_SOURCE_ARTICLES} articles | Max retries per source: {MAX_SCRAPE_RETRIES}")

#     known_urls     = await get_recently_scraped_urls()
#     last_used      = await get_last_used_source()
#     priority_order = _circular_priority_order(last_used)

#     log_sec(f"[ROTATION] Priority order this run: {priority_order}")

#     selected_source = await select_source_with_articles(priority_order, known_urls)

#     if selected_source is None:
#         fallback_name   = priority_order[0]
#         selected_source = SOURCE_BY_NAME[fallback_name]
#         print(f"[ROTATION] ⚠ No fresh URLs found in probe — falling back to priority-1 source: {fallback_name!r}")
#     else:
#         print(f"[ROTATION] ✓ Selected source: {selected_source['name']!r}")

#     attempt_order = [selected_source["name"]] + [
#         name for name in priority_order if name != selected_source["name"]
#     ]
#     print(f"[ROTATION] Attempt order: {attempt_order}")

#     for source_name in attempt_order:
#         source = SOURCE_BY_NAME[source_name]
#         log_sec(f"TRYING SOURCE: {source_name}")

#         source_articles: List[Dict] = []
#         collected_urls:  Set[str]   = set()
#         playwright_attempted = False

#         for attempt in range(1, MAX_SCRAPE_RETRIES + 1):
#             print(f"[SCRAPE] [{source_name}] HTTP Attempt {attempt}/{MAX_SCRAPE_RETRIES}")

#             known_urls = await get_recently_scraped_urls()
#             known_urls |= collected_urls
#             print(f"[SCRAPE] Known/blocked URLs: {len(known_urls)}")

#             http_articles = await scrape_source_http(source, known_urls)

#             for a in http_articles:
#                 if a["url"] not in collected_urls:
#                     source_articles.append(a)
#                     collected_urls.add(a["url"])

#             print(f"[SCRAPE] [{source_name}] After HTTP attempt {attempt}: {len(source_articles)} articles")

#             if len(source_articles) >= MIN_SOURCE_ARTICLES:
#                 log_sep(f"✅ SOURCE HIT: {source_name} — {len(source_articles)} articles found. Stopping here.")
#                 await set_last_used_source(source_name)
#                 return source_articles

#             if not playwright_attempted:
#                 playwright_attempted = True
#                 print(f"[SCRAPE] HTTP insufficient ({len(source_articles)}/{MIN_SOURCE_ARTICLES}) — launching Playwright for {source_name}…")
#                 try:
#                     pw_articles = await run_playwright_scrape_in_thread(
#                         [source],
#                         known_urls | collected_urls,
#                     )
#                     for a in pw_articles:
#                         if a["url"] not in collected_urls:
#                             await mark_url_scraped(a["url"])
#                             source_articles.append(a)
#                             collected_urls.add(a["url"])
#                     print(f"[SCRAPE] [{source_name}] After Playwright: {len(source_articles)} articles")
#                 except Exception as e:
#                     print(f"[ERROR] Playwright failed for {source_name}: {type(e).__name__}: {e}")

#             if len(source_articles) >= MIN_SOURCE_ARTICLES:
#                 log_sep(f"✅ SOURCE HIT: {source_name} — {len(source_articles)} articles found (after Playwright). Stopping here.")
#                 await set_last_used_source(source_name)
#                 return source_articles

#             if attempt < MAX_SCRAPE_RETRIES:
#                 need = MIN_SOURCE_ARTICLES - len(source_articles)
#                 print(f"[SCRAPE] [{source_name}] Still need {need} more. Retrying in {RETRY_DELAY_SECONDS}s…")
#                 await asyncio.sleep(RETRY_DELAY_SECONDS)

#         if len(source_articles) == 0:
#             print(f"[SCRAPE] ✗ {source_name} yielded 0 new articles after {MAX_SCRAPE_RETRIES} attempts — trying next source")
#         else:
#             log_sep(f"⚠️ SOURCE PARTIAL HIT: {source_name} — only {len(source_articles)} articles (need {MIN_SOURCE_ARTICLES}), but using anyway.")
#             await set_last_used_source(source_name)
#             return source_articles

#     print("[SCRAPE] ✗ All sources exhausted — no new articles found from any source")
#     return []


# # ──────────────────────────────────────────────
# # Pexels image fetch (fallback only)
# # ──────────────────────────────────────────────
# async def fetch_pexels_image(query: str) -> Optional[str]:
#     if not PEXELS_API_KEY:
#         print("[PEXELS] ✗ PEXELS_API_KEY not set — skipping image fetch")
#         return None

#     search_query = f"{query} fashion"
#     print(f"[PEXELS] Searching for: '{search_query}'")

#     try:
#         async with httpx.AsyncClient(timeout=20) as client:
#             res = await client.get(
#                 "https://api.pexels.com/v1/search",
#                 headers={"Authorization": PEXELS_API_KEY},
#                 params={
#                     "query":       search_query,
#                     "per_page":    5,
#                     "orientation": "landscape",
#                 },
#             )
#             print(f"[PEXELS] HTTP {res.status_code}")
#             if res.status_code != 200:
#                 print(f"[PEXELS] ✗ Non-200 response: {res.text[:200]}")
#                 return None

#             data   = res.json()
#             photos = data.get("photos", [])
#             if not photos:
#                 print(f"[PEXELS] ✗ No photos found for '{search_query}'")
#                 return await _pexels_fallback()

#             photo = photos[0]
#             image_url = (
#                 photo.get("src", {}).get("large2x")
#                 or photo.get("src", {}).get("large")
#                 or photo.get("src", {}).get("original")
#             )
#             if image_url:
#                 print(f"[PEXELS] ✓ Image URL: {image_url}")
#             return image_url

#     except Exception as e:
#         print(f"[PEXELS] ✗ {type(e).__name__}: {e}")
#         return None


# async def _pexels_fallback() -> Optional[str]:
#     fallback_queries = ["fashion style", "clothing runway", "fashion week"]
#     for q in fallback_queries:
#         try:
#             async with httpx.AsyncClient(timeout=20) as client:
#                 res = await client.get(
#                     "https://api.pexels.com/v1/search",
#                     headers={"Authorization": PEXELS_API_KEY},
#                     params={"query": q, "per_page": 3, "orientation": "landscape"},
#                 )
#                 if res.status_code == 200:
#                     photos = res.json().get("photos", [])
#                     if photos:
#                         url = (
#                             photos[0].get("src", {}).get("large2x")
#                             or photos[0].get("src", {}).get("large")
#                         )
#                         if url:
#                             print(f"[PEXELS] ✓ Fallback image ({q}): {url}")
#                             return url
#         except Exception:
#             continue
#     print("[PEXELS] ✗ All fallbacks failed")
#     return None


# # ──────────────────────────────────────────────
# # LLM helpers
# # ──────────────────────────────────────────────
# async def generate_embedding(text: str) -> List[float]:
#     if not OPENAI_API_KEY:
#         print("[EMBED] ✗ OPENAI_API_KEY not set — skipping embedding")
#         return []
#     try:
#         print(f"[EMBED] Generating for: '{text[:60]}…'")
#         async with httpx.AsyncClient(timeout=60) as client:
#             res = await client.post(
#                 "https://api.openai.com/v1/embeddings",
#                 headers={
#                     "Authorization": f"Bearer {OPENAI_API_KEY}",
#                     "Content-Type":  "application/json",
#                 },
#                 json={
#                     "model": "text-embedding-3-small",
#                     "input": text,
#                 },
#             )
#             res.raise_for_status()
#             emb = res.json()["data"][0]["embedding"]
#             print(f"[EMBED] ✓ Length: {len(emb)}")
#             return emb
#     except Exception as e:
#         print(f"[EMBED] ✗ {type(e).__name__}: {e}")
#         return []


# # ──────────────────────────────────────────────
# # Vector similarity (cosine) — pure Python
# # ──────────────────────────────────────────────
# def cosine_similarity(a: List[float], b: List[float]) -> float:
#     if not a or not b or len(a) != len(b):
#         return 0.0
#     dot    = sum(x * y for x, y in zip(a, b))
#     norm_a = math.sqrt(sum(x * x for x in a))
#     norm_b = math.sqrt(sum(x * x for x in b))
#     if norm_a == 0.0 or norm_b == 0.0:
#         return 0.0
#     return dot / (norm_a * norm_b)


# async def vector_search_memory(
#     query_text: str,
#     memory_type: str,
#     top_k: int = 10,
#     min_similarity: float = 0.25,
# ) -> List[Dict]:
#     log_sec(f"[VECTOR-SEARCH] type={memory_type} query='{query_text[:60]}' top_k={top_k}")

#     pool = await get_pool()
#     query_vec = await generate_embedding(query_text)

#     async with pool.acquire() as conn:
#         rows = await conn.fetch(
#             """
#             SELECT id, content, payload, embedding, created_at
#             FROM   memory_entries
#             WHERE  type = $1
#             ORDER  BY created_at DESC
#             LIMIT  500
#             """,
#             memory_type,
#         )

#     if not rows:
#         print(f"[VECTOR-SEARCH] No rows found for type={memory_type}")
#         return []

#     if query_vec:
#         scored = []
#         for row in rows:
#             raw = row["embedding"]
#             if isinstance(raw, str):
#                 try:
#                     row_vec = json.loads(raw)
#                 except Exception:
#                     row_vec = []
#             elif isinstance(raw, list):
#                 row_vec = raw
#             else:
#                 row_vec = []

#             sim = cosine_similarity(query_vec, row_vec) if row_vec else 0.0
#             if sim >= min_similarity:
#                 scored.append((sim, row))

#         scored.sort(key=lambda x: x[0], reverse=True)
#         results = [dict(r) for _, r in scored[:top_k]]
#         print(f"[VECTOR-SEARCH] {len(results)} results above similarity {min_similarity}")
#     else:
#         print(f"[VECTOR-SEARCH] No query embedding — falling back to recency order")
#         results = [dict(r) for r in rows[:top_k]]

#     for item in results:
#         if isinstance(item.get("payload"), str):
#             try:
#                 item["payload"] = json.loads(item["payload"])
#             except Exception:
#                 item["payload"] = {}
#         if isinstance(item.get("created_at"), datetime):
#             item["created_at"] = item["created_at"].isoformat()

#     return results


# # ──────────────────────────────────────────────
# # Store design_signal in memory_entries
# # ──────────────────────────────────────────────
# async def store_design_signal_embedding(
#     tag: str,
#     category: Optional[str],
#     vote_score: int,
#     like_score: int,
#     comment_score: int,
#     trend_score: int,
#     total_score: int,
# ):
#     content_text = (
#         f"Design signal: {tag}. "
#         f"Category: {category or 'general'}. "
#         f"Audience engagement — votes: {vote_score}, likes: {like_score}, "
#         f"comments: {comment_score}, trend mentions: {trend_score}. "
#         f"Total score: {total_score}."
#     )

#     embedding = await generate_embedding(content_text)

#     payload = {
#         "tag":           tag,
#         "category":      category,
#         "vote_score":    vote_score,
#         "like_score":    like_score,
#         "comment_score": comment_score,
#         "trend_score":   trend_score,
#         "total_score":   total_score,
#     }

#     pool = await get_pool()
#     async with pool.acquire() as conn:
#         await conn.execute(
#             """
#             DELETE FROM memory_entries
#             WHERE  type = 'design_signal'
#               AND  payload->>'tag' = $1
#             """,
#             tag,
#         )
#         await conn.execute(
#             """
#             INSERT INTO memory_entries (type, content, payload, embedding, created_at)
#             VALUES ($1, $2, $3::jsonb, $4::jsonb, NOW())
#             """,
#             "design_signal",
#             content_text,
#             json.dumps(payload),
#             json.dumps(embedding),
#         )

#     print(f"[EMBED-SIGNAL] ✓ Stored embedding for signal tag='{tag}' score={total_score}")


# # ──────────────────────────────────────────────
# # Store trend in memory_entries
# # ──────────────────────────────────────────────
# async def store_trend_embedding(
#     trend_title: str,
#     trend_description: str,
#     related_tags: List[str],
#     source_articles: List[str],
# ):
#     tag_str = ", ".join(related_tags[:6]) if related_tags else ""
#     content_text = (
#         f"Fashion trend: {trend_title}. "
#         f"{trend_description} "
#         f"Related tags: {tag_str}."
#     )

#     embedding = await generate_embedding(content_text)

#     payload = {
#         "title":           trend_title,
#         "description":     trend_description,
#         "related_tags":    related_tags,
#         "source_articles": source_articles,
#     }

#     pool = await get_pool()
#     async with pool.acquire() as conn:
#         await conn.execute(
#             """
#             INSERT INTO memory_entries (type, content, payload, embedding, created_at)
#             VALUES ($1, $2, $3::jsonb, $4::jsonb, NOW())
#             """,
#             "trend",
#             content_text,
#             json.dumps(payload),
#             json.dumps(embedding),
#         )

#     print(f"[EMBED-TREND] ✓ Stored embedding for trend='{trend_title}'")


# # ──────────────────────────────────────────────
# # FIX D: Single context assembler (reads only from memory/RAG)
# # ──────────────────────────────────────────────
# async def assemble_design_context(
#     query: str = "fashion design trends audience preferences",
#     top_k_signals: int = 10,
#     top_k_trends:  int = 10,
# ) -> Dict[str, Any]:
#     """
#     Authoritative context assembler. Reads ONLY from memory/RAG retrieval
#     outputs — never directly from raw source tables.
#     """
#     log_sec(f"[CONTEXT-ASSEMBLER] Building from memory/RAG — query='{query[:60]}'")

#     signal_rows = await vector_search_memory(
#         query_text=query,
#         memory_type="design_signal",
#         top_k=top_k_signals,
#         min_similarity=0.20,
#     )

#     trend_rows = await vector_search_memory(
#         query_text=query,
#         memory_type="trend",
#         top_k=top_k_trends,
#         min_similarity=0.20,
#     )

#     brief_rows = await vector_search_memory(
#         query_text=query,
#         memory_type="design_brief",
#         top_k=3,
#         min_similarity=0.15,
#     )

#     # Build structured signal summary
#     signals = []
#     signal_lines = []
#     for row in signal_rows:
#         p = row.get("payload") or {}
#         tag           = p.get("tag", row.get("content", "unknown"))
#         category      = p.get("category", "—")
#         total_score   = p.get("total_score", 0)
#         vote_score    = p.get("vote_score", 0)
#         like_score    = p.get("like_score", 0)
#         comment_score = p.get("comment_score", 0)
#         trend_score   = p.get("trend_score", 0)
#         signals.append(p)
#         signal_lines.append(
#             f"  • [{tag}] category={category} | "
#             f"score={total_score} "
#             f"(votes={vote_score}, likes={like_score}, "
#             f"comments={comment_score}, trends={trend_score})"
#         )

#     signal_summary = "\n".join(signal_lines) if signal_lines else "  (no audience signal data available yet)"

#     # Build structured trend summary
#     trends = []
#     trend_lines = []
#     for row in trend_rows:
#         p     = row.get("payload") or {}
#         title = p.get("title", row.get("content", "unknown"))
#         desc  = p.get("description", "")
#         tags  = p.get("related_tags", [])
#         tag_str = ", ".join(tags[:4]) if tags else ""
#         trends.append(p)
#         line = f"  • {title}"
#         if desc:
#             line += f": {desc[:120]}"
#         if tag_str:
#             line += f" [tags: {tag_str}]"
#         trend_lines.append(line)

#     trend_summary = "\n".join(trend_lines) if trend_lines else "  (no trend memory available yet)"

#     # Build brief context
#     brief_context = ""
#     for row in brief_rows:
#         p = row.get("payload") or {}
#         brief_context += p.get("brief_text", row.get("content", "")) + "\n"

#     print(f"[CONTEXT-ASSEMBLER] ✓ {len(signal_rows)} signals | {len(trend_rows)} trends | {len(brief_rows)} briefs")

#     return {
#         "signal_summary":  signal_summary,
#         "trend_summary":   trend_summary,
#         "brief_context":   brief_context.strip(),
#         "signals":         signals,
#         "trends":          trends,
#         "query":           query,
#         "retrieved_at":    datetime.utcnow().isoformat(),
#     }


# # Keep backward-compatible alias
# async def build_design_context_via_vector_search(
#     query: str = "fashion design trends audience preferences",
#     top_k_signals: int = 10,
#     top_k_trends:  int = 10,
# ) -> Dict[str, str]:
#     ctx = await assemble_design_context(query, top_k_signals, top_k_trends)
#     return {
#         "signal_summary": ctx["signal_summary"],
#         "trend_summary":  ctx["trend_summary"],
#     }


# # ──────────────────────────────────────────────
# # FIX C: Feedback Loop Processor
# # ──────────────────────────────────────────────

# # Canonical event type weights
# INTERACTION_EVENT_WEIGHTS: Dict[str, int] = {
#     "blog_comment":     4,
#     "vote_cast":        3,
#     "blog_like":        2,
#     "save_look":        2,
#     "chat_query":       1,
#     "design_view":      1,
#     "paid_feature_use": 5,
# }

# VALID_EVENT_TYPES = set(INTERACTION_EVENT_WEIGHTS.keys())


# async def emit_interaction_event(
#     pool: asyncpg.Pool,
#     event_type: str,
#     entity_id: Optional[str],
#     entity_type: Optional[str],
#     payload: Dict[str, Any],
#     user_id: Optional[int] = None,
# ):
#     """
#     Persist a canonical interaction event. All feedback signals must flow
#     through this function before entering the memory layer.
#     """
#     if event_type not in VALID_EVENT_TYPES:
#         print(f"[EVENT] ⚠ Unknown event_type='{event_type}' — storing anyway")

#     async with pool.acquire() as conn:
#         await conn.execute("""
#             INSERT INTO interaction_events
#                 (event_type, user_id, entity_id, entity_type, payload, created_at)
#             VALUES ($1, $2, $3, $4, $5::jsonb, NOW())
#         """, event_type, user_id, entity_id, entity_type, json.dumps(payload))

#     print(f"[EVENT] ✓ {event_type} | entity={entity_type}:{entity_id} | user={user_id}")


# async def run_feedback_loop_processor(pool: asyncpg.Pool):
#     """
#     FIX C: Reads canonical interaction_events, transforms them into
#     normalized design signals, and inserts into memory_entries.
#     No longer bypasses the event schema.
#     """
#     log_sec(f"[FEEDBACK-LOOP] Processing interaction events → memory — {datetime.utcnow().isoformat()}Z")

#     async with pool.acquire() as conn:
#         # Section 4 closed loop: only pull events not yet processed (processed_at IS NULL).
#         # This prevents double-counting and makes this the ONE authoritative pipeline.
#         event_rows = await conn.fetch("""
#             SELECT id, event_type, entity_id, entity_type, payload, created_at
#             FROM interaction_events
#             WHERE processed_at IS NULL
#             ORDER BY created_at ASC
#         """)

#         # Pull existing design signals for tag → category mapping
#         signal_rows = await conn.fetch("""
#             SELECT DISTINCT ON (tag) tag, category FROM design_signals ORDER BY tag, computed_at DESC
#         """)

#     tag_categories: Dict[str, str] = {r["tag"]: r["category"] for r in signal_rows}
#     tag_scores: Dict[str, Dict[str, int]] = {}

#     for evt in event_rows:
#         evt_type = evt["event_type"]
#         weight   = INTERACTION_EVENT_WEIGHTS.get(evt_type, 1)
#         payload  = evt["payload"] or {}

#         if isinstance(payload, str):
#             try:
#                 payload = json.loads(payload)
#             except Exception:
#                 payload = {}

#         # Bug 1 fix: COALESCE tags OR related_tags from payload
#         tags = payload.get("tags", [])
#         if isinstance(tags, str):
#             try:
#                 tags = json.loads(tags)
#             except Exception:
#                 tags = [tags]

#         if not tags:
#             tags = payload.get("related_tags", [])
#         if isinstance(tags, str):
#             try:
#                 tags = json.loads(tags)
#             except Exception:
#                 tags = [tags]

#         if not tags and evt.get("entity_type") == "design":
#             tags = payload.get("top_tags", [])

#         for tag in tags:
#             if not tag:
#                 continue
#             if tag not in tag_scores:
#                 tag_scores[tag] = {
#                     "vote_score": 0, "like_score": 0,
#                     "comment_score": 0, "trend_score": 0,
#                 }
#             if evt_type == "vote_cast":
#                 tag_scores[tag]["vote_score"] += weight
#             elif evt_type in ("blog_like", "save_look"):
#                 tag_scores[tag]["like_score"] += weight
#             elif evt_type == "blog_comment":
#                 tag_scores[tag]["comment_score"] += weight
#             elif evt_type == "chat_query":
#                 tag_scores[tag]["trend_score"] += weight
#             else:
#                 tag_scores[tag]["trend_score"] += weight

#     count = 0
#     pool = await get_pool()
#     for tag, scores in tag_scores.items():
#         total = sum(scores.values())
#         category = tag_categories.get(tag)
#         try:
#             # FIX C: Single normalized pipeline — write to BOTH memory_entries (RAG)
#             # AND design_signals (the authoritative signal table), removing dual-rail.
#             await store_design_signal_embedding(
#                 tag=tag,
#                 category=category,
#                 vote_score=scores["vote_score"],
#                 like_score=scores["like_score"],
#                 comment_score=scores["comment_score"],
#                 trend_score=scores["trend_score"],
#                 total_score=total,
#             )
#             # Upsert into design_signals so the entire system reads from this one path
#             async with pool.acquire() as conn:
#                 await conn.execute("""
#                     INSERT INTO design_signals
#                         (tag, category, vote_score, like_score, comment_score, trend_score, total_score, computed_at)
#                     VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
#                     ON CONFLICT (tag) DO UPDATE SET
#                         category      = COALESCE(EXCLUDED.category, design_signals.category),
#                         vote_score    = design_signals.vote_score    + EXCLUDED.vote_score,
#                         like_score    = design_signals.like_score    + EXCLUDED.like_score,
#                         comment_score = design_signals.comment_score + EXCLUDED.comment_score,
#                         trend_score   = design_signals.trend_score   + EXCLUDED.trend_score,
#                         total_score   = design_signals.total_score   + EXCLUDED.total_score,
#                         computed_at   = NOW()
#                 """,
#                     tag, category,
#                     scores["vote_score"], scores["like_score"],
#                     scores["comment_score"], scores["trend_score"],
#                     total,
#                 )
#             count += 1
#         except Exception as e:
#             print(f"[FEEDBACK-LOOP] ✗ tag={tag}: {e}")

#     # Mark all processed events so they are not double-counted on next run
#     if event_rows:
#         processed_ids = [r["id"] for r in event_rows]
#         try:
#             async with pool.acquire() as conn:
#                 await conn.execute(
#                     "UPDATE interaction_events SET processed_at = NOW() WHERE id = ANY($1::bigint[])",
#                     processed_ids,
#                 )
#             print(f"[FEEDBACK-LOOP] ✓ Marked {len(processed_ids)} events as processed")
#         except Exception as mark_err:
#             print(f"[FEEDBACK-LOOP] ⚠ Failed to mark events processed: {mark_err}")

#     print(f"[FEEDBACK-LOOP] ✓ Processed {len(event_rows)} events → {count} memory signals updated (single normalized pipeline)")
#     return {"events_processed": len(event_rows), "signals_updated": count}


# # ──────────────────────────────────────────────
# # Article rewrite prompt builder
# # ──────────────────────────────────────────────
# def build_rewrite_prompt(title: str, content: str) -> str:
#     prompt = f"""You are a professional fashion editor writing for a high-end fashion magazine.

# Below is an original fashion article. Your task is to rewrite the body content in a fresh, engaging editorial voice.

# ORIGINAL TITLE: {title}

# ORIGINAL CONTENT:
# {content[:3000]}

# Rules:
# - DO NOT include a TITLE field in your response — the title is handled separately and must not be changed
# - Rewrite the body content completely in your own editorial voice
# - Minimum 400 words for the body
# - Use paragraphs, no bullet points
# - Extract 3 relevant fashion trends mentioned or implied in the article
# - Suggest a Pexels image search query based on the article topic

# Respond in EXACTLY this format (no TITLE field):

# EXCERPT: <2-sentence summary of the article>
# TAGS: <tag1>, <tag2>, <tag3>, <tag4>, <tag5>
# BODY: <rewritten article body, minimum 400 words>
# TRENDS: <TrendName1>:<one sentence description>, <TrendName2>:<one sentence description>, <TrendName3>:<one sentence description>
# IMAGE_QUERY: <3-5 word phrase describing the ideal cover image>
# """
#     print(f"[PROMPT] Built rewrite prompt — {len(prompt)} chars | title: {repr(title[:60])}")
#     return prompt


# # ──────────────────────────────────────────────
# # AI Comment generation
# # ──────────────────────────────────────────────
# async def generate_and_store_article_comments(
#     article_id: int,
#     article_title: str,
#     article_content: str,
#     pool: asyncpg.Pool,
# ):
#     if not OPENAI_API_KEY:
#         print(f"[AI-COMMENTS] ✗ OPENAI_API_KEY not set — skipping comment generation for article {article_id}")
#         return

#     count = random.choice([3, 4, 4, 5, 5, 6, 7, 8, 9, 10, 11, 12])
#     handles = [_generate_forum_handle() for _ in range(count)]

#     time_labels = [
#         "just now", "2 minutes ago", "8 minutes ago", "23 minutes ago",
#         "an hour ago", "3 hours ago", "yesterday", "2 days ago",
#         "3 days ago", "4 days ago", "5 days ago", "a week ago",
#     ]

#     system_prompt = """You write comments for a fashion/lifestyle blog. They must feel 100% written by real people from forums like Reddit, StyleForum, or Fashionista comments sections.

# Rules:
# - Sound completely human — varied sentence lengths, casual phrasing, first-person opinions
# - Mix tones: some casual, some thoughtful, some skeptical, some enthusiastic, some personal
# - Some comments can be short (1 sentence), some longer (3-4 sentences)
# - Reference specific details from the article when it makes sense
# - Avoid AI clichés: never say "This article really resonated", "Great read!", "As someone who...", "I completely agree"
# - Some commenters can be slightly skeptical, ask a question, or share a personal anecdote
# - Natural punctuation — people omit commas, use ellipses, write in fragments sometimes
# - Do NOT sound like marketing copy or a PR response
# - Vary the topics within fashion: some talk about price, some about personal style, some about trends, some about where to buy

# Return ONLY valid JSON — no markdown, no backticks, no preamble.
# Format: {"comments": [{"text": "...", "time": "..."}, ...]}"""

#     user_prompt = f"""Article title: "{article_title}"

# Content excerpt:
# {article_content[:1400]}

# Generate exactly {count} comments from different types of real readers.
# Assign these time labels in order to each comment: {json.dumps(time_labels[:count])}

# Return JSON only."""

#     try:
#         async with httpx.AsyncClient(timeout=45) as client:
#             res = await client.post(
#                 "https://api.openai.com/v1/chat/completions",
#                 headers={
#                     "Authorization": f"Bearer {OPENAI_API_KEY}",
#                     "Content-Type":  "application/json",
#                 },
#                 json={
#                     "model":           "gpt-4o-mini",
#                     "temperature":     0.95,
#                     "max_tokens":      1000,
#                     "response_format": {"type": "json_object"},
#                     "messages": [
#                         {"role": "system", "content": system_prompt},
#                         {"role": "user",   "content": user_prompt},
#                     ],
#                 }
#             )
#         res.raise_for_status()
#         raw = res.json()["choices"][0]["message"]["content"].strip()

#         parsed   = json.loads(raw)
#         comments = parsed.get("comments", []) if isinstance(parsed, dict) else parsed
#         if not isinstance(comments, list):
#             comments = []

#         saved_count = 0
#         async with pool.acquire() as conn:
#             for i, c in enumerate(comments[:count]):
#                 handle = handles[i] if i < len(handles) else _generate_forum_handle()
#                 text   = (c.get("text") or "").strip()
#                 time_  = c.get("time") or time_labels[i % len(time_labels)]
#                 if not text:
#                     continue
#                 try:
#                     await conn.execute("""
#                         INSERT INTO ai_comments (article_id, user_name, text, time_label)
#                         VALUES ($1, $2, $3, $4)
#                         ON CONFLICT (article_id, user_name, text) DO NOTHING
#                     """, article_id, handle, text, time_)
#                     saved_count += 1
#                 except Exception as insert_err:
#                     print(f"[AI-COMMENTS] ✗ Insert error for article {article_id}: {insert_err}")

#         print(f"[AI-COMMENTS] ✓ Generated and stored {saved_count} comments for article {article_id}")

#     except json.JSONDecodeError as e:
#         print(f"[AI-COMMENTS] ✗ JSON parse error for article {article_id}: {e}")
#     except Exception as e:
#         print(f"[AI-COMMENTS] ✗ Failed for article {article_id}: {type(e).__name__}: {e}")


# # ──────────────────────────────────────────────
# # Rewrite a single scraped article with AI and save to DB
# # ──────────────────────────────────────────────
# async def rewrite_article_content(article: Dict) -> Optional[Dict]:
#     title   = article.get("title", "").strip()
#     content = article.get("content", "").strip()
#     url     = article.get("url", "")
#     source  = article.get("source", "")

#     if not title or len(content) < 200:
#         print(f"[REWRITE] ✗ Skipping — title empty or content too short ({len(content)} chars): {url}")
#         return None

#     print(f"\n[REWRITE] Processing: {repr(title[:70])}")
#     print(f"[REWRITE] Source URL: {url}")
#     prompt = build_rewrite_prompt(title, content)

#     try:
#         text = await call_openai(prompt)
#     except Exception as e:
#         print(f"[REWRITE] ✗ OpenAI failed: {type(e).__name__}: {e}")
#         return None

#     parsed = parse_llm_response(text)
#     parsed["title"] = title
#     print(f"[REWRITE] ✓ Title locked to source: {repr(title[:70])}")

#     body_ok = len(parsed.get("body", "")) >= 400
#     if not body_ok:
#         print(f"[REWRITE] ✗ Body too short ({len(parsed.get('body',''))} chars) for: {repr(title[:60])}")
#         return None

#     image_url = None

#     playwright_image = article.get("source_image")
#     if playwright_image and playwright_image.startswith("http"):
#         image_url = playwright_image
#         print(f"[REWRITE] ✓ Using Playwright source image: {image_url[:100]}")

#     if not image_url:
#         raw_html   = article.get("html")
#         source_url = article.get("url", "")
#         if raw_html or source_url:
#             print(f"[REWRITE] Attempting HTML image extraction for: {source_url[:80]}")
#             image_url = await extract_article_image(source_url, raw_html)
#             if image_url:
#                 print(f"[REWRITE] ✓ Using HTML-extracted source image: {image_url[:100]}")

#     if not image_url:
#         print(f"[REWRITE] ✗ No source image found — falling back to Pexels")
#         image_query = parsed.get("image_query") or title
#         image_url   = await fetch_pexels_image(image_query)
#         if not image_url and parsed.get("tags"):
#             image_url = await fetch_pexels_image(parsed["tags"][0])
#         if image_url:
#             print(f"[REWRITE] ✓ Pexels fallback image: {image_url[:100]}")
#         else:
#             print(f"[REWRITE] ✗ All image sources exhausted — article will have no image")

#     print(f"[REWRITE] Final image_url: {image_url}")

#     slug = re.sub(r"[^a-z0-9 ]", "", title.lower())
#     slug = re.sub(r"\s+", "-", slug) + f"-{int(datetime.now().timestamp())}"

#     article_urls = [url]
#     sources      = [source]

#     pool = await get_pool()
#     article_db_id = None

#     async with pool.acquire() as conn:
#         row = await conn.fetchrow("""
#             INSERT INTO blog_articles
#                 (slug, title, excerpt, body, image_url, tags, trends, article_urls, sources, created_at)
#             VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8::jsonb, $9::jsonb, NOW())
#             ON CONFLICT (slug) DO NOTHING
#             RETURNING id
#         """,
#             slug,
#             parsed["title"],
#             parsed.get("excerpt", ""),
#             parsed["body"],
#             image_url,
#             json.dumps(parsed.get("tags", [])),
#             json.dumps(parsed.get("trends", [])),
#             json.dumps(article_urls),
#             json.dumps(sources),
#         )
#         if row:
#             article_db_id = row["id"]

#     print(f"[REWRITE] ✓ Saved — slug: {slug} | title: {repr(parsed['title'][:70])}")

#     if article_db_id:
#         await generate_and_store_article_comments(
#             article_id=article_db_id,
#             article_title=parsed["title"],
#             article_content=parsed["body"],
#             pool=pool,
#         )
#     else:
#         print(f"[REWRITE] ⚠ Article already existed (slug conflict) — skipping comment generation")

#     for trend in parsed.get("trends", []):
#         if not trend.get("title"):
#             continue
#         async with pool.acquire() as conn:
#             await conn.execute("""
#                 INSERT INTO trends (title, description, related_tags, source_articles, created_at)
#                 VALUES ($1, $2, $3::jsonb, $4::jsonb, NOW())
#             """,
#                 trend["title"],
#                 trend.get("description", ""),
#                 json.dumps(parsed.get("tags", [])),
#                 json.dumps(article_urls),
#             )
#         print(f"[REWRITE] ✓ Trend saved: '{trend['title']}'")
#         await store_trend_embedding(
#             trend_title=trend["title"],
#             trend_description=trend.get("description", ""),
#             related_tags=parsed.get("tags", []),
#             source_articles=article_urls,
#         )

#     return {**parsed, "slug": slug, "articleUrls": article_urls, "sources": sources, "image_url": image_url}


# def parse_llm_response(text: str) -> Dict:
#     log_sec("PARSING LLM RESPONSE")
#     print(f"[PARSE] Response: {len(text)} chars")
#     print(f"[PARSE] First 400 chars:\n{text[:400]}\n")

#     excerpt     = (re.search(r"^EXCERPT:\s*(.+)",                         text, re.I | re.M) or [None, ""])[1].strip()
#     tags_raw    = (re.search(r"^TAGS:\s*(.+)",                            text, re.I | re.M) or [None, ""])[1].strip()
#     body        = (re.search(r"BODY:\s*([\s\S]*?)(?=\nTRENDS:|$)",        text, re.I)        or [None, ""])[1].strip()
#     trends_raw  = (re.search(r"TRENDS:\s*([\s\S]*?)(?=\nIMAGE_QUERY:|$)", text, re.I)        or [None, ""])[1].strip()
#     image_query = (re.search(r"^IMAGE_QUERY:\s*(.+)",                     text, re.I | re.M) or [None, ""])[1].strip()

#     tags   = [t.strip() for t in tags_raw.split(",") if t.strip()]
#     trends = []
#     for item in re.split(r",\s*(?=[A-Z])", trends_raw):
#         if ":" in item:
#             parts = item.split(":", 1)
#             trends.append({"title": parts[0].strip(), "description": parts[1].strip()})

#     print(f"[PARSE] excerpt     : {repr(excerpt[:80])}")
#     print(f"[PARSE] tags        : {tags}")
#     print(f"[PARSE] body len    : {len(body)} chars")
#     print(f"[PARSE] trends      : {[t['title'] for t in trends]}")
#     print(f"[PARSE] image_query : {repr(image_query)}")
#     return {
#         "title":        "",
#         "excerpt":      excerpt,
#         "tags":         tags,
#         "body":         body,
#         "trends":       trends,
#         "image_query":  image_query,
#     }


# async def call_openai(prompt: str) -> str:
#     if not OPENAI_API_KEY:
#         raise RuntimeError("OPENAI_API_KEY is not set in .env")

#     print("[OPENAI] Calling gpt-4o-mini…")
#     async with httpx.AsyncClient(timeout=120) as client:
#         res = await client.post(
#             "https://api.openai.com/v1/chat/completions",
#             headers={
#                 "Authorization": f"Bearer {OPENAI_API_KEY}",
#                 "Content-Type":  "application/json",
#             },
#             json={
#                 "model":       "gpt-4o-mini",
#                 "max_tokens":  4096,
#                 "temperature": 0.7,
#                 "messages": [
#                     {
#                         "role":    "system",
#                         "content": "You are a professional fashion editor writing for a high-end fashion magazine.",
#                     },
#                     {
#                         "role":    "user",
#                         "content": prompt,
#                     },
#                 ],
#             },
#         )

#     print(f"[OPENAI] HTTP {res.status_code}")
#     if res.status_code != 200:
#         print(f"[OPENAI] ✗ Error body: {res.text[:400]}")
#         res.raise_for_status()

#     data   = res.json()
#     finish = data["choices"][0].get("finish_reason", "unknown")
#     text   = data["choices"][0]["message"]["content"]
#     usage  = data.get("usage", {})
#     print(f"[OPENAI] finish_reason : {finish}")
#     print(f"[OPENAI] tokens used   : {usage}")
#     print(f"[OPENAI] Response len  : {len(text)} chars")
#     return text


# # ──────────────────────────────────────────────
# # Article generation
# # ──────────────────────────────────────────────
# async def generate_article(articles: List[Dict]):
#     log_sep("ARTICLE GENERATION — PER-ARTICLE REWRITE MODE")
#     print(f"[GEN] Articles to process: {len(articles)}")

#     if not articles:
#         print(f"[GEN] ✗ No articles to process. Aborting.")
#         return None

#     results = []
#     for i, article in enumerate(articles, 1):
#         print(f"\n[GEN] ── [{i}/{len(articles)}] {article.get('url', 'no-url')}")
#         print(f"[GEN]    Title: {repr(article.get('title', '')[:70])}")
#         result = await rewrite_article_content(article)
#         if result:
#             results.append(result)
#             print(f"[GEN] ✓ Article {i} saved: {result['slug']}")
#         else:
#             print(f"[GEN] ✗ Article {i} skipped (rewrite failed or too short)")

#     print(f"\n[GEN] Done — {len(results)}/{len(articles)} articles successfully rewritten and saved")

#     return results[-1] if results else None


# # ──────────────────────────────────────────────
# # Preference-driven proxy voting helpers
# # ──────────────────────────────────────────────
# async def get_or_create_proxy_preferences(pool: asyncpg.Pool, user_id: int) -> Dict[str, float]:
#     """Load user's proxy voting preferences or return defaults."""
#     async with pool.acquire() as conn:
#         row = await conn.fetchrow(
#             "SELECT * FROM proxy_preferences WHERE user_id = $1",
#             user_id
#         )
    
#     if row:
#         # Extract all preference columns
#         return {
#             "aesthetic_minimalist_weight": row["aesthetic_minimalist_weight"],
#             "aesthetic_bold_weight": row["aesthetic_bold_weight"],
#             "aesthetic_eclectic_weight": row["aesthetic_eclectic_weight"],
#             "material_luxury_weight": row["material_luxury_weight"],
#             "material_sustainable_weight": row["material_sustainable_weight"],
#             "material_experimental_weight": row["material_experimental_weight"],
#             "silhouette_fitted_weight": row["silhouette_fitted_weight"],
#             "silhouette_relaxed_weight": row["silhouette_relaxed_weight"],
#             "silhouette_structured_weight": row["silhouette_structured_weight"],
#             "design_classic_weight": row["design_classic_weight"],
#             "design_trendy_weight": row["design_trendy_weight"],
#             "design_avant_garde_weight": row["design_avant_garde_weight"],
#             "category_apparel_weight": row["category_apparel_weight"],
#             "category_accessories_weight": row["category_accessories_weight"],
#             "category_footwear_weight": row["category_footwear_weight"],
#             "category_jewelry_weight": row["category_jewelry_weight"],
#         }
    
#     # Return defaults (all 50.0)
#     return {
#         "aesthetic_minimalist_weight": 50.0,
#         "aesthetic_bold_weight": 50.0,
#         "aesthetic_eclectic_weight": 50.0,
#         "material_luxury_weight": 50.0,
#         "material_sustainable_weight": 50.0,
#         "material_experimental_weight": 50.0,
#         "silhouette_fitted_weight": 50.0,
#         "silhouette_relaxed_weight": 50.0,
#         "silhouette_structured_weight": 50.0,
#         "design_classic_weight": 50.0,
#         "design_trendy_weight": 50.0,
#         "design_avant_garde_weight": 50.0,
#         "category_apparel_weight": 50.0,
#         "category_accessories_weight": 50.0,
#         "category_footwear_weight": 50.0,
#         "category_jewelry_weight": 50.0,
#     }


# async def compute_preference_score(
#     product: Dict,
#     preferences: Dict[str, float],
#     user_history: Dict,
# ) -> Dict[str, Any]:
#     """
#     Deterministic preference scoring for proxy voting.
    
#     Returns: {
#         'preference_score': float,  # Score from explicit preferences
#         'matched_preferences': [str],  # Which preferences matched
#         'boosted_by': [str],  # Boost reasons
#     }
#     """
#     score = 0.0
#     matched_prefs = []
#     boosted_by = []
    
#     # Get product category
#     category = product.get("category", "").lower()
#     if category == "apparel":
#         score += preferences.get("category_apparel_weight", 50.0)
#         matched_prefs.append(f"category:apparel({preferences.get('category_apparel_weight', 50.0)})")
#     elif category == "accessories":
#         score += preferences.get("category_accessories_weight", 50.0)
#         matched_prefs.append(f"category:accessories({preferences.get('category_accessories_weight', 50.0)})")
#     elif category == "footwear":
#         score += preferences.get("category_footwear_weight", 50.0)
#         matched_prefs.append(f"category:footwear({preferences.get('category_footwear_weight', 50.0)})")
#     elif category == "jewelry":
#         score += preferences.get("category_jewelry_weight", 50.0)
#         matched_prefs.append(f"category:jewelry({preferences.get('category_jewelry_weight', 50.0)})")
    
#     # Get product tags
#     product_tags = json.loads(product.get("tags", "[]")) if isinstance(product.get("tags"), str) else product.get("tags", [])
#     product_tags = [str(t).lower() for t in product_tags]
    
#     # Match tags to preference categories
#     aesthetic_matches = 0
#     for tag in product_tags:
#         if any(x in tag for x in ["minimal", "clean", "simple"]):
#             score += preferences.get("aesthetic_minimalist_weight", 50.0) * 0.3
#             aesthetic_matches += 1
#         elif any(x in tag for x in ["bold", "dramatic", "eye-catching"]):
#             score += preferences.get("aesthetic_bold_weight", 50.0) * 0.3
#             aesthetic_matches += 1
#         elif any(x in tag for x in ["eclectic", "mixed", "fusion"]):
#             score += preferences.get("aesthetic_eclectic_weight", 50.0) * 0.3
#             aesthetic_matches += 1
    
#     if aesthetic_matches > 0:
#         matched_prefs.append(f"aesthetic_matches:{aesthetic_matches}")
#         boosted_by.append("aesthetic_preference_match")
    
#     material_matches = 0
#     for tag in product_tags:
#         if any(x in tag for x in ["silk", "leather", "cashmere", "wool", "premium"]):
#             score += preferences.get("material_luxury_weight", 50.0) * 0.2
#             material_matches += 1
#         elif any(x in tag for x in ["organic", "sustainable", "eco", "ethical"]):
#             score += preferences.get("material_sustainable_weight", 50.0) * 0.2
#             material_matches += 1
#         elif any(x in tag for x in ["innovate", "experimental", "novel"]):
#             score += preferences.get("material_experimental_weight", 50.0) * 0.2
#             material_matches += 1
    
#     if material_matches > 0:
#         matched_prefs.append(f"material_matches:{material_matches}")
#         boosted_by.append("material_preference_match")
    
#     # Normalize score
#     score = min(max(score, 0.0), 300.0)  # Cap at reasonable max
    
#     return {
#         "preference_score": score,
#         "matched_preferences": matched_prefs,
#         "boosted_by": boosted_by,
#     }


# async def store_vote_explanation(
#     pool: asyncpg.Pool,
#     vote_id: int,
#     user_id: int,
#     product_id: str,
#     explanation: Dict[str, Any],
# ) -> None:
#     """Store explanation metadata for a proxy vote (FIX F: persist full JSON too)."""
#     try:
#         async with pool.acquire() as conn:
#             await conn.execute("""
#                 INSERT INTO proxy_vote_explanations (
#                     vote_id, product_id, user_id,
#                     preference_score, history_score, combined_score,
#                     matched_preferences, matched_tags, boosted_by,
#                     penalty_applied, tie_break_reason, score_computation_method,
#                     full_explanation_json, created_at
#                 )
#                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb, NOW())
#             """,
#                 vote_id,
#                 product_id,
#                 user_id,
#                 explanation.get("preference_score", 0.0),
#                 explanation.get("history_score", 0.0),
#                 explanation.get("combined_score", 0.0),
#                 explanation.get("matched_preferences", []),
#                 explanation.get("matched_tags", []),
#                 explanation.get("boosted_by", []),
#                 explanation.get("penalty_applied"),
#                 explanation.get("tie_break_reason"),
#                 explanation.get("score_computation_method", "unknown"),
#                 json.dumps(explanation),
#             )
#     except Exception as e:
#         print(f"[PROXY-JOB] ⚠️  Failed to store vote explanation: {e}")


# # ──────────────────────────────────────────────
# # Proxy Voting Agent Job
# # ──────────────────────────────────────────────
# async def run_proxy_voting_job():
#     log_sep(f"PROXY VOTING JOB — {datetime.utcnow().isoformat()}Z")

#     pool = await get_pool()

#     async with pool.acquire() as conn:
#         print("\n[DEBUG] Fetching ALL users in proxy settings...")
#         all_users = await conn.fetch("""
#             SELECT user_id, enabled, next_run_at, NOW() as now
#             FROM user_proxy_settings
#         """)
#         for u in all_users:
#             print(f"[DEBUG] user_id={u['user_id']} | enabled={u['enabled']} | next_run_at={u['next_run_at']} | now={u['now']}")

#         print("\n[DEBUG] Fetching DUE users...")
#         due_users = await conn.fetch("""
#             SELECT user_id, next_run_at, NOW() as now
#             FROM user_proxy_settings
#             WHERE enabled = TRUE
#               AND (next_run_at IS NULL OR next_run_at <= NOW())
#         """)
#         for u in due_users:
#             print(f"[DEBUG] ✅ DUE user_id={u['user_id']} | next_run_at={u['next_run_at']} | now={u['now']}")

#     if not due_users:
#         print("[PROXY-JOB] No users due for proxy voting today.")
#         return

#     print(f"[PROXY-JOB] {len(due_users)} user(s) due for a proxy vote")

#     for row in due_users:
#         user_id = row["user_id"]
#         print(f"\n[PROXY-JOB] ── user_id={user_id} ──────────────────────")

#         async with pool.acquire() as conn:
#             voted_rows = await conn.fetch("""
#                 SELECT pc.item_id, pc.category, pc.tags
#                 FROM item_votes iv
#                 JOIN product_catalog pc ON pc.item_id = iv.item_id
#                 WHERE iv.user_id = $1
#             """, user_id)

#             print(f"[DEBUG] voted_rows count = {len(voted_rows)}")

#             unvoted_rows = await conn.fetch("""
#                 SELECT pc.item_id, pc.name, pc.category, pc.tags
#                 FROM product_catalog pc
#                 WHERE pc.item_id NOT IN (
#                     SELECT item_id FROM item_votes WHERE user_id = $1
#                 )
#             """, user_id)

#             print(f"[DEBUG] unvoted_rows count = {len(unvoted_rows)}")

#         if not unvoted_rows:
#             print(f"[PROXY-JOB] user_id={user_id} — voted on everything already, skipping")
#             async with pool.acquire() as conn:
#                 await conn.execute(f"""
#                     UPDATE user_proxy_settings
#                     SET last_run_at = NOW(),
#                         next_run_at = NOW() + INTERVAL '{PROXY_VOTE_INTERVAL_MINUTES} minutes',
#                         updated_at  = NOW()
#                     WHERE user_id = $1
#                 """, user_id)
#             continue

#         # Load user's preference profile for deterministic scoring
#         preferences = await get_or_create_proxy_preferences(pool, user_id)
        
#         # Build history-based signal
#         history_signal = {}
#         if voted_rows:
#             from collections import Counter
#             category_counter: Counter = Counter()
#             tag_counter:      Counter = Counter()
            
#             for r in voted_rows:
#                 if r["category"]:
#                     category_counter[r["category"]] += 1
#                 tags = json.loads(r["tags"]) if r["tags"] else []
#                 for tag in tags:
#                     tag_counter[tag] += 1
            
#             history_signal = {
#                 "category_counter": dict(category_counter),
#                 "tag_counter": dict(tag_counter),
#             }
        
#         # Score all unvoted products using combination of preferences + history
#         scored_products = []
#         for product in unvoted_rows:
#             # Get preference score
#             pref_result = await compute_preference_score(product, preferences, history_signal)
#             preference_score = pref_result["preference_score"]
            
#             # Get history score (if available)
#             history_score = 0.0
#             if history_signal:
#                 cat = product.get("category")
#                 if cat and cat in history_signal.get("category_counter", {}):
#                     history_score += history_signal["category_counter"][cat] * 3
#                 p_tags = json.loads(product.get("tags", "[]")) if isinstance(product.get("tags"), str) else product.get("tags", [])
#                 for tag in p_tags:
#                     if tag in history_signal.get("tag_counter", {}):
#                         history_score += history_signal["tag_counter"][tag]
            
#             # Combined score (70% preference, 30% history)
#             combined_score = (preference_score * 0.7) + (history_score * 0.3)
            
#             scored_products.append({
#                 "product": product,
#                 "preference_score": preference_score,
#                 "history_score": history_score,
#                 "combined_score": combined_score,
#                 "matched_preferences": pref_result.get("matched_preferences", []),
#                 "boosted_by": pref_result.get("boosted_by", []),
#             })
        
#         # Sort by combined score (descending)
#         scored_products.sort(key=lambda x: x["combined_score"], reverse=True)
        
#         # Select top product or tie-break
#         top_product_data = scored_products[0]
#         chosen = top_product_data["product"]
        
#         if top_product_data["combined_score"] == 0:
#             # No preferences match — random fallback
#             chosen = random.choice(unvoted_rows)
#             computation_method = "random_fallback"
#             reason = "random (no preference or history match)"
#             tie_break_reason = "no matching preferences or history"
#         elif len([p for p in scored_products if p["combined_score"] == top_product_data["combined_score"]]) > 1:
#             # Tie-break: deterministic selection by item_id (stable)
#             tied_products = [p for p in scored_products if p["combined_score"] == top_product_data["combined_score"]]
#             tied_products.sort(key=lambda x: x["product"]["item_id"])
#             chosen = tied_products[0]["product"]
#             computation_method = "preference-driven_with_tiebreak"
#             reason = f"preference-driven (score={top_product_data['combined_score']:.1f}), tie-break by item_id"
#             tie_break_reason = f"tied {len(tied_products)} products at score {top_product_data['combined_score']:.1f}"
#         else:
#             # Clear winner
#             computation_method = "preference-driven"
#             reason = f"preference-driven (score={top_product_data['combined_score']:.1f})"
#             tie_break_reason = None

#         chosen_id   = chosen["item_id"]
#         chosen_name = chosen["name"]
#         print(f"[PROXY-JOB] → Voting on '{chosen_name}' (id={chosen_id}) | reason: {reason}")

#         async with pool.acquire() as conn:
#             try:
#                 # Build explanation summary for the item_votes row (Section 5 requirement)
#                 vote_explanation_summary = {
#                     "method":             "proxy",
#                     "preference_score":   top_product_data.get("preference_score", 0.0),
#                     "history_score":      top_product_data.get("history_score", 0.0),
#                     "combined_score":     top_product_data.get("combined_score", 0.0),
#                     "score_method":       top_product_data.get("score_computation_method", "preference-driven"),
#                     "matched_preferences": top_product_data.get("matched_preferences", []),
#                     "boosted_by":         top_product_data.get("boosted_by", []),
#                     "reason":             reason,
#                 }

#                 # Insert vote — also write explanation JSON to item_votes row
#                 vote_row = await conn.fetchrow("""
#                     INSERT INTO item_votes (item_id, user_id, vote_explanation)
#                     VALUES ($1, $2, $3::jsonb)
#                     ON CONFLICT (item_id, user_id) DO NOTHING
#                     RETURNING id
#                 """, chosen_id, user_id, json.dumps(vote_explanation_summary))
                
#                 vote_id = vote_row["id"] if vote_row else None

#                 # Update proxy settings for next run
#                 await conn.execute(f"""
#                     UPDATE user_proxy_settings
#                     SET last_run_at = NOW(),
#                         next_run_at = NOW() + INTERVAL '{PROXY_VOTE_INTERVAL_MINUTES} minutes',
#                         updated_at  = NOW()
#                     WHERE user_id = $1
#                 """, user_id)

#                 print(f"[PROXY-JOB] ✓ user_id={user_id} proxy vote cast on '{chosen_name}' (vote_id={vote_id})")

#                 # Store explanation metadata for audit/debug
#                 if vote_id:
#                     explanation = {
#                         "preference_score": top_product_data.get("preference_score", 0.0),
#                         "history_score": top_product_data.get("history_score", 0.0),
#                         "combined_score": top_product_data.get("combined_score", 0.0),
#                         "matched_preferences": top_product_data.get("matched_preferences", []),
#                         "matched_tags": json.loads(chosen.get("tags", "[]")) if isinstance(chosen.get("tags"), str) else chosen.get("tags", []),
#                         "boosted_by": top_product_data.get("boosted_by", []),
#                         "penalty_applied": None,
#                         "tie_break_reason": tie_break_reason,
#                         "score_computation_method": computation_method,
#                     }
#                     await store_vote_explanation(pool, vote_id, user_id, chosen_id, explanation)

#                 # Emit canonical interaction event for the proxy vote
#                 await emit_interaction_event(
#                     pool=pool,
#                     event_type="vote_cast",
#                     entity_id=chosen_id,
#                     entity_type="product",
#                     payload={"proxy": True, "computation_method": computation_method},
#                     user_id=user_id,
#                 )

#             except Exception as e:
#                 print(f"[PROXY-JOB] ✗ user_id={user_id} failed: {type(e).__name__}: {e}")


# # ══════════════════════════════════════════════════════════════════════════════
# # CYCLE INTEGRITY AGENT
# # ══════════════════════════════════════════════════════════════════════════════

# CIA_GATES = [
#     "trend_data_exists",
#     "design_brief_ready",
#     "designs_generated",
#     "vision_scoring_complete",
#     "showroom_published",
#     "voting_captured",
#     "feedback_captured",
# ]


# async def _get_active_cycle_number(pool: asyncpg.Pool) -> int:
#     async with pool.acquire() as conn:
#         row = await conn.fetchrow("""
#             SELECT cycle_number FROM design_cycles
#             WHERE completed_at IS NULL
#             ORDER BY cycle_number DESC
#             LIMIT 1
#         """)
#     return row["cycle_number"] if row else 0


# async def _cia_check_trend_data(pool: asyncpg.Pool, cycle_number: int) -> Dict:
#     async with pool.acquire() as conn:
#         trend_count  = await conn.fetchval("SELECT COUNT(*) FROM trends")
#         signal_count = await conn.fetchval("SELECT COUNT(DISTINCT tag) FROM design_signals")
#     passed = (trend_count or 0) >= CIA_MIN_TRENDS
#     return {
#         "passed":       passed,
#         "trend_count":  int(trend_count  or 0),
#         "signal_count": int(signal_count or 0),
#         "required":     CIA_MIN_TRENDS,
#         "note":         f"{trend_count} trends found (need {CIA_MIN_TRENDS})",
#     }


# async def _cia_check_design_brief(pool: asyncpg.Pool, cycle_number: int) -> Dict:
#     async with pool.acquire() as conn:
#         brief_count  = await conn.fetchval("""
#             SELECT COUNT(*) FROM memory_entries
#             WHERE type = 'design_brief'
#               AND payload->>'cycle_number' = $1
#         """, str(cycle_number))
#         signal_count = await conn.fetchval("SELECT COUNT(DISTINCT tag) FROM design_signals")
#     has_brief   = (brief_count  or 0) >= 1
#     has_signals = (signal_count or 0) >= CIA_MIN_TRENDS
#     passed      = has_brief or has_signals
#     return {
#         "passed":       passed,
#         "brief_count":  int(brief_count  or 0),
#         "signal_count": int(signal_count or 0),
#         "note": (
#             f"explicit brief {'found' if has_brief else 'not found'} for cycle #{cycle_number}; "
#             f"{signal_count} signals available (need {CIA_MIN_TRENDS})"
#         ),
#     }


# async def _cia_check_designs_generated(pool: asyncpg.Pool, cycle_number: int) -> Dict:
#     async with pool.acquire() as conn:
#         design_count = await conn.fetchval("""
#             SELECT COUNT(*) FROM generated_designs
#             WHERE cycle_number = $1
#               AND status != 'rejected'
#         """, cycle_number)
#     count     = int(design_count or 0)
#     remaining = max(0, CIA_MIN_DESIGNS - count)
#     passed    = remaining == 0
#     return {
#         "passed":       passed,
#         "design_count": count,
#         "required":     CIA_MIN_DESIGNS,
#         "remaining":    remaining,
#         "note":         f"{count}/{CIA_MIN_DESIGNS} designs for cycle #{cycle_number} ({remaining} remaining)",
#     }


# async def _cia_check_vision_scoring(pool: asyncpg.Pool, cycle_number: int) -> Dict:
#     async with pool.acquire() as conn:
#         total  = await conn.fetchval(
#             "SELECT COUNT(*) FROM generated_designs WHERE cycle_number = $1", cycle_number
#         )
#         scored = await conn.fetchval("""
#             SELECT COUNT(*) FROM generated_designs
#             WHERE cycle_number = $1
#               AND score_json IS NOT NULL
#               AND score_json::text != '{}'
#         """, cycle_number)
#     passed = (scored or 0) >= CIA_MIN_SCORED_DESIGNS
#     return {
#         "passed":        passed,
#         "total_designs": int(total  or 0),
#         "scored":        int(scored or 0),
#         "required":      CIA_MIN_SCORED_DESIGNS,
#         "note":          f"{scored}/{total} designs scored for cycle #{cycle_number} (need {CIA_MIN_SCORED_DESIGNS})",
#     }


# async def _cia_check_showroom_published(pool: asyncpg.Pool, cycle_number: int) -> Dict:
#     async with pool.acquire() as conn:
#         showroom_count  = await conn.fetchval("""
#             SELECT COUNT(*) FROM showroom s
#             JOIN generated_designs gd ON gd.id = s.design_id
#             WHERE gd.cycle_number = $1
#         """, cycle_number)
#         published_count = await conn.fetchval("""
#             SELECT COUNT(*) FROM generated_designs
#             WHERE cycle_number = $1
#               AND publishable = TRUE
#               AND published_at IS NOT NULL
#         """, cycle_number)
#     passed = (showroom_count or 0) >= CIA_MIN_SHOWROOM_ITEMS
#     return {
#         "passed":          passed,
#         "showroom_count":  int(showroom_count  or 0),
#         "published_count": int(published_count or 0),
#         "required":        CIA_MIN_SHOWROOM_ITEMS,
#         "note":            f"{showroom_count} showroom items for cycle #{cycle_number} (need {CIA_MIN_SHOWROOM_ITEMS})",
#     }


# async def _cia_check_voting_captured(pool: asyncpg.Pool, cycle_number: int) -> Dict:
#     async with pool.acquire() as conn:
#         vote_count = await conn.fetchval("""
#             SELECT COUNT(*) FROM item_votes iv
#             JOIN product_catalog pc ON pc.item_id = iv.item_id
#             WHERE pc.item_id LIKE 'design-%%'
#               AND iv.item_id IN (
#                 SELECT CONCAT('design-', gd.id)
#                 FROM generated_designs gd
#                 WHERE gd.cycle_number = $1
#               )
#         """, cycle_number)
#     passed = (vote_count or 0) >= CIA_MIN_VOTES
#     return {
#         "passed":     passed,
#         "vote_count": int(vote_count or 0),
#         "required":   CIA_MIN_VOTES,
#         "note":       f"{vote_count} votes on cycle #{cycle_number} designs (need {CIA_MIN_VOTES})",
#     }


# async def _cia_check_feedback_captured(pool: asyncpg.Pool, cycle_number: int) -> Dict:
#     async with pool.acquire() as conn:
#         memory_count = await conn.fetchval("""
#             SELECT COUNT(*) FROM memory_entries
#             WHERE type IN ('design_signal', 'trend', 'feedback')
#         """)
#         signal_count = await conn.fetchval("SELECT COUNT(DISTINCT tag) FROM design_signals")
#     passed = (memory_count or 0) >= CIA_MIN_FEEDBACK_ITEMS or (signal_count or 0) >= CIA_MIN_FEEDBACK_ITEMS
#     return {
#         "passed":       passed,
#         "memory_count": int(memory_count or 0),
#         "signal_count": int(signal_count or 0),
#         "required":     CIA_MIN_FEEDBACK_ITEMS,
#         "note": (
#             f"{memory_count} memory entries; "
#             f"{signal_count} design signals (need {CIA_MIN_FEEDBACK_ITEMS})"
#         ),
#     }


# async def run_cycle_integrity_agent():
#     log_sep(f"CYCLE INTEGRITY AGENT — {datetime.utcnow().isoformat()}Z")

#     pool         = await get_pool()
#     cycle_number = await _get_active_cycle_number(pool)

#     if cycle_number == 0:
#         print(f"[CIA] No active cycle found — checking if prerequisites are ready to start cycle 1")
#     else:
#         print(f"[CIA] Active cycle number: #{cycle_number}")

#     gate_checks = [
#         ("trend_data_exists",       _cia_check_trend_data),
#         ("design_brief_ready",      _cia_check_design_brief),
#         ("designs_generated",       _cia_check_designs_generated),
#         ("vision_scoring_complete", _cia_check_vision_scoring),
#         ("showroom_published",      _cia_check_showroom_published),
#         ("voting_captured",         _cia_check_voting_captured),
#         ("feedback_captured",       _cia_check_feedback_captured),
#     ]

#     gate_results: Dict[str, Dict] = {}
#     overall_status = "evaluating"
#     action_taken   = "none"
#     notes          = ""

#     for gate_name, check_fn in gate_checks:
#         print(f"\n[CIA] ── Checking gate: {gate_name}")
#         try:
#             result = await check_fn(pool, cycle_number)
#         except Exception as e:
#             result = {
#                 "passed": False,
#                 "error":  f"{type(e).__name__}: {e}",
#                 "note":   "Gate check raised an exception",
#             }
#             print(f"[CIA] ✗ Gate '{gate_name}' raised: {e}")

#         gate_results[gate_name] = result
#         icon = "✓" if result["passed"] else "✗"
#         print(f"[CIA] {icon} {gate_name}: {result.get('note', '')}")

#     trends_ok      = gate_results.get("trend_data_exists", {}).get("passed", False)
#     brief_ok       = gate_results.get("design_brief_ready", {}).get("passed", False)
#     designs_gate   = gate_results.get("designs_generated", {})
#     designs_passed = designs_gate.get("passed", False)
#     designs_needed = designs_gate.get("remaining", CIA_MIN_DESIGNS)
#     all_passed     = all(r.get("passed", False) for r in gate_results.values())

#     if all_passed and cycle_number > 0:
#         print(f"\n[CIA] ✅ ALL GATES PASSED for cycle #{cycle_number} — completing and starting next cycle")
#         try:
#             await mark_cycle_complete(pool, cycle_number)
#             # FIX B: Promote cycle collection lifecycle to 'published' when all gates pass
#             try:
#                 async with pool.acquire() as conn:
#                     await conn.execute("""
#                         UPDATE collections SET lifecycle = 'published', published_at = NOW()
#                         WHERE cycle_number = $1 AND lifecycle != 'published'
#                     """, cycle_number)
#                 print(f"[CIA] ✓ Collection for cycle #{cycle_number} promoted to 'published'")
#             except Exception as coll_err:
#                 print(f"[CIA] ⚠ Collection lifecycle promotion failed: {coll_err}")
#             action_taken   = f"completed_cycle_{cycle_number}_and_starting_next"
#             overall_status = "all_passed_next_cycle_triggered"
#             notes = (
#                 f"All 7 gates satisfied for cycle #{cycle_number}. "
#                 f"Cycle marked complete. Collection promoted to published. Triggering design agent for cycle #{cycle_number + 1}."
#             )
#             asyncio.ensure_future(run_design_agent(pool, designs_needed=CIA_MIN_DESIGNS))
#             print(f"[CIA] ✓ Cycle #{cycle_number} complete. Next cycle design agent triggered.")
#         except Exception as e:
#             action_taken   = "next_cycle_trigger_failed"
#             overall_status = "next_cycle_trigger_failed"
#             notes          = f"All gates passed but next cycle trigger failed: {e}"
#             print(f"[CIA] ✗ Failed to trigger next cycle: {e}")

#     elif not designs_passed and designs_needed > 0:
#         if trends_ok and brief_ok:
#             if cycle_number == 0:
#                 action_label = "starting_cycle_1"
#                 notes_prefix = "No active cycle. Prerequisites met. Starting cycle 1."
#             else:
#                 action_label = f"triggered_design_topup_cycle_{cycle_number}_{designs_needed}"
#                 notes_prefix = (
#                     f"Cycle #{cycle_number} has {designs_gate.get('design_count', 0)}/{CIA_MIN_DESIGNS} designs. "
#                     f"Triggering top-up for {designs_needed} remaining."
#                 )

#             print(f"\n[CIA] ⚡ Triggering design agent — {designs_needed} design(s) needed")
#             action_taken   = action_label
#             overall_status = "design_generation_in_progress"
#             notes          = notes_prefix
#             try:
#                 asyncio.ensure_future(run_design_agent(pool, designs_needed=designs_needed))
#                 print(f"[CIA] ✓ Design agent triggered for {designs_needed} design(s)")
#             except Exception as e:
#                 action_taken   = "design_trigger_failed"
#                 overall_status = "design_trigger_failed"
#                 notes          = f"Trigger failed: {e}"
#                 print(f"[CIA] ✗ Failed to trigger design agent: {e}")
#         else:
#             overall_status = "blocked_missing_prerequisites"
#             action_taken   = "halted_missing_prerequisites"
#             notes = (
#                 f"Designs needed ({designs_needed}) but prerequisites not satisfied. "
#                 f"trend_data_exists={trends_ok}, design_brief_ready={brief_ok}. "
#                 f"Run the pipeline first to scrape trends."
#             )
#             print(f"\n[CIA] ⛔ Cannot generate designs — prerequisites not met (trends={trends_ok}, brief={brief_ok})")

#     else:
#         failed_gates   = [g for g, r in gate_results.items() if not r.get("passed")]
#         overall_status = f"waiting_on_{'_'.join(failed_gates[:2])}" if failed_gates else "all_passed"
#         action_taken   = "waiting_for_downstream_gates"
#         notes = (
#             f"Cycle #{cycle_number}: {CIA_MIN_DESIGNS} designs generated. "
#             f"Waiting for: {', '.join(failed_gates) if failed_gates else 'nothing — all done'}."
#         )
#         print(f"\n[CIA] ⏳ Designs complete for cycle #{cycle_number}. Waiting on: {failed_gates}")

#     async with pool.acquire() as conn:
#         await conn.execute(
#             """
#             INSERT INTO cycle_integrity_log
#                 (run_at, cycle_number, gate_results, overall_status, action_taken, notes)
#             VALUES (NOW(), $1, $2::jsonb, $3, $4, $5)
#             """,
#             max(cycle_number, 1),
#             json.dumps(gate_results),
#             overall_status,
#             action_taken,
#             notes,
#         )

#     # FIX C: After CIA run, trigger feedback loop to refresh memory signals
#     try:
#         await run_feedback_loop_processor(pool)
#     except Exception as e:
#         print(f"[CIA] ⚠ Feedback loop processor failed: {e}")

#     log_sep(f"CIA DONE — cycle=#{cycle_number} | status={overall_status} | action={action_taken}")
#     return {
#         "cycle_number":   cycle_number,
#         "overall_status": overall_status,
#         "action_taken":   action_taken,
#         "gate_results":   gate_results,
#         "notes":          notes,
#     }


# # ──────────────────────────────────────────────
# # Pipeline
# # ──────────────────────────────────────────────
# async def run_pipeline():
#     log_sep(f"PIPELINE START — {datetime.utcnow().isoformat()}Z")

#     articles = await scrape_all_with_retry()

#     log_sec("PRE-GENERATION GATE")
#     print(f"[GATE] Collected : {len(articles)} article(s)")

#     if not articles:
#         print(f"[GATE] ✗ No articles from any source. Pipeline aborted.")
#         log_sep("PIPELINE ABORTED")
#         return None

#     if len(articles) < MIN_SOURCE_ARTICLES:
#         print(f"[GATE] ⚠ Only {len(articles)} articles found (need {MIN_SOURCE_ARTICLES}) — proceeding with available articles")
#     else:
#         print(f"[GATE] ✓ Passed — rewriting {len(articles)} article(s) individually")

#     result = await generate_article(articles)
#     return result


# # ──────────────────────────────────────────────
# # Scheduler + lifecycle
# # ──────────────────────────────────────────────
# scheduler = AsyncIOScheduler()
# scheduler.add_job(run_pipeline,              "interval", hours=SCRAPE_INTERVAL_HOURS)
# scheduler.add_job(run_proxy_voting_job,      "interval", hours=24)
# scheduler.add_job(run_cycle_integrity_agent, "interval", hours=1, id="cycle_integrity_agent")

# # FIX C: Standalone feedback loop scheduled run every 6 hours
# async def _scheduled_feedback_loop():
#     try:
#         pool = await get_pool()
#         await run_feedback_loop_processor(pool)
#     except Exception as e:
#         print(f"[FEEDBACK-LOOP-SCHEDULED] ✗ {e}")

# scheduler.add_job(_scheduled_feedback_loop, "interval", hours=6, id="feedback_loop_processor")


# async def _cleanup_expired_otps():
#     try:
#         pool = await get_pool()
#         async with pool.acquire() as conn:
#             deleted = await conn.execute(
#                 "DELETE FROM email_otps WHERE expires_at < NOW()"
#             )
#         count = int(deleted.split()[-1]) if deleted else 0
#         if count:
#             print(f"[OTP-CLEANUP] Deleted {count} expired OTP(s)")
#     except Exception as e:
#         print(f"[OTP-CLEANUP] ✗ {e}")

# scheduler.add_job(_cleanup_expired_otps, "interval", hours=1, id="otp_cleanup")


# @app.on_event("startup")
# async def startup_event():
#     global _pool
#     if not POSTGRESQL_URI:
#         raise RuntimeError("POSTGRESQL_URI is not set in .env")

#     print("[BOOT] Connecting to PostgreSQL…")
#     _pool = await asyncpg.create_pool(
#         dsn=POSTGRESQL_URI,
#         min_size=2,
#         max_size=10,
#         command_timeout=60,
#         statement_cache_size=0,
#     )
#     print("[BOOT] ✅ PostgreSQL pool created (statement_cache_size=0 for PgBouncer compatibility)")
#     await init_db(_pool)
#     await run_schema_migrations(_pool)

#     scheduler.start()
#     print(f"[BOOT] ✅ Scheduler started — pipeline every {SCRAPE_INTERVAL_HOURS}h")
#     print("[BOOT] ✅ Cycle Integrity Agent scheduled — every 1 hour")
#     print("[BOOT] ✅ Feedback Loop Processor scheduled — every 6 hours")


# @app.on_event("shutdown")
# async def shutdown_event():
#     scheduler.shutdown(wait=False)
#     global _pool
#     if _pool:
#         await _pool.close()
#     print("[BOOT] Scheduler + DB pool stopped")


# # ──────────────────────────────────────────────
# # Helpers
# # ──────────────────────────────────────────────
# def record_to_dict(row) -> dict:
#     d = dict(row)
#     for k, v in d.items():
#         if isinstance(v, datetime):
#             d[k] = v.isoformat()
#     return d


# # ══════════════════════════════════════════════════════════════════════════════
# # FIX A: GSNowGPT Orchestration Layer — /gpt/query
# # ══════════════════════════════════════════════════════════════════════════════

# # Intent classification routing table
# # ══════════════════════════════════════════════════════════════════════════════
# # PREMIUM INTENT LAYER — maps user phrases to named paid showroom features.
# # Each "showroom_*" intent below gates behind _check_premium_access().
# # Free intents:  retrieval, trend, style, proxy, account, premium, collection_ai
# # Paid intents:  showroom_ai, trend_ai, design_generator, style_match,
# #                outfit_builder, lookbook_ai, wardrobe_ai
# # ══════════════════════════════════════════════════════════════════════════════
# INTENT_ROUTING = {
#     "retrieval":        ["what", "who", "when", "where", "tell me", "explain", "show", "list", "find", "search"],
#     "trend":            ["trend", "trending", "popular", "hot right now", "season", "vogue", "in style", "fashion week"],
#     "style":            ["style", "outfit", "wear", "pair", "match", "look", "dress", "accessori", "suggest", "recommend"],
#     "proxy":            ["proxy", "vote for me", "auto vote", "voting agent", "delegate"],
#     "account":          ["subscription", "plan", "account", "upgrade", "cancel", "billing", "password", "profile"],
#     "premium":          ["premium", "exclusive", "pro plan", "unlock", "vip", "member"],
#     # ── Named paid showroom AI features ──────────────────────────────────────
#     # showroom_ai: General AI showroom assistant (view designs, get advice)
#     "showroom_ai":      ["ai design", "ai style", "generate look", "design assistant", "style ai", "ai showroom", "design me"],
#     # trend_ai: AI-powered deep trend analysis (paid feature)
#     "trend_ai":         ["ai trend", "trend analysis", "trend forecast", "predict trend", "trend report", "deep trend", "season forecast"],
#     # design_generator: AI design generation on demand (paid feature)
#     "design_generator": ["generate design", "create design", "new design", "design for me", "ai generate", "make design", "design generation"],
#     # style_match: AI matching user's style to showroom pieces (paid feature)
#     "style_match":      ["style match", "match my style", "find my look", "similar style", "style finder", "style profile", "best match for me"],
#     # outfit_builder: AI multi-piece outfit composition (paid feature)
#     "outfit_builder":   ["build outfit", "outfit builder", "complete my look", "full outfit", "head to toe", "whole look", "outfit idea"],
#     # lookbook_ai: AI-curated personal lookbook generation (paid feature)
#     "lookbook_ai":      ["lookbook", "my lookbook", "curate looks", "personal lookbook", "ai lookbook", "curated collection"],
#     # wardrobe_ai: AI wardrobe analysis and management (paid feature)
#     "wardrobe_ai":      ["wardrobe", "my wardrobe", "wardrobe analysis", "wardrobe plan", "capsule wardrobe", "wardrobe ai", "what to wear"],
#     # collection_ai: Saved looks / collection summary (free with login)
#     "collection_ai":    ["my collection", "saved looks", "collection summary", "saved designs", "saved models"],
#     # collection_info: Query available design collections and cycle info
#     "collection_info":  ["collection", "collections", "cycle collection", "collection info", "collection details", "list collections", "showroom collection", "design collection"],
# }

# # Intents that require a paid subscription
# PREMIUM_INTENT_FEATURES: Dict[str, str] = {
#     "showroom_ai":      "AI Showroom Styling",
#     "trend_ai":         "AI Trend Forecasting",
#     "design_generator": "AI Design Generator",
#     "style_match":      "AI Style Match",
#     "outfit_builder":   "AI Outfit Builder",
#     "lookbook_ai":      "AI Lookbook Creator",
#     "wardrobe_ai":      "AI Wardrobe Advisor",
# }


# def classify_intent(message: str) -> str:
#     """
#     Keyword-based intent classifier with premium-feature priority.
#     Premium paid features are scored with a 2× multiplier so specific
#     feature phrases win over generic style/trend matches.
#     Returns the best-match intent bucket.
#     """
#     msg_lower = message.lower()
#     scores: Dict[str, int] = {intent: 0 for intent in INTENT_ROUTING}

#     for intent, keywords in INTENT_ROUTING.items():
#         multiplier = 2 if intent in PREMIUM_INTENT_FEATURES else 1
#         for kw in keywords:
#             if kw in msg_lower:
#                 scores[intent] += multiplier

#     best = max(scores, key=lambda k: scores[k])
#     return best if scores[best] > 0 else "style"  # default to style agent


# async def _gsnowgpt_handle_retrieval(message: str, pool: asyncpg.Pool) -> Dict[str, Any]:
#     """Handle retrieval intents: pull from articles and trends via memory."""
#     ctx = await assemble_design_context(query=message, top_k_signals=5, top_k_trends=8)
#     async with pool.acquire() as conn:
#         articles = await conn.fetch(
#             "SELECT title, excerpt, slug FROM blog_articles ORDER BY created_at DESC LIMIT 5"
#         )
#     article_lines = [f"- {r['title']}: {r['excerpt'] or ''}" for r in articles]
#     return {
#         "context_type":    "retrieval",
#         "trend_summary":   ctx["trend_summary"],
#         "recent_articles": article_lines,
#     }


# async def _gsnowgpt_handle_trend(message: str, pool: asyncpg.Pool) -> Dict[str, Any]:
#     """Handle trend summary intents via memory/RAG."""
#     ctx = await assemble_design_context(query=message, top_k_signals=8, top_k_trends=12)
#     return {
#         "context_type":  "trend_summary",
#         "trend_summary": ctx["trend_summary"],
#         "signal_summary": ctx["signal_summary"],
#     }


# async def _gsnowgpt_handle_style(
#     message: str,
#     pool: asyncpg.Pool,
#     product_name: Optional[str],
#     product_desc: Optional[str],
#     product_price: Optional[str],
# ) -> Dict[str, Any]:
#     """Delegate to style/styling context enrichment."""
#     ctx = await assemble_design_context(query=message, top_k_signals=5, top_k_trends=8)
#     product_ctx = ""
#     if product_name:
#         product_ctx = f"\nProduct in view: {product_name} | {product_desc or ''} | {product_price or ''}"
#     return {
#         "context_type":    "style",
#         "trend_summary":   ctx["trend_summary"],
#         "signal_summary":  ctx["signal_summary"],
#         "product_context": product_ctx,
#     }


# async def _gsnowgpt_handle_collection_info(message: str, pool: asyncpg.Pool) -> Dict[str, Any]:
#     """Handle collection info queries: fetch and summarize design collections."""
#     msg_lower = message.lower()
#     collections_data = []
#     collections_summary = ""
    
#     try:
#         async with pool.acquire() as conn:
#             # Try to identify a specific collection by ID or name from the message
#             specific_id = None
#             specific_name = None
            
#             # Extract numeric ID if user mentioned "collection #N" or "collection N"
#             import re
#             id_match = re.search(r'collection\s*#?(\d+)', msg_lower)
#             if id_match:
#                 specific_id = int(id_match.group(1))
            
#             # Check for specific collection name
#             name_match = re.search(r"(?:collection|cycle)\s+(?:named|'|\")?([^'\".,!?]+)", message, re.IGNORECASE)
#             if name_match:
#                 specific_name = name_match.group(1).strip()
            
#             if specific_id:
#                 # Fetch specific collection by ID
#                 coll = await conn.fetchrow("""
#                     SELECT 
#                         id, name, description, lifecycle, cycle_number, created_at,
#                         (SELECT COUNT(*) FROM generated_designs WHERE collection_id = collections.id) as design_count
#                     FROM collections
#                     WHERE id = $1
#                     LIMIT 1
#                 """, specific_id)
#                 if coll:
#                     collections_data = [dict(coll)]
#             elif specific_name:
#                 # Fetch specific collection by name (partial match)
#                 coll = await conn.fetchrow("""
#                     SELECT 
#                         id, name, description, lifecycle, cycle_number, created_at,
#                         (SELECT COUNT(*) FROM generated_designs WHERE collection_id = collections.id) as design_count
#                     FROM collections
#                     WHERE LOWER(name) ILIKE $1
#                     LIMIT 1
#                 """, f"%{specific_name}%")
#                 if coll:
#                     collections_data = [dict(coll)]
#             else:
#                 # Fetch all collections, ordered by recency
#                 colls = await conn.fetch("""
#                     SELECT 
#                         id, name, description, lifecycle, cycle_number, created_at,
#                         (SELECT COUNT(*) FROM generated_designs WHERE collection_id = collections.id) as design_count
#                     FROM collections
#                     ORDER BY created_at DESC
#                     LIMIT 10
#                 """)
#                 collections_data = [dict(c) for c in colls]
            
#             # Enrich with sample designs for each collection (up to 3 per collection)
#             for coll in collections_data:
#                 designs = await conn.fetch("""
#                     SELECT id, title, status, publishable
#                     FROM generated_designs
#                     WHERE collection_id = $1
#                     ORDER BY created_at DESC
#                     LIMIT 3
#                 """, coll["id"])
#                 coll["sample_designs"] = [dict(d) for d in designs]
        
#         # Build human-readable summary
#         if not collections_data:
#             collections_summary = "No collections found in the system yet."
#         else:
#             summary_lines = []
#             for coll in collections_data:
#                 line = f"• **{coll.get('name', 'Unnamed')}** (Cycle #{coll.get('cycle_number', '?')}, Status: {coll.get('lifecycle', 'unknown')})"
#                 if coll.get('description'):
#                     line += f": {coll['description']}"
#                 line += f" — {coll.get('design_count', 0)} designs"
#                 if coll.get('sample_designs'):
#                     design_titles = [d['title'] for d in coll['sample_designs'][:2]]
#                     line += f" (e.g., {', '.join(design_titles)})"
#                 summary_lines.append(line)
#             collections_summary = "\n".join(summary_lines)
    
#     except Exception as e:
#         print(f"[GSNOWGPT-COLLECTION] Error fetching collections: {e}")
#         collections_summary = f"Error loading collections: {str(e)}"
    
#     return {
#         "context_type": "collection_info",
#         "collections_summary": collections_summary,
#         "collections_data": collections_data,
#     }


# async def _gsnowgpt_handle_account(user_id: Optional[int], pool: asyncpg.Pool) -> Dict[str, Any]:
#     """Return account/subscription context."""
#     if not user_id:
#         return {"context_type": "account", "note": "Not authenticated"}
#     async with pool.acquire() as conn:
#         sub = await conn.fetchrow("""
#             SELECT plan_name, status, ends_at FROM user_subscriptions
#             WHERE user_id = $1 AND status = 'active'
#             ORDER BY created_at DESC LIMIT 1
#         """, user_id)
#     return {
#         "context_type": "account",
#         "subscription":  dict(sub) if sub else None,
#     }


# async def _gsnowgpt_handle_trend_ai(message: str, pool: asyncpg.Pool) -> Dict[str, Any]:
#     """PREMIUM: Deep AI trend analysis with broader signal retrieval."""
#     ctx = await assemble_design_context(query=message, top_k_signals=15, top_k_trends=20)
#     # Pull recent trends from DB to augment
#     async with pool.acquire() as conn:
#         recent_trends = await conn.fetch(
#             "SELECT title, description FROM trends ORDER BY created_at DESC LIMIT 10"
#         )
#     trend_lines = [f"- {r['title']}: {r['description'] or ''}" for r in recent_trends]
#     return {
#         "context_type":   "trend_ai",
#         "trend_summary":  ctx["trend_summary"],
#         "signal_summary": ctx["signal_summary"],
#         "recent_trends":  trend_lines,
#     }


# async def _gsnowgpt_handle_design_generator(message: str, pool: asyncpg.Pool) -> Dict[str, Any]:
#     """PREMIUM: AI design generation context (does not call image model directly — returns briefing context)."""
#     ctx = await assemble_design_context(query=message, top_k_signals=10, top_k_trends=12)
#     return {
#         "context_type":   "design_generator",
#         "trend_summary":  ctx["trend_summary"],
#         "signal_summary": ctx["signal_summary"],
#         "brief_context":  ctx.get("brief_context", ""),
#     }


# async def _gsnowgpt_handle_style_match(
#     message: str,
#     pool: asyncpg.Pool,
#     product_name: Optional[str],
#     product_desc: Optional[str],
# ) -> Dict[str, Any]:
#     """PREMIUM: AI style match — find showroom pieces matching user's taste."""
#     ctx = await assemble_design_context(query=message, top_k_signals=12, top_k_trends=8)
#     # Pull top showroom items for matching context
#     async with pool.acquire() as conn:
#         showroom_items = await conn.fetch("""
#             SELECT s.title, s.description, s.tags
#             FROM showroom s
#             JOIN generated_designs gd ON gd.id = s.design_id
#             ORDER BY s.created_at DESC LIMIT 8
#         """)
#     item_lines = []
#     for r in showroom_items:
#         tags = r["tags"]
#         if isinstance(tags, str):
#             try:
#                 tags = json.loads(tags)
#             except Exception:
#                 tags = []
#         tag_str = ", ".join(tags[:4]) if tags else ""
#         item_lines.append(f"- {r['title']}: {r['description'] or ''} [tags: {tag_str}]")
#     product_ctx = f"\nProduct in view: {product_name} | {product_desc or ''}" if product_name else ""
#     return {
#         "context_type":    "style_match",
#         "trend_summary":   ctx["trend_summary"],
#         "signal_summary":  ctx["signal_summary"],
#         "showroom_items":  item_lines,
#         "product_context": product_ctx,
#     }


# async def _gsnowgpt_handle_outfit_builder(message: str, pool: asyncpg.Pool) -> Dict[str, Any]:
#     """PREMIUM: AI outfit builder — multi-piece outfit composition."""
#     ctx = await assemble_design_context(query=message, top_k_signals=10, top_k_trends=10)
#     async with pool.acquire() as conn:
#         items = await conn.fetch("""
#             SELECT s.title, s.description, s.tags
#             FROM showroom s ORDER BY s.created_at DESC LIMIT 12
#         """)
#     item_lines = []
#     for r in items:
#         tags = r["tags"]
#         if isinstance(tags, str):
#             try:
#                 tags = json.loads(tags)
#             except Exception:
#                 tags = []
#         item_lines.append(f"- {r['title']}: {r['description'] or ''}")
#     return {
#         "context_type":   "outfit_builder",
#         "trend_summary":  ctx["trend_summary"],
#         "signal_summary": ctx["signal_summary"],
#         "available_items": item_lines,
#     }


# async def _gsnowgpt_handle_lookbook_ai(
#     message: str,
#     pool: asyncpg.Pool,
#     user_id: Optional[int],
# ) -> Dict[str, Any]:
#     """PREMIUM: AI lookbook — curates a personal lookbook from trends + saved items."""
#     ctx = await assemble_design_context(query=message, top_k_signals=12, top_k_trends=15)
#     saved_items: List[str] = []
#     if user_id:
#         async with pool.acquire() as conn:
#             saved = await conn.fetch(
#                 "SELECT item_id FROM user_collections WHERE user_id=$1 ORDER BY added_at DESC LIMIT 10",
#                 user_id
#             )
#         saved_items = [r["item_id"] for r in saved]
#     return {
#         "context_type":   "lookbook_ai",
#         "trend_summary":  ctx["trend_summary"],
#         "signal_summary": ctx["signal_summary"],
#         "saved_items":    saved_items,
#     }


# async def _gsnowgpt_handle_wardrobe_ai(
#     message: str,
#     pool: asyncpg.Pool,
#     user_id: Optional[int],
# ) -> Dict[str, Any]:
#     """PREMIUM: AI wardrobe advisor — analyzes user's saved pieces and advises on gaps/pairings."""
#     ctx = await assemble_design_context(query=message, top_k_signals=10, top_k_trends=8)
#     saved_items: List[str] = []
#     if user_id:
#         async with pool.acquire() as conn:
#             saved = await conn.fetch(
#                 "SELECT item_id FROM user_collections WHERE user_id=$1 ORDER BY added_at DESC LIMIT 20",
#                 user_id
#             )
#         saved_items = [r["item_id"] for r in saved]
#     return {
#         "context_type":   "wardrobe_ai",
#         "trend_summary":  ctx["trend_summary"],
#         "signal_summary": ctx["signal_summary"],
#         "wardrobe_items": saved_items,
#     }


# def _build_gsnowgpt_system_prompt(intent: str, context: Dict[str, Any]) -> str:
#     """Build a unified system prompt based on classified intent and assembled context."""
#     base = """You are GSNowGPT — the conversational intelligence layer for GIA Fashion, a high-end boutique AI platform.
# You are sophisticated, knowledgeable, warm, and inspiring. You speak like a personal stylist and fashion authority.
# Always give specific, actionable, contextually-grounded responses. Be concise (2-4 sentences) unless asked for detail."""

#     if intent == "retrieval":
#         extra = f"""
# RECENT ARTICLES:
# {chr(10).join(context.get('recent_articles', []))}

# CURRENT TRENDS:
# {context.get('trend_summary', '')}

# Answer the user's factual question using the above context. Cite trend names or article titles when relevant."""

#     elif intent == "trend":
#         extra = f"""
# CURRENT TRENDS FROM MEMORY:
# {context.get('trend_summary', '')}

# AUDIENCE SIGNALS:
# {context.get('signal_summary', '')}

# Summarize the most relevant trends for the user. Mention specific trend names and what they signal for upcoming seasons."""

#     elif intent == "style":
#         extra = f"""
# CURRENT TRENDS:
# {context.get('trend_summary', '')}

# AUDIENCE SIGNALS:
# {context.get('signal_summary', '')}
# {context.get('product_context', '')}

# Give specific styling advice grounded in these trends. Reference actual trend names. If a product is in view, tailor advice to it."""

#     elif intent in ("account", "premium"):
#         sub = context.get("subscription")
#         if sub:
#             extra = f"\nUser subscription: {sub.get('plan_name')} (status: {sub.get('status')}). Help with account questions."
#         else:
#             extra = "\nUser has no active subscription. Guide them toward premium options if relevant."

#     elif intent == "proxy":
#         extra = "\nExplain how GIA's Proxy Voting Agent works: it votes on behalf of users based on their taste profile, runs daily, and can be toggled in account settings."

#     elif intent == "showroom_ai":
#         extra = f"""
# CURRENT TRENDS:
# {context.get('trend_summary', '')}

# AUDIENCE SIGNALS:
# {context.get('signal_summary', '')}
# {context.get('product_context', '')}

# You are acting as a premium AI showroom assistant. Give specific, curated styling advice for the designs in the showroom. Reference trend names. Be concise and authoritative."""

#     elif intent == "trend_ai":
#         recent = "\n".join(context.get("recent_trends", []))
#         extra = f"""
# MEMORY TRENDS:
# {context.get('trend_summary', '')}

# RECENT PUBLISHED TRENDS:
# {recent}

# AUDIENCE SIGNALS:
# {context.get('signal_summary', '')}

# You are a premium AI trend forecaster. Provide a detailed, data-grounded trend analysis. Name specific trends, predict direction, and explain which audience signals support each forecast. Cite at least 3 distinct trends."""

#     elif intent == "design_generator":
#         extra = f"""
# CURRENT TRENDS:
# {context.get('trend_summary', '')}

# AUDIENCE SIGNALS:
# {context.get('signal_summary', '')}

# DESIGN BRIEF CONTEXT:
# {context.get('brief_context', '')}

# You are a premium AI design generator. Describe a specific fashion design concept in vivid detail: silhouette, materials, colour palette, key design elements, and which trend it taps into. Be specific enough that a designer could execute it. Format as a design brief."""

#     elif intent == "style_match":
#         items = "\n".join(context.get("showroom_items", []))
#         extra = f"""
# CURRENT TRENDS:
# {context.get('trend_summary', '')}

# SHOWROOM ITEMS AVAILABLE:
# {items}
# {context.get('product_context', '')}

# You are a premium AI personal stylist. Match the user's expressed style preferences to specific pieces from the showroom. Explain why each piece fits their style. Reference trend alignment. Be specific and confident."""

#     elif intent == "outfit_builder":
#         available = "\n".join(context.get("available_items", []))
#         extra = f"""
# CURRENT TRENDS:
# {context.get('trend_summary', '')}

# AVAILABLE SHOWROOM PIECES:
# {available}

# You are a premium AI outfit builder. Compose a complete head-to-toe outfit using the available pieces. Explain how each piece works together, what occasion it suits, and which current trend it references. Be specific about styling details."""

#     elif intent == "lookbook_ai":
#         saved = context.get("saved_items", [])
#         extra = f"""
# CURRENT TRENDS:
# {context.get('trend_summary', '')}

# AUDIENCE SIGNALS:
# {context.get('signal_summary', '')}

# USER'S SAVED ITEMS: {', '.join(saved) if saved else 'no saved items yet'}

# You are a premium AI lookbook curator. Create a curated lookbook narrative for this user. Reference current trends, describe coherent theme(s) across their saved pieces, and suggest 2-3 new pieces that would complete their lookbook. Be editorial and inspiring."""

#     elif intent == "wardrobe_ai":
#         wardrobe = context.get("wardrobe_items", [])
#         extra = f"""
# CURRENT TRENDS:
# {context.get('trend_summary', '')}

# USER'S WARDROBE ITEMS: {', '.join(wardrobe) if wardrobe else 'no items saved yet'}

# You are a premium AI wardrobe advisor. Analyse the user's saved wardrobe, identify style patterns, flag any key gaps, and recommend 2-3 additions that would maximise versatility. Reference current trends and be specific about what to add and why."""

#     elif intent == "collection_ai":
#         saved = context.get("saved_items", [])
#         extra = f"""
# The user has {len(saved)} saved item(s) in their collection.
# Saved item IDs: {', '.join(saved) if saved else 'none yet'}.

# Help them understand or style their saved collection. Suggest complementary pieces or trending styles that match what they've saved. Be personal and specific."""

#     elif intent == "collection_info":
#         collections_summary = context.get("collections_summary", "")
#         extra = f"""
# COLLECTIONS IN GIA SHOWROOM:
# {collections_summary}

# Describe these collections naturally. Explain the cycle structure, what each collection represents, and encourage the user to explore specific designs. Reference design counts and sample pieces. Be informative and inviting."""

#     else:
#         extra = f"""
# CURRENT TRENDS:
# {context.get('trend_summary', '')}

# Give helpful fashion guidance based on current trends."""

#     return base + extra


# @app.post("/gpt/query")
# async def gsnowgpt_query(req: GSNowGPTRequest, request: Request = None, authorization: Optional[str] = Header(None)):
#     """
#     FIX A: Unified GSNowGPT conversational entry point.
#     Classifies intent → routes to appropriate context assembler → calls LLM →
#     returns normalized response contract → logs chat event.
#     """
#     if not OPENAI_API_KEY:
#         raise HTTPException(status_code=503, detail="OpenAI API key not configured")

#     pool          = await get_pool()
#     user_payload  = await get_optional_user(authorization)
#     user_id       = int(user_payload["sub"]) if user_payload else None

#     # ── GSNowGPT monetization: free daily limit vs paid unlimited ──────────────
#     # Free users:  GPT_FREE_DAILY_LIMIT messages per day (default 10)
#     # Paid users:  GPT_PAID_HOURLY_LIMIT messages per hour (effectively unlimited)
#     rate_key = str(user_id) if user_id else (request.client.host if request else "anon")
#     is_paid  = await _check_premium_access(user_id, pool) if user_id else False

#     if is_paid:
#         # Paid: high hourly limit (virtually unlimited)
#         if not check_user_rate_limit(rate_key, "/gpt/query/paid", max_requests=GPT_PAID_HOURLY_LIMIT, window_seconds=3600):
#             raise HTTPException(status_code=429, detail="Hourly message limit reached. Please wait a moment.")
#     else:
#         # Free tier: strict daily cap
#         if not check_user_rate_limit(rate_key, "/gpt/query/free", max_requests=GPT_FREE_DAILY_LIMIT, window_seconds=86400):
#             raise HTTPException(
#                 status_code=429,
#                 detail=(
#                     f"You've reached your free daily limit of {GPT_FREE_DAILY_LIMIT} messages. "
#                     "Upgrade to a premium plan for unlimited access."
#                 ),
#                 headers={"X-Upgrade-Required": "true"},
#             )

#     # 1. Classify intent
#     intent = classify_intent(req.message)
#     print(f"[GSNOWGPT] Intent classified: '{intent}' | user={user_id} | session={req.session_id}")

#     # 2. Route to context assembler
#     try:
#         if intent == "retrieval":
#             context = await _gsnowgpt_handle_retrieval(req.message, pool)
#         elif intent == "trend":
#             context = await _gsnowgpt_handle_trend(req.message, pool)
#         elif intent == "style":
#             context = await _gsnowgpt_handle_style(
#                 req.message, pool, req.product_name, req.product_desc, req.product_price
#             )
#         elif intent in ("account", "premium"):
#             context = await _gsnowgpt_handle_account(user_id, pool)
#         elif intent == "proxy":
#             context = {"context_type": "proxy"}

#         # ── Premium paid showroom AI features ────────────────────────────────
#         elif intent in PREMIUM_INTENT_FEATURES:
#             feature_name = PREMIUM_INTENT_FEATURES[intent]
#             is_premium   = await _check_premium_access(user_id, pool)
#             if not is_premium:
#                 return {
#                     "success":    True,
#                     "type":       "gate",
#                     "intent":     intent,
#                     "reply":      (
#                         f"✨ **{feature_name}** is a premium feature exclusive to paid subscribers. "
#                         f"Upgrade your plan to unlock AI-powered {feature_name.lower()} and all other "
#                         f"premium showroom AI tools."
#                     ),
#                     "payload":    {"context_type": "premium_gate", "feature": intent, "feature_name": feature_name},
#                     "actions":    [
#                         {"label": "View Plans", "route": "/pricing"},
#                         {"label": "Learn More", "route": "/premium"},
#                     ],
#                     "citations":  [],
#                     "session_id": req.session_id,
#                 }
#             # Paid — route to appropriate handler
#             if intent == "showroom_ai":
#                 context = await _gsnowgpt_handle_style(
#                     req.message, pool, req.product_name, req.product_desc, req.product_price
#                 )
#                 context["context_type"] = "showroom_ai"
#             elif intent == "trend_ai":
#                 context = await _gsnowgpt_handle_trend_ai(req.message, pool)
#             elif intent == "design_generator":
#                 context = await _gsnowgpt_handle_design_generator(req.message, pool)
#             elif intent == "style_match":
#                 context = await _gsnowgpt_handle_style_match(
#                     req.message, pool, req.product_name, req.product_desc
#                 )
#             elif intent == "outfit_builder":
#                 context = await _gsnowgpt_handle_outfit_builder(req.message, pool)
#             elif intent == "lookbook_ai":
#                 context = await _gsnowgpt_handle_lookbook_ai(req.message, pool, user_id)
#             elif intent == "wardrobe_ai":
#                 context = await _gsnowgpt_handle_wardrobe_ai(req.message, pool, user_id)
#             else:
#                 context = await _gsnowgpt_handle_style(
#                     req.message, pool, req.product_name, req.product_desc, req.product_price
#                 )

#         elif intent == "collection_ai":
#             # Saved looks / collection summary
#             context = await _gsnowgpt_handle_account(user_id, pool)
#             if user_id:
#                 async with pool.acquire() as conn:
#                     saved = await conn.fetch(
#                         "SELECT item_id FROM user_collections WHERE user_id=$1 ORDER BY added_at DESC LIMIT 5",
#                         user_id
#                     )
#                 context["saved_items"] = [r["item_id"] for r in saved]
#             context["context_type"] = "collection_ai"
        
#         elif intent == "collection_info":
#             # Design collections (design cycles, collections table)
#             context = await _gsnowgpt_handle_collection_info(req.message, pool)
        
#         else:
#             context = await _gsnowgpt_handle_style(
#                 req.message, pool, req.product_name, req.product_desc, req.product_price
#             )
#     except Exception as ctx_err:
#         print(f"[GSNOWGPT] ⚠ Context assembly failed: {ctx_err} — using empty context")
#         context = {"context_type": intent}

#     # 3. Build messages
#     system_prompt = _build_gsnowgpt_system_prompt(intent, context)
#     messages = [{"role": "system", "content": system_prompt}]
#     for msg in req.conversation_history[-12:]:
#         if msg.get("role") in ("user", "assistant") and msg.get("content"):
#             messages.append({"role": msg["role"], "content": msg["content"]})
#     messages.append({"role": "user", "content": req.message})

#     # 4. Call LLM
#     try:
#         async with httpx.AsyncClient(timeout=30) as client:
#             res = await client.post(
#                 "https://api.openai.com/v1/chat/completions",
#                 headers={
#                     "Authorization": f"Bearer {OPENAI_API_KEY}",
#                     "Content-Type": "application/json",
#                 },
#                 json={
#                     "model":       "gpt-4o-mini",
#                     "max_tokens":  600,
#                     "temperature": 0.75,
#                     "messages":    messages,
#                 },
#             )
#         res.raise_for_status()
#         data  = res.json()
#         reply = data["choices"][0]["message"]["content"].strip()
#         usage = data.get("usage", {})
#         print(f"[GSNOWGPT] ✓ tokens={usage} | intent={intent}")

#     except httpx.HTTPStatusError as e:
#         print(f"[GSNOWGPT] OpenAI error: {e.response.text[:300]}")
#         raise HTTPException(status_code=502, detail="AI service error")
#     except Exception as e:
#         print(f"[GSNOWGPT] Unexpected error: {type(e).__name__}: {e}")
#         raise HTTPException(status_code=500, detail=str(e))

#     # 5. Log chat event to structured memory
#     try:
#         async with pool.acquire() as conn:
#             await conn.execute("""
#                 INSERT INTO gsnowgpt_chat_log
#                     (session_id, user_id, intent, user_message, response_type, response_payload, created_at)
#                 VALUES ($1, $2, $3, $4, $5, $6::jsonb, NOW())
#             """,
#                 req.session_id,
#                 user_id,
#                 intent,
#                 req.message,
#                 "text",
#                 json.dumps({"reply": reply, "context_type": context.get("context_type", intent)}),
#             )
#     except Exception as log_err:
#         print(f"[GSNOWGPT] ⚠ Chat log insert failed: {log_err}")

#     # 6. Emit interaction event for feedback loop
#     try:
#         await emit_interaction_event(
#             pool=pool,
#             event_type="chat_query",
#             entity_id=req.session_id,
#             entity_type="conversation",
#             payload={"intent": intent, "message_length": len(req.message)},
#             user_id=user_id,
#         )
#     except Exception as evt_err:
#         print(f"[GSNOWGPT] ⚠ Event emit failed: {evt_err}")

#     # 7. Normalized response contract
#     return {
#         "success":       True,
#         "type":          "text",
#         "intent":        intent,
#         "reply":         reply,
#         "payload":       context,
#         "actions":       _suggest_actions(intent),
#         "citations":     [],
#         "session_id":    req.session_id,
#     }


# async def _check_premium_access(user_id: Optional[int], pool: asyncpg.Pool) -> bool:
#     """Return True if user has an active paid subscription or if FREE_DEMO_MODE is enabled."""
#     if FREE_DEMO_MODE:
#         return True
#     if not user_id:
#         return False
#     async with pool.acquire() as conn:
#         row = await conn.fetchrow(
#             "SELECT id FROM user_subscriptions WHERE user_id=$1 AND status='active' LIMIT 1",
#             user_id
#         )
#     return row is not None


# def _suggest_actions(intent: str) -> List[Dict[str, str]]:
#     """Return suggested follow-up UI actions based on intent."""
#     action_map = {
#         "style":            [{"label": "Browse Showroom", "route": "/showroom"}, {"label": "View Trends", "route": "/trends"}],
#         "trend":            [{"label": "View Showroom", "route": "/showroom"}, {"label": "Read Articles", "route": "/articles"}],
#         "retrieval":        [{"label": "Read Articles", "route": "/articles"}],
#         "account":          [{"label": "Manage Subscription", "route": "/account/subscription"}],
#         "premium":          [{"label": "View Plans", "route": "/pricing"}],
#         "proxy":            [{"label": "Enable Proxy Voting", "route": "/account/proxy"}],
#         # Named paid showroom AI features
#         "showroom_ai":      [{"label": "Open Showroom", "route": "/showroom"}, {"label": "View Plans", "route": "/pricing"}],
#         "trend_ai":         [{"label": "View Trends", "route": "/trends"}, {"label": "View Plans", "route": "/pricing"}],
#         "design_generator": [{"label": "Open Showroom", "route": "/showroom"}, {"label": "View Plans", "route": "/pricing"}],
#         "style_match":      [{"label": "Browse Showroom", "route": "/showroom"}, {"label": "View Plans", "route": "/pricing"}],
#         "outfit_builder":   [{"label": "Browse Showroom", "route": "/showroom"}, {"label": "View Plans", "route": "/pricing"}],
#         "lookbook_ai":      [{"label": "My Collection", "route": "/account/collection"}, {"label": "View Plans", "route": "/pricing"}],
#         "wardrobe_ai":      [{"label": "My Collection", "route": "/account/collection"}, {"label": "View Plans", "route": "/pricing"}],
#         "collection_ai":    [{"label": "My Collection", "route": "/account/collection"}],
#         "collection_info":  [{"label": "View Collections", "route": "/collections"}, {"label": "Browse Showroom", "route": "/showroom"}],
#     }
#     return action_map.get(intent, [{"label": "Explore GIA", "route": "/"}])


# # ══════════════════════════════════════════════════════════════════════════════
# # AUTH ENDPOINTS — OTP-GATED SIGNUP
# # ══════════════════════════════════════════════════════════════════════════════

# @app.post("/auth/send-otp")
# async def send_otp(req: SendOtpRequest, request: Request = None):
#     if not req.firstName.strip() or not req.lastName.strip():
#         raise HTTPException(status_code=422, detail="First and last name are required")
#     if not req.email.strip():
#         raise HTTPException(status_code=422, detail="Email is required")
#     if len(req.password) < 6:
#         raise HTTPException(status_code=422, detail="Password must be at least 6 characters")

#     email = req.email.lower().strip()

#     if not re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", email):
#         raise HTTPException(status_code=422, detail="Invalid email address")

#     # Per-IP rate limit: max 10 OTP sends per hour
#     if request and not check_rate_limit(request, "/auth/send-otp", max_requests=10):
#         raise HTTPException(status_code=429, detail="Too many verification attempts from this IP. Please wait.")

#     pool = await get_pool()

#     async with pool.acquire() as conn:
#         existing = await conn.fetchrow(
#             "SELECT id FROM users WHERE email = $1", email
#         )
#     if existing:
#         raise HTTPException(
#             status_code=409,
#             detail="An account with this email already exists. Please sign in instead."
#         )

#     async with pool.acquire() as conn:
#         recent_count = await conn.fetchval("""
#             SELECT COUNT(*) FROM email_otps
#             WHERE email = $1
#               AND created_at > NOW() - INTERVAL '10 minutes'
#         """, email)

#     if (recent_count or 0) >= 3:
#         raise HTTPException(
#             status_code=429,
#             detail="Too many verification attempts. Please wait a few minutes and try again."
#         )

#     otp_code      = _generate_otp()
#     password_hash = pwd_context.hash(req.password)
#     expires_at    = datetime.now(timezone.utc) + timedelta(minutes=OTP_EXPIRE_MINUTES)

#     async with pool.acquire() as conn:
#         await conn.execute(
#             "DELETE FROM email_otps WHERE email = $1 AND used = FALSE",
#             email
#         )
#         await conn.execute("""
#             INSERT INTO email_otps
#                 (email, otp_code, first_name, last_name, password_hash, expires_at)
#             VALUES ($1, $2, $3, $4, $5, $6)
#         """,
#             email,
#             otp_code,
#             req.firstName.strip(),
#             req.lastName.strip(),
#             password_hash,
#             expires_at,
#         )

#     loop = asyncio.get_event_loop()
#     email_sent = await loop.run_in_executor(
#         None,
#         lambda: _send_otp_email(email, otp_code, req.firstName.strip())
#     )

#     if not email_sent:
#         async with pool.acquire() as conn:
#             await conn.execute(
#                 "DELETE FROM email_otps WHERE email = $1 AND used = FALSE",
#                 email
#             )
#         raise HTTPException(
#             status_code=503,
#             detail="Failed to send verification email. Please check your email address and try again."
#         )

#     print(f"[AUTH] OTP sent — email: {email}")
#     return {
#         "success":            True,
#         "message":            f"Verification code sent to {email}. It expires in {OTP_EXPIRE_MINUTES} minutes.",
#         "email":              email,
#         "expires_in_minutes": OTP_EXPIRE_MINUTES,
#     }


# @app.post("/auth/verify-otp", response_model=TokenResponse)
# async def verify_otp(req: VerifyOtpRequest):
#     email    = req.email.lower().strip()
#     otp_code = req.otp_code.strip()

#     if not email or not otp_code:
#         raise HTTPException(status_code=422, detail="Email and OTP code are required")

#     pool = await get_pool()

#     async with pool.acquire() as conn:
#         row = await conn.fetchrow("""
#             SELECT id, otp_code, first_name, last_name, password_hash, expires_at, used
#             FROM email_otps
#             WHERE email = $1
#               AND used   = FALSE
#             ORDER BY created_at DESC
#             LIMIT 1
#         """, email)

#     if not row:
#         raise HTTPException(
#             status_code=400,
#             detail="No pending verification found for this email. Please request a new code."
#         )

#     expires_at = row["expires_at"]
#     now        = datetime.now(timezone.utc)
#     if expires_at.tzinfo is None:
#         expires_at = expires_at.replace(tzinfo=timezone.utc)
#     if now > expires_at:
#         raise HTTPException(
#             status_code=400,
#             detail="Verification code has expired. Please request a new one."
#         )

#     if row["otp_code"] != otp_code:
#         raise HTTPException(
#             status_code=400,
#             detail="Incorrect verification code. Please double-check and try again."
#         )

#     async with pool.acquire() as conn:
#         await conn.execute(
#             "UPDATE email_otps SET used = TRUE WHERE id = $1",
#             row["id"]
#         )

#     async with pool.acquire() as conn:
#         existing = await conn.fetchrow(
#             "SELECT id FROM users WHERE email = $1", email
#         )
#         if existing:
#             raise HTTPException(
#                 status_code=409,
#                 detail="An account with this email already exists. Please sign in."
#             )

#         user_row = await conn.fetchrow("""
#             INSERT INTO users (first_name, last_name, email, password_hash, email_verified)
#             VALUES ($1, $2, $3, $4, TRUE)
#             RETURNING id, first_name, last_name, email, is_admin, created_at
#         """,
#             row["first_name"],
#             row["last_name"],
#             email,
#             row["password_hash"],
#         )

#     user  = dict(user_row)
#     token = create_jwt(user["id"], user["email"], user["is_admin"])

#     print(f"[AUTH] ✓ Account created via OTP: {email} (id={user['id']})")
#     return {
#         "access_token": token,
#         "user": {
#             "id":        user["id"],
#             "firstName": user["first_name"],
#             "lastName":  user["last_name"],
#             "email":     user["email"],
#             "isAdmin":   user["is_admin"],
#         },
#     }


# @app.post("/auth/resend-otp")
# async def resend_otp(req: ResendOtpRequest):
#     email = req.email.lower().strip()
#     if not email:
#         raise HTTPException(status_code=422, detail="Email is required")

#     pool = await get_pool()

#     async with pool.acquire() as conn:
#         existing = await conn.fetchrow(
#             "SELECT id FROM users WHERE email = $1", email
#         )
#     if existing:
#         raise HTTPException(
#             status_code=409,
#             detail="This email is already registered. Please sign in."
#         )

#     async with pool.acquire() as conn:
#         pending = await conn.fetchrow("""
#             SELECT first_name, last_name, password_hash
#             FROM email_otps
#             WHERE email = $1
#             ORDER BY created_at DESC
#             LIMIT 1
#         """, email)

#     if not pending:
#         raise HTTPException(
#             status_code=400,
#             detail="No pending registration found. Please start the signup process again."
#         )

#     async with pool.acquire() as conn:
#         recent_count = await conn.fetchval("""
#             SELECT COUNT(*) FROM email_otps
#             WHERE email = $1
#               AND created_at > NOW() - INTERVAL '10 minutes'
#         """, email)

#     if (recent_count or 0) >= 5:
#         raise HTTPException(
#             status_code=429,
#             detail="Too many resend attempts. Please wait a few minutes."
#         )

#     otp_code   = _generate_otp()
#     expires_at = datetime.now(timezone.utc) + timedelta(minutes=OTP_EXPIRE_MINUTES)

#     async with pool.acquire() as conn:
#         await conn.execute(
#             "DELETE FROM email_otps WHERE email = $1 AND used = FALSE",
#             email
#         )
#         await conn.execute("""
#             INSERT INTO email_otps
#                 (email, otp_code, first_name, last_name, password_hash, expires_at)
#             VALUES ($1, $2, $3, $4, $5, $6)
#         """,
#             email,
#             otp_code,
#             pending["first_name"],
#             pending["last_name"],
#             pending["password_hash"],
#             expires_at,
#         )

#     loop = asyncio.get_event_loop()
#     email_sent = await loop.run_in_executor(
#         None,
#         lambda: _send_otp_email(email, otp_code, pending["first_name"])
#     )

#     if not email_sent:
#         raise HTTPException(status_code=503, detail="Failed to resend email. Please try again.")

#     print(f"[AUTH] OTP resent — email: {email}")
#     return {
#         "success":            True,
#         "message":            f"New verification code sent to {email}.",
#         "expires_in_minutes": OTP_EXPIRE_MINUTES,
#     }


# @app.post("/auth/login", response_model=TokenResponse)
# async def login(req: LoginRequest, request: Request = None):
#     # Security D: Per-IP brute-force protection on login
#     if request and not check_rate_limit(request, "/auth/login", max_requests=20):
#         raise HTTPException(status_code=429, detail="Too many login attempts. Please wait.")
#     pool = await get_pool()
#     async with pool.acquire() as conn:
#         row = await conn.fetchrow(
#             "SELECT * FROM users WHERE email = $1", req.email.lower().strip()
#         )

#     if not row or not pwd_context.verify(req.password, row["password_hash"]):
#         raise HTTPException(status_code=401, detail="Invalid email or password")

#     user = dict(row)

#     # MVP: Email verification gate — enforced when REQUIRE_EMAIL_VERIFICATION=true
#     if REQUIRE_EMAIL_VERIFICATION and not user.get("email_verified", False) and not user.get("is_admin", False):
#         raise HTTPException(
#             status_code=403,
#             detail="Please verify your email address before signing in. Check your inbox for a verification code."
#         )

#     token = create_jwt(user["id"], user["email"], user["is_admin"])
#     print(f"[AUTH] ✓ Login: {user['email']} (admin={user['is_admin']})")
#     return {
#         "access_token": token,
#         "user": {
#             "id":        user["id"],
#             "firstName": user["first_name"],
#             "lastName":  user["last_name"],
#             "email":     user["email"],
#             "isAdmin":   user["is_admin"],
#         },
#     }


# @app.get("/auth/me")
# async def get_me(authorization: Optional[str] = Header(None)):
#     payload = await get_current_user(authorization)
#     pool    = await get_pool()
#     async with pool.acquire() as conn:
#         row = await conn.fetchrow(
#             "SELECT id, first_name, last_name, email, is_admin, email_verified FROM users WHERE id = $1",
#             int(payload["sub"])
#         )
#     if not row:
#         raise HTTPException(status_code=404, detail="User not found")
#     user = dict(row)
#     return {
#         "id":            user["id"],
#         "firstName":     user["first_name"],
#         "lastName":      user["last_name"],
#         "email":         user["email"],
#         "isAdmin":       user["is_admin"],
#         "emailVerified": user["email_verified"],
#     }


# # ──────────────────────────────────────────────
# # Article / blog endpoints
# # ──────────────────────────────────────────────
# @app.post("/run")
# async def run(request: Request, authorization: Optional[str] = Header(None)):
#     # Require admin and check rate limit
#     payload = await require_admin(authorization)
#     user_id = int(payload["sub"])
    
#     if not check_rate_limit(request, "/run"):
#         pool = await get_pool()
#         await log_admin_action(pool, user_id, "rate_limit_exceeded", "/run", "Too many requests")
#         raise HTTPException(status_code=429, detail="Rate limit exceeded. Max 5 requests per hour.")
    
#     pool = await get_pool()
#     await log_admin_action(pool, user_id, "run_pipeline", "/run", "Triggered article generation pipeline")
    
#     try:
#         result = await run_pipeline()
#         if result:
#             return {
#                 "success":   True,
#                 "slug":      result.get("slug"),
#                 "image_url": result.get("image_url"),
#             }
#         return {
#             "success": False,
#             "message": f"No article generated (need {MIN_SOURCE_ARTICLES} source articles minimum)",
#         }
#     except Exception as e:
#         print(f"[API] /run error: {type(e).__name__}: {e}")
#         import traceback; traceback.print_exc()
#         await log_admin_action(pool, user_id, "run_pipeline_error", "/run", str(e))
#         raise HTTPException(status_code=500, detail=str(e))


# @app.get("/articles/comment-counts")
# async def get_comment_counts():
#     pool = await get_pool()
#     async with pool.acquire() as conn:
#         rows = await conn.fetch("""
#             SELECT
#                 a.id as article_id,
#                 COUNT(DISTINCT ac.id) as real_count,
#                 COUNT(DISTINCT ai.id) as ai_count
#             FROM blog_articles a
#             LEFT JOIN article_comments ac ON ac.article_id = a.id
#             LEFT JOIN ai_comments ai ON ai.article_id = a.id
#             GROUP BY a.id
#         """)
#     return {
#         "counts": {
#             str(r["article_id"]): r["real_count"] + r["ai_count"]
#             for r in rows
#         }
#     }


# @app.get("/articles")
# async def get_articles():
#     pool = await get_pool()
#     async with pool.acquire() as conn:
#         rows = await conn.fetch(
#             "SELECT * FROM blog_articles ORDER BY created_at DESC LIMIT 100"
#         )
#     articles = [record_to_dict(r) for r in rows]
#     return {"success": True, "count": len(articles), "articles": articles}


# @app.get("/articles/{article_id}")
# async def get_article_by_id(article_id: int):
#     pool = await get_pool()
#     async with pool.acquire() as conn:
#         row = await conn.fetchrow(
#             "SELECT * FROM blog_articles WHERE id = $1", article_id
#         )

#     if row is None:
#         raise HTTPException(status_code=404, detail=f"Article with id {article_id} not found")

#     article = record_to_dict(row)

#     created_at = article.get("created_at")
#     if created_at:
#         try:
#             date_str = datetime.fromisoformat(str(created_at)).strftime("%B %d, %Y")
#         except ValueError:
#             date_str = str(created_at)
#     else:
#         date_str = ""

#     return {
#         "success": True,
#         "article": {
#             **article,
#             "content":      article.get("body", ""),
#             "image":        article.get("image_url", ""),
#             "date":         date_str,
#             "read_time":    article.get("read_time", ""),
#             "author":       article.get("author", "GIA Editorial"),
#             "likes":        article.get("likes", 0),
#             "commentsList": [],
#         },
#     }


# # ──────────────────────────────────────────────
# # Likes endpoints
# # ──────────────────────────────────────────────
# @app.post("/articles/{article_id}/like")
# async def toggle_like(article_id: int, authorization: Optional[str] = Header(None)):
#     payload = await get_current_user(authorization)
#     user_id = int(payload["sub"])
#     pool    = await get_pool()

#     async with pool.acquire() as conn:
#         exists = await conn.fetchval(
#             "SELECT id FROM blog_articles WHERE id = $1", article_id
#         )
#         if not exists:
#             raise HTTPException(status_code=404, detail="Article not found")

#         existing = await conn.fetchrow(
#             "SELECT id FROM article_likes WHERE article_id=$1 AND user_id=$2",
#             article_id, user_id
#         )

#         if existing:
#             await conn.execute(
#                 "DELETE FROM article_likes WHERE article_id=$1 AND user_id=$2",
#                 article_id, user_id
#             )
#             await conn.execute(
#                 "UPDATE blog_articles SET likes = GREATEST(likes - 1, 0) WHERE id=$1",
#                 article_id
#             )
#             liked = False
#         else:
#             await conn.execute(
#                 "INSERT INTO article_likes (article_id, user_id) VALUES ($1, $2)",
#                 article_id, user_id
#             )
#             await conn.execute(
#                 "UPDATE blog_articles SET likes = likes + 1 WHERE id=$1",
#                 article_id
#             )
#             liked = True

#         count = await conn.fetchval(
#             "SELECT likes FROM blog_articles WHERE id=$1", article_id
#         )

#     # FIX C: Emit interaction event
#     if liked:
#         try:
#             await emit_interaction_event(
#                 pool=pool,
#                 event_type="blog_like",
#                 entity_id=str(article_id),
#                 entity_type="article",
#                 payload={},
#                 user_id=user_id,
#             )
#         except Exception as e:
#             print(f"[EVENT] ⚠ blog_like emit failed: {e}")

#     print(f"[API] Like toggle — article={article_id} user={user_id} liked={liked} count={count}")
#     return {"success": True, "liked": liked, "likes": count}


# @app.get("/articles/{article_id}/like-status")
# async def like_status(article_id: int, authorization: Optional[str] = Header(None)):
#     if not authorization or not authorization.startswith("Bearer "):
#         return {"liked": False}
#     try:
#         payload = decode_jwt(authorization.split(" ", 1)[1])
#     except Exception:
#         return {"liked": False}

#     user_id = int(payload["sub"])
#     pool    = await get_pool()
#     async with pool.acquire() as conn:
#         row = await conn.fetchrow(
#             "SELECT id FROM article_likes WHERE article_id=$1 AND user_id=$2",
#             article_id, user_id
#         )
#     return {"liked": row is not None}


# # ──────────────────────────────────────────────
# # Comments endpoints
# # ──────────────────────────────────────────────
# @app.get("/articles/{article_id}/comments")
# async def get_comments(article_id: int):
#     pool = await get_pool()
#     async with pool.acquire() as conn:
#         rows = await conn.fetch("""
#             SELECT
#                 c.id,
#                 c.text,
#                 c.created_at,
#                 u.first_name || ' ' || u.last_name AS username
#             FROM article_comments c
#             JOIN users u ON u.id = c.user_id
#             WHERE c.article_id = $1
#             ORDER BY c.created_at DESC
#         """, article_id)

#     comments = [
#         {
#             "id":   r["id"],
#             "user": r["username"],
#             "text": r["text"],
#             "time": r["created_at"].strftime("%b %d, %Y · %H:%M"),
#         }
#         for r in rows
#     ]
#     return {"success": True, "comments": comments}


# @app.post("/articles/{article_id}/comments")
# async def add_comment(
#     article_id: int,
#     req: CommentRequest,
#     request: Request,
#     authorization: Optional[str] = Header(None),
# ):
#     payload = await get_current_user(authorization)
#     user_id = int(payload["sub"])

#     # Security B: Rate limit comments per user (max 10 per hour to prevent spam)
#     if not check_user_rate_limit(f"user_{user_id}", "/articles/comments", max_requests=10, window_seconds=3600):
#         raise HTTPException(status_code=429, detail="Too many comments. Max 10 per hour.")

#     text = req.text.strip()
#     if not text:
#         raise HTTPException(status_code=422, detail="Comment text cannot be empty")
#     if len(text) > 2000:
#         raise HTTPException(status_code=422, detail="Comment too long (max 2000 characters)")

#     pool = await get_pool()
#     async with pool.acquire() as conn:
#         exists = await conn.fetchval(
#             "SELECT id FROM blog_articles WHERE id = $1", article_id
#         )
#         if not exists:
#             raise HTTPException(status_code=404, detail="Article not found")

#         row = await conn.fetchrow("""
#             INSERT INTO article_comments (article_id, user_id, text)
#             VALUES ($1, $2, $3)
#             RETURNING id, text, created_at
#         """, article_id, user_id, text)

#         user_row = await conn.fetchrow(
#             "SELECT first_name, last_name FROM users WHERE id=$1", user_id
#         )

#     # FIX C: Emit interaction event for blog comment
#     try:
#         await emit_interaction_event(
#             pool=pool,
#             event_type="blog_comment",
#             entity_id=str(article_id),
#             entity_type="article",
#             payload={"text_length": len(text)},
#             user_id=user_id,
#         )
#     except Exception as e:
#         print(f"[EVENT] ⚠ blog_comment emit failed: {e}")

#     comment = {
#         "id":   row["id"],
#         "user": f"{user_row['first_name']} {user_row['last_name']}",
#         "text": row["text"],
#         "time": row["created_at"].strftime("%b %d, %Y · %H:%M"),
#     }
#     print(f"[API] Comment added — article={article_id} user={user_id}")
#     return {"success": True, "comment": comment}


# # ──────────────────────────────────────────────
# # AI Comments endpoint
# # ──────────────────────────────────────────────
# @app.post("/generate-comments")
# async def get_ai_comments(req: GenerateCommentsRequest):
#     pool = await get_pool()
#     async with pool.acquire() as conn:
#         rows = await conn.fetch("""
#             SELECT id, user_name, text, time_label
#             FROM ai_comments
#             WHERE article_id = $1
#             ORDER BY created_at ASC
#         """, req.article_id)

#     return {
#         "comments": [
#             {
#                 "id":   f"ai-{row['id']}",
#                 "user": row["user_name"],
#                 "text": row["text"],
#                 "time": row["time_label"],
#                 "isAI": True,
#             }
#             for row in rows
#         ]
#     }


# # ──────────────────────────────────────────────
# # Trends / memory / scraped-url endpoints
# # ──────────────────────────────────────────────
# @app.get("/trends")
# async def get_trends():
#     pool = await get_pool()
#     async with pool.acquire() as conn:
#         rows = await conn.fetch(
#             "SELECT * FROM trends ORDER BY created_at DESC LIMIT 100"
#         )
#     trends = [record_to_dict(r) for r in rows]
#     return {"success": True, "count": len(trends), "trends": trends}


# @app.post("/memory/store")
# async def store_memory(request: MemoryStoreRequest):
#     embedding = await generate_embedding(request.content)
#     pool = await get_pool()
#     async with pool.acquire() as conn:
#         await conn.execute("""
#             INSERT INTO memory_entries (type, content, payload, embedding, created_at)
#             VALUES ($1, $2, $3::jsonb, $4::jsonb, NOW())
#         """,
#             request.type,
#             request.content,
#             json.dumps(request.payload),
#             json.dumps(embedding),
#         )
#     print(f"[API] Memory stored — type: {request.type}")
#     return {"success": True}


# @app.get("/scraped-urls/stats")
# async def scraped_url_stats():
#     pool   = await get_pool()
#     cutoff = datetime.utcnow() - timedelta(days=URL_REUSE_DAYS)
#     async with pool.acquire() as conn:
#         total  = await conn.fetchval("SELECT COUNT(*) FROM scraped_urls")
#         recent = await conn.fetchval(
#             "SELECT COUNT(*) FROM scraped_urls WHERE last_scraped >= $1", cutoff
#         )
#     return {
#         "total_known_urls":            total,
#         "blocked_within_reuse_window": recent,
#         "available_for_rescrape":      total - recent,
#         "url_reuse_days":              URL_REUSE_DAYS,
#     }


# @app.delete("/scraped-urls/reset")
# async def reset_scraped_urls(request: Request, authorization: Optional[str] = Header(None)):
#     # Require admin and check rate limit
#     payload = await require_admin(authorization)
#     user_id = int(payload["sub"])
    
#     if not check_rate_limit(request, "/scraped-urls/reset"):
#         pool = await get_pool()
#         await log_admin_action(pool, user_id, "rate_limit_exceeded", "/scraped-urls/reset", "Too many requests")
#         raise HTTPException(status_code=429, detail="Rate limit exceeded. Max 5 requests per hour.")
    
#     pool = await get_pool()
#     await log_admin_action(pool, user_id, "reset_scraped_urls", "/scraped-urls/reset", "Cleared URL history")
    
#     async with pool.acquire() as conn:
#         result = await conn.execute("DELETE FROM scraped_urls")
#     deleted = int(result.split()[-1]) if result else 0
#     print(f"[API] URL history cleared — {deleted} records deleted")
#     return {"success": True, "deleted": deleted}


# @app.get("/")
# async def root():
#     return {
#         "message":  "GIA AI Blog Backend running (Supabase/PostgreSQL)",
#         "python":   sys.version,
#         "platform": sys.platform,
#     }


# # ──────────────────────────────────────────────
# # Source rotation status endpoint
# # ──────────────────────────────────────────────
# @app.get("/source-rotation/status")
# async def get_source_rotation_status():
#     pool = await get_pool()
#     async with pool.acquire() as conn:
#         row = await conn.fetchrow(
#             "SELECT last_used_source, updated_at FROM source_rotation_state WHERE id = 1"
#         )
#     last_used  = row["last_used_source"] if row else None
#     updated_at = row["updated_at"].isoformat() if row and row["updated_at"] else None
#     next_priority = _circular_priority_order(last_used)
#     return {
#         "last_used_source":    last_used,
#         "updated_at":          updated_at,
#         "next_priority_order": next_priority,
#         "sources":             SOURCE_NAMES,
#     }


# @app.post("/source-rotation/reset")
# async def reset_source_rotation(request: Request, authorization: Optional[str] = Header(None)):
#     # Require admin and check rate limit
#     payload = await require_admin(authorization)
#     user_id = int(payload["sub"])
    
#     if not check_rate_limit(request, "/source-rotation/reset"):
#         pool = await get_pool()
#         await log_admin_action(pool, user_id, "rate_limit_exceeded", "/source-rotation/reset", "Too many requests")
#         raise HTTPException(status_code=429, detail="Rate limit exceeded. Max 5 requests per hour.")
    
#     pool = await get_pool()
#     await log_admin_action(pool, user_id, "reset_source_rotation", "/source-rotation/reset", "Reset source rotation state")
    
#     async with pool.acquire() as conn:
#         await conn.execute("""
#             UPDATE source_rotation_state
#             SET last_used_source = NULL, updated_at = NOW()
#             WHERE id = 1
#         """)
#     print("[API] Source rotation state reset")
#     return {"success": True, "message": "Rotation reset — next run starts from first source"}


# # ──────────────────────────────────────────────
# # Vector search endpoints
# # ──────────────────────────────────────────────
# @app.post("/memory/vector-search")
# async def api_vector_search(req: VectorSearchRequest):
#     if req.top_k < 1 or req.top_k > 50:
#         raise HTTPException(status_code=422, detail="top_k must be between 1 and 50")

#     results = await vector_search_memory(
#         query_text=req.query,
#         memory_type=req.memory_type,
#         top_k=req.top_k,
#         min_similarity=req.min_similarity,
#     )
#     return {"success": True, "count": len(results), "results": results}


# @app.get("/memory/design-context")
# async def api_design_context(
#     query: str = "fashion design trends audience preferences",
#     top_k_signals: int = 10,
#     top_k_trends:  int = 10,
# ):
#     # FIX D: Use single context assembler
#     context = await assemble_design_context(
#         query=query,
#         top_k_signals=top_k_signals,
#         top_k_trends=top_k_trends,
#     )
#     return {"success": True, **context}


# @app.post("/design-signals/sync-embeddings")
# async def sync_design_signal_embeddings():
#     pool = await get_pool()
#     async with pool.acquire() as conn:
#         rows = await conn.fetch("""
#             SELECT DISTINCT ON (tag) tag, category, vote_score, like_score,
#                    comment_score, trend_score, total_score
#             FROM design_signals
#             ORDER BY tag, computed_at DESC
#         """)

#     print(f"[SYNC-EMBED] Backfilling embeddings for {len(rows)} design signal tags…")
#     count = 0
#     for row in rows:
#         try:
#             await store_design_signal_embedding(
#                 tag=row["tag"],
#                 category=row["category"],
#                 vote_score=row["vote_score"],
#                 like_score=row["like_score"],
#                 comment_score=row["comment_score"],
#                 trend_score=row["trend_score"],
#                 total_score=row["total_score"],
#             )
#             count += 1
#         except Exception as e:
#             print(f"[SYNC-EMBED] ✗ tag={row['tag']}: {e}")

#     return {"success": True, "synced": count}


# @app.post("/trends/sync-embeddings")
# async def sync_trend_embeddings():
#     pool = await get_pool()
#     async with pool.acquire() as conn:
#         rows = await conn.fetch("""
#             SELECT title, description, related_tags, source_articles
#             FROM trends
#             ORDER BY created_at DESC
#             LIMIT 200
#         """)

#     print(f"[SYNC-EMBED] Backfilling embeddings for {len(rows)} trends…")
#     count = 0
#     for row in rows:
#         try:
#             await store_trend_embedding(
#                 trend_title=row["title"],
#                 trend_description=row["description"] or "",
#                 related_tags=json.loads(row["related_tags"])    if row["related_tags"]    else [],
#                 source_articles=json.loads(row["source_articles"]) if row["source_articles"] else [],
#             )
#             count += 1
#         except Exception as e:
#             print(f"[SYNC-EMBED] ✗ title={row['title']}: {e}")

#     return {"success": True, "synced": count}


# # ──────────────────────────────────────────────
# # FIX A: /style-agent is DEPRECATED — returns 410 Gone, clients must use /gpt/query
# # ──────────────────────────────────────────────
# @app.post("/style-agent")
# async def style_agent(req: StyleAgentRequest):
#     """
#     DEPRECATED: This endpoint has been removed. Use POST /gpt/query instead.
#     Returns HTTP 410 Gone to force client migration.
#     """
#     raise HTTPException(
#         status_code=410,
#         detail="This endpoint has been deprecated. Please use POST /gpt/query for all conversational AI features.",
#         headers={"X-Upgrade-Required": "true"},
#     )


# # FIX A: /agent/styling is also DEPRECATED — returns 410 Gone, clients must use /gpt/query
# # ──────────────────────────────────────────────
# @app.post("/agent/styling")
# async def agent_styling(req: StyleAgentRequest):
#     """
#     DEPRECATED: This endpoint has been removed. Use POST /gpt/query instead.
#     Returns HTTP 410 Gone to force client migration.
#     """
#     raise HTTPException(
#         status_code=410,
#         detail="This endpoint has been deprecated. Please use POST /gpt/query for all conversational AI features.",
#         headers={"X-Upgrade-Required": "true"},
#     )


# # ──────────────────────────────────────────────
# # FIX C: Interaction event endpoint
# # ──────────────────────────────────────────────
# @app.post("/events/interaction")
# async def post_interaction_event(
#     req: InteractionEventRequest,
#     request: Request = None,
#     authorization: Optional[str] = Header(None),
# ):
#     """
#     Receive a canonical interaction event from the frontend.
#     Valid event_types: blog_like | blog_comment | design_view | vote_cast |
#                        save_look | chat_query | paid_feature_use
#     Rate limited: 120 events/hour per IP (prevents flood abuse).
#     """
#     if req.event_type not in VALID_EVENT_TYPES:
#         raise HTTPException(
#             status_code=422,
#             detail=f"Invalid event_type. Must be one of: {sorted(VALID_EVENT_TYPES)}"
#         )

#     # Per-IP abuse prevention for event ingestion
#     if request and not check_rate_limit(request, "/events/interaction", max_requests=120):
#         raise HTTPException(status_code=429, detail="Event rate limit exceeded. Please slow down.")

#     pool     = await get_pool()
#     user_payload = await get_optional_user(authorization)
#     user_id  = int(user_payload["sub"]) if user_payload else None

#     await emit_interaction_event(
#         pool=pool,
#         event_type=req.event_type,
#         entity_id=req.entity_id,
#         entity_type=req.entity_type,
#         payload=req.payload,
#         user_id=user_id,
#     )

#     return {"success": True, "event_type": req.event_type}


# @app.post("/events/feedback-loop/run")
# async def run_feedback_loop_endpoint(request: Request, authorization: Optional[str] = Header(None)):
#     """Manually trigger the Feedback Loop Processor."""
#     # Require admin and check rate limit
#     payload = await require_admin(authorization)
#     user_id = int(payload["sub"])
    
#     if not check_rate_limit(request, "/events/feedback-loop/run"):
#         pool = await get_pool()
#         await log_admin_action(pool, user_id, "rate_limit_exceeded", "/events/feedback-loop/run", "Too many requests")
#         raise HTTPException(status_code=429, detail="Rate limit exceeded. Max 5 requests per hour.")
    
#     pool = await get_pool()
#     await log_admin_action(pool, user_id, "run_feedback_loop", "/events/feedback-loop/run", "Triggered feedback loop processor")
    
#     result = await run_feedback_loop_processor(pool)
#     return {"success": True, **result}


# @app.get("/events/interaction/recent")
# async def get_recent_events(
#     limit: int = 50,
#     event_type: Optional[str] = None,
# ):
#     pool = await get_pool()
#     async with pool.acquire() as conn:
#         if event_type:
#             rows = await conn.fetch("""
#                 SELECT id, event_type, user_id, entity_id, entity_type, payload, created_at
#                 FROM interaction_events
#                 WHERE event_type = $1
#                 ORDER BY created_at DESC LIMIT $2
#             """, event_type, limit)
#         else:
#             rows = await conn.fetch("""
#                 SELECT id, event_type, user_id, entity_id, entity_type, payload, created_at
#                 FROM interaction_events
#                 ORDER BY created_at DESC LIMIT $1
#             """, limit)

#     events = []
#     for r in rows:
#         d = dict(r)
#         d["created_at"] = d["created_at"].isoformat()
#         events.append(d)

#     return {"success": True, "count": len(events), "events": events}


# # ──────────────────────────────────────────────
# # FIX B: Collection (domain primitive) endpoints
# # ──────────────────────────────────────────────
# @app.get("/collections")
# async def get_collections(lifecycle: Optional[str] = None):
#     """List all first-class collections (active, draft, published, archived)."""
#     pool = await get_pool()
#     async with pool.acquire() as conn:
#         if lifecycle:
#             rows = await conn.fetch("""
#                 SELECT c.*, COUNT(gd.id) AS design_count
#                 FROM collections c
#                 LEFT JOIN generated_designs gd ON gd.collection_id = c.id
#                 WHERE c.lifecycle = $1
#                 GROUP BY c.id
#                 ORDER BY c.created_at DESC
#             """, lifecycle)
#         else:
#             rows = await conn.fetch("""
#                 SELECT c.*, COUNT(gd.id) AS design_count
#                 FROM collections c
#                 LEFT JOIN generated_designs gd ON gd.collection_id = c.id
#                 GROUP BY c.id
#                 ORDER BY c.created_at DESC
#             """)

#     collections = []
#     for r in rows:
#         d = dict(r)
#         for f in ("created_at", "published_at", "archived_at"):
#             if d.get(f):
#                 d[f] = d[f].isoformat()
#         collections.append(d)

#     return {"success": True, "count": len(collections), "collections": collections}


# @app.get("/collections/{collection_id}")
# async def get_collection(collection_id: int):
#     pool = await get_pool()
#     async with pool.acquire() as conn:
#         row = await conn.fetchrow("""
#             SELECT c.*, COUNT(gd.id) AS design_count
#             FROM collections c
#             LEFT JOIN generated_designs gd ON gd.collection_id = c.id
#             WHERE c.id = $1
#             GROUP BY c.id
#         """, collection_id)

#     if not row:
#         raise HTTPException(status_code=404, detail="Collection not found")

#     d = dict(row)
#     for f in ("created_at", "published_at", "archived_at"):
#         if d.get(f):
#             d[f] = d[f].isoformat()

#     return {"success": True, "collection": d}


# @app.post("/collections")
# async def create_collection(
#     req: CreateCollectionRequest,
#     authorization: Optional[str] = Header(None),
# ):
#     payload = await get_current_user(authorization)
#     if not payload.get("is_admin"):
#         raise HTTPException(status_code=403, detail="Admin only")

#     if req.lifecycle not in ("draft", "active", "published", "archived"):
#         raise HTTPException(status_code=422, detail="lifecycle must be: draft | active | published | archived")

#     pool = await get_pool()
#     async with pool.acquire() as conn:
#         row = await conn.fetchrow("""
#             INSERT INTO collections (name, description, lifecycle)
#             VALUES ($1, $2, $3)
#             RETURNING id, name, description, lifecycle, created_at
#         """, req.name, req.description, req.lifecycle)

#     d = dict(row)
#     d["created_at"] = d["created_at"].isoformat()
#     return {"success": True, "collection": d}


# @app.patch("/collections/{collection_id}")
# async def update_collection(
#     collection_id: int,
#     req: UpdateCollectionRequest,
#     authorization: Optional[str] = Header(None),
# ):
#     payload = await get_current_user(authorization)
#     if not payload.get("is_admin"):
#         raise HTTPException(status_code=403, detail="Admin only")

#     if req.lifecycle and req.lifecycle not in ("draft", "active", "published", "archived"):
#         raise HTTPException(status_code=422, detail="lifecycle must be: draft | active | published | archived")

#     pool = await get_pool()
#     async with pool.acquire() as conn:
#         updates = []
#         vals    = []
#         idx     = 1

#         if req.name is not None:
#             updates.append(f"name = ${idx}"); vals.append(req.name); idx += 1
#         if req.description is not None:
#             updates.append(f"description = ${idx}"); vals.append(req.description); idx += 1
#         if req.lifecycle is not None:
#             updates.append(f"lifecycle = ${idx}"); vals.append(req.lifecycle); idx += 1
#             if req.lifecycle == "published":
#                 updates.append(f"published_at = NOW()")
#             elif req.lifecycle == "archived":
#                 updates.append(f"archived_at = NOW()")

#         if not updates:
#             raise HTTPException(status_code=422, detail="Nothing to update")

#         vals.append(collection_id)
#         row = await conn.fetchrow(f"""
#             UPDATE collections SET {', '.join(updates)}
#             WHERE id = ${idx}
#             RETURNING id, name, description, lifecycle, created_at, published_at, archived_at
#         """, *vals)

#     if not row:
#         raise HTTPException(status_code=404, detail="Collection not found")

#     d = dict(row)
#     for f in ("created_at", "published_at", "archived_at"):
#         if d.get(f):
#             d[f] = d[f].isoformat()

#     return {"success": True, "collection": d}


# @app.get("/collections/{collection_id}/showroom")
# async def get_collection_showroom(collection_id: int, page: int = 1, limit: int = 15):
#     """Return showroom items belonging to a specific collection."""
#     limit  = max(1, min(limit, 100))
#     offset = (page - 1) * limit

#     pool = await get_pool()
#     async with pool.acquire() as conn:
#         total = await conn.fetchval("""
#             SELECT COUNT(*) FROM showroom s
#             JOIN generated_designs gd ON gd.id = s.design_id
#             WHERE gd.collection_id = $1
#         """, collection_id)

#         rows = await conn.fetch("""
#             SELECT
#                 s.id, s.design_id, s.title, s.description, s.image_url,
#                 s.model_url, s.tags, s.likes, s.vision_score, s.created_at,
#                 gd.top_tags, gd.collection_id,
#                 CONCAT('design-', gd.id) AS product_item_id,
#                 COUNT(iv.id)::INT AS votes
#             FROM showroom s
#             JOIN generated_designs gd ON gd.id = s.design_id
#             LEFT JOIN item_votes iv ON iv.item_id = CONCAT('design-', gd.id)
#             WHERE gd.collection_id = $1
#             GROUP BY s.id, s.design_id, s.title, s.description, s.image_url,
#                      s.model_url, s.tags, s.likes, s.vision_score, s.created_at,
#                      gd.top_tags, gd.collection_id, gd.id
#             ORDER BY s.created_at DESC
#             LIMIT $2 OFFSET $3
#         """, collection_id, limit, offset)

#     items = []
#     for r in rows:
#         d = dict(r)
#         d["created_at"] = d["created_at"].isoformat()
#         for field in ("tags", "top_tags"):
#             if isinstance(d.get(field), str):
#                 try:
#                     d[field] = json.loads(d[field])
#                 except Exception:
#                     d[field] = []
#         items.append(d)

#     return {
#         "success":     True,
#         "collection_id": collection_id,
#         "total":       total,
#         "total_pages": math.ceil(total / limit) if total else 1,
#         "page":        page,
#         "items":       items,
#     }


# # ──────────────────────────────────────────────
# # FIX A: GSNowGPT chat log endpoint
# # ──────────────────────────────────────────────
# @app.get("/gpt/chat-log")
# async def get_gpt_chat_log(
#     limit:      int           = 50,
#     session_id: Optional[str] = None,
#     authorization: Optional[str] = Header(None),
# ):
#     payload = await get_current_user(authorization)
#     if not payload.get("is_admin"):
#         raise HTTPException(status_code=403, detail="Admin only")

#     pool = await get_pool()
#     async with pool.acquire() as conn:
#         if session_id:
#             rows = await conn.fetch("""
#                 SELECT id, session_id, user_id, intent, user_message,
#                        response_type, response_payload, created_at
#                 FROM gsnowgpt_chat_log
#                 WHERE session_id = $1
#                 ORDER BY created_at DESC LIMIT $2
#             """, session_id, limit)
#         else:
#             rows = await conn.fetch("""
#                 SELECT id, session_id, user_id, intent, user_message,
#                        response_type, response_payload, created_at
#                 FROM gsnowgpt_chat_log
#                 ORDER BY created_at DESC LIMIT $1
#             """, limit)

#     logs = []
#     for r in rows:
#         d = dict(r)
#         d["created_at"] = d["created_at"].isoformat()
#         logs.append(d)

#     return {"success": True, "count": len(logs), "logs": logs}


# @app.get("/gpt/quota")
# async def get_gpt_quota(request: Request = None, authorization: Optional[str] = Header(None)):
#     """
#     MVP monetization: Return user's current GSNowGPT message quota.
#     Free users see their remaining daily messages.
#     Paid users see unlimited status.
#     Frontend uses this to display usage indicators and upgrade prompts.
#     """
#     pool         = await get_pool()
#     user_payload = await get_optional_user(authorization)
#     user_id      = int(user_payload["sub"]) if user_payload else None
#     is_paid      = await _check_premium_access(user_id, pool) if user_id else False

#     import time
#     now = time.time()

#     if is_paid:
#         # Paid: virtually unlimited — report high ceiling
#         rate_key = str(user_id)
#         used_entries = RATE_LIMIT_REQUESTS.get((rate_key, "/gpt/query/paid"), [])
#         used_this_hour = len([ts for ts in used_entries if now - ts < 3600])
#         return {
#             "plan":             "paid",
#             "daily_limit":      None,
#             "hourly_limit":     GPT_PAID_HOURLY_LIMIT,
#             "used_this_hour":   used_this_hour,
#             "remaining":        max(0, GPT_PAID_HOURLY_LIMIT - used_this_hour),
#             "resets_in_seconds": None,
#             "unlimited":        True,
#         }
#     else:
#         # Free: daily limit
#         rate_key = str(user_id) if user_id else (request.client.host if request else "anon")
#         used_entries = RATE_LIMIT_REQUESTS.get((rate_key, "/gpt/query/free"), [])
#         used_today   = [ts for ts in used_entries if now - ts < 86400]
#         remaining    = max(0, GPT_FREE_DAILY_LIMIT - len(used_today))
#         resets_in    = int(86400 - (now - min(used_today))) if used_today else 86400
#         return {
#             "plan":             "free",
#             "daily_limit":      GPT_FREE_DAILY_LIMIT,
#             "hourly_limit":     None,
#             "used_today":       len(used_today),
#             "remaining":        remaining,
#             "resets_in_seconds": resets_in,
#             "unlimited":        False,
#             "upgrade_url":      "/pricing",
#         }


# # ──────────────────────────────────────────────
# # Product Voting Endpoints
# # ──────────────────────────────────────────────
# # @app.post("/products/{product_id}/vote")
# # async def vote_product(product_id: str, authorization: Optional[str] = Header(None)):
# #     if not authorization or not authorization.startswith("Bearer "):
# #         raise HTTPException(status_code=401, detail="Authentication required")

# #     payload = decode_jwt(authorization.split(" ", 1)[1])
# #     user_id = int(payload["sub"])

# #     pool = await get_pool()

# #     async with pool.acquire() as conn:
# #         # FIX: Verify product exists and is active
# #         product = await conn.fetchrow(
# #             "SELECT id FROM product_catalog WHERE item_id=$1",
# #             product_id
# #         )
        
# #         if not product:
# #             raise HTTPException(status_code=404, detail="Product not found or is not active")

# #         existing = await conn.fetchrow(
# #             "SELECT id FROM item_votes WHERE item_id=$1 AND user_id=$2",
# #             product_id, user_id
# #         )

# #         if existing:
# #             raise HTTPException(status_code=400, detail="You have already voted for this product")

# #         await conn.execute(
# #             "INSERT INTO item_votes (item_id, user_id) VALUES ($1, $2)",
# #             product_id, user_id
# #         )

# #         vote_count = await conn.fetchval(
# #             "SELECT COUNT(*) FROM item_votes WHERE item_id=$1",
# #             product_id
# #         )

# #     # FIX C: Emit canonical vote event
# #     try:
# #         await emit_interaction_event(
# #             pool=pool,
# #             event_type="vote_cast",
# #             entity_id=product_id,
# #             entity_type="product",
# #             payload={"proxy": False},
# #             user_id=user_id,
# #         )
# #     except Exception as e:
# #         print(f"[EVENT] ⚠ vote_cast emit failed: {e}")

# #     print(f"[VOTE] Product {product_id} voted by user {user_id} → total votes: {vote_count}")
# #     return {"success": True, "votes": vote_count}

# @app.post("/products/{product_id}/vote")
# async def vote_product(product_id: str, request: Request = None, authorization: Optional[str] = Header(None)):
#     if not authorization or not authorization.startswith("Bearer "):
#         raise HTTPException(status_code=401, detail="Authentication required")

#     payload = decode_jwt(authorization.split(" ", 1)[1])
#     user_id = int(payload["sub"])

#     # Per-user rate limit: max 30 votes per hour (anti-spam)
#     if not check_user_rate_limit(str(user_id), "/products/vote", max_requests=30, window_seconds=3600):
#         raise HTTPException(status_code=429, detail="You're voting too fast. Please slow down.")

#     pool = await get_pool()

#     async with pool.acquire() as conn:
#         # Verify product exists AND is active before allowing vote
#         product_exists = await conn.fetchrow(
#             "SELECT 1 FROM product_catalog WHERE item_id = $1 AND is_active = TRUE",
#             product_id
#         )
#         if not product_exists:
#             raise HTTPException(status_code=404, detail="Product not found or is not currently active")

#         existing = await conn.fetchrow(
#             "SELECT id FROM item_votes WHERE item_id=$1 AND user_id=$2",
#             product_id, user_id
#         )

#         if existing:
#             raise HTTPException(status_code=400, detail="You have already voted for this product")

#         # Section 5 requirement: persist vote_explanation on item_votes row
#         vote_row = await conn.fetchrow("""
#             INSERT INTO item_votes (item_id, user_id, vote_explanation)
#             VALUES ($1, $2, $3::jsonb)
#             RETURNING id
#         """, product_id, user_id, json.dumps({"method": "manual", "source": "user_vote"}))

#         vote_count = await conn.fetchval(
#             "SELECT COUNT(*) FROM item_votes WHERE item_id=$1",
#             product_id
#         )

#     # Emit canonical vote event for feedback loop
#     try:
#         await emit_interaction_event(
#             pool=pool,
#             event_type="vote_cast",
#             entity_id=product_id,
#             entity_type="product",
#             payload={"proxy": False, "vote_id": vote_row["id"] if vote_row else None},
#             user_id=user_id,
#         )
#     except Exception as e:
#         print(f"[EVENT] ⚠ vote_cast emit failed: {e}")

#     print(f"[VOTE] Product {product_id} voted by user {user_id} → total votes: {vote_count}")
#     return {"success": True, "votes": vote_count}

# @app.get("/products/{product_id}/vote-status")
# async def get_product_vote_status(product_id: str, authorization: Optional[str] = Header(None)):
#     pool = await get_pool()

#     async with pool.acquire() as conn:
#         vote_count = await conn.fetchval(
#             "SELECT COUNT(*) FROM item_votes WHERE item_id=$1",
#             product_id
#         )

#     has_voted = False

#     if authorization and authorization.startswith("Bearer "):
#         try:
#             payload = decode_jwt(authorization.split(" ", 1)[1])
#             user_id = int(payload["sub"])

#             async with pool.acquire() as conn:
#                 row = await conn.fetchrow(
#                     "SELECT id FROM item_votes WHERE item_id=$1 AND user_id=$2",
#                     product_id, user_id
#                 )
#                 has_voted = row is not None
#         except Exception:
#             has_voted = False

#     return {"hasVoted": has_voted, "votes": vote_count}


# @app.get("/auth/me/stats")
# async def get_my_stats(authorization: Optional[str] = Header(None)):
#     payload = await get_current_user(authorization)
#     user_id = int(payload["sub"])
#     pool = await get_pool()
#     async with pool.acquire() as conn:
#         row = await conn.fetchrow("""
#             SELECT
#                 (SELECT COUNT(*) FROM item_votes WHERE user_id = $1) as votes_cast,
#                 (SELECT COUNT(*) FROM article_comments WHERE user_id = $1) as comments_made,
#                 (SELECT COUNT(*) FROM article_likes WHERE user_id = $1) as articles_liked,
#                 (SELECT COUNT(*) FROM article_comments WHERE user_id = $1) +
#                 (SELECT COUNT(*) FROM article_likes WHERE user_id = $1) +
#                 (SELECT COUNT(*) FROM item_votes WHERE user_id = $1) as activity,
#                 (SELECT created_at FROM users WHERE id = $1) as member_since,
#                 (SELECT COUNT(*) FROM user_collections WHERE user_id = $1) as models_in_collection
#             """, user_id)
#     if not row:
#         return {"votes_cast": 0, "comments_made": 0, "articles_liked": 0, "activity": 0, "member_since": "—", "models_in_collection": 0}
#     return {
#         "votes_cast":           row["votes_cast"] or 0,
#         "comments_made":        row["comments_made"] or 0,
#         "articles_liked":       row["articles_liked"] or 0,
#         "activity":             row["activity"] or 0,
#         "member_since":         row["member_since"].isoformat() if row["member_since"] else "—",
#         "models_in_collection": row["models_in_collection"] or 0,
#     }


# @app.get("/auth/me/activity")
# async def get_my_activity(authorization: Optional[str] = Header(None)):
#     payload = await get_current_user(authorization)
#     user_id = int(payload["sub"])
#     pool    = await get_pool()

#     async with pool.acquire() as conn:
#         vote_rows = await conn.fetch("""
#             SELECT
#                 iv.item_id,
#                 iv.created_at,
#                 COALESCE(pc.name, iv.item_id) AS product_name
#             FROM item_votes iv
#             LEFT JOIN product_catalog pc ON pc.item_id = iv.item_id
#             WHERE iv.user_id = $1
#             ORDER BY iv.created_at DESC
#             LIMIT 10
#         """, user_id)

#         comment_rows = await conn.fetch("""
#             SELECT c.text, c.created_at, a.title AS article_title, a.id AS article_id
#             FROM article_comments c
#             JOIN blog_articles a ON a.id = c.article_id
#             WHERE c.user_id = $1
#             ORDER BY c.created_at DESC
#             LIMIT 5
#         """, user_id)

#         like_rows = await conn.fetch("""
#             SELECT al.created_at, a.title AS article_title, a.id AS article_id
#             FROM article_likes al
#             JOIN blog_articles a ON a.id = al.article_id
#             WHERE al.user_id = $1
#             ORDER BY al.created_at DESC
#             LIMIT 5
#         """, user_id)

#     def fmt_time(dt):
#         if not dt:
#             return ""
#         now  = datetime.utcnow()
#         diff = now - dt.replace(tzinfo=None)
#         if diff.days == 0:
#             h = diff.seconds // 3600
#             return f"{h}h ago" if h else "Just now"
#         if diff.days == 1:
#             return "Yesterday"
#         if diff.days < 7:
#             return f"{diff.days}d ago"
#         return dt.strftime("%b %d")

#     feed = []

#     for r in vote_rows:
#         product_name = r.get("product_name") or r["item_id"]
#         feed.append({
#             "type":  "vote",
#             "icon":  "vote",
#             "label": f'Voted on "{product_name}"',
#             "time":  fmt_time(r["created_at"]),
#             "ts":    r["created_at"].isoformat(),
#         })

#     for r in comment_rows:
#         snippet = r["text"][:60] + ("…" if len(r["text"]) > 60 else "")
#         feed.append({
#             "type":       "comment",
#             "icon":       "comment",
#             "label":      f'Commented on "{r["article_title"]}"',
#             "sublabel":   f'"{snippet}"',
#             "article_id": r["article_id"],
#             "time":       fmt_time(r["created_at"]),
#             "ts":         r["created_at"].isoformat(),
#         })

#     for r in like_rows:
#         feed.append({
#             "type":       "like",
#             "icon":       "like",
#             "label":      f'Liked "{r["article_title"]}"',
#             "article_id": r["article_id"],
#             "time":       fmt_time(r["created_at"]),
#             "ts":         r["created_at"].isoformat(),
#         })

#     feed.sort(key=lambda x: x["ts"], reverse=True)
#     return {"success": True, "feed": feed}


# # ──────────────────────────────────────────────
# # Proxy Voting Endpoints
# # ──────────────────────────────────────────────
# @app.get("/proxy-voting/status")
# async def get_proxy_status(authorization: Optional[str] = Header(None)):
#     payload = await get_current_user(authorization)
#     user_id = int(payload["sub"])

#     pool = await get_pool()
#     async with pool.acquire() as conn:
#         row = await conn.fetchrow(
#             "SELECT enabled, next_run_at, last_run_at FROM user_proxy_settings WHERE user_id = $1",
#             user_id
#         )

#     if not row:
#         return {"enabled": False, "next_run_at": None, "last_run_at": None}

#     return {
#         "enabled":     row["enabled"],
#         "next_run_at": row["next_run_at"].isoformat() if row["next_run_at"] else None,
#         "last_run_at": row["last_run_at"].isoformat() if row["last_run_at"] else None,
#     }


# @app.post("/proxy-voting/toggle")
# async def toggle_proxy_voting(req: ProxyToggleRequest, authorization: Optional[str] = Header(None)):
#     payload = await get_current_user(authorization)
#     user_id = int(payload["sub"])

#     pool = await get_pool()

#     if req.enabled:
#         async with pool.acquire() as conn:
#             vote_count = await conn.fetchval(
#                 "SELECT COUNT(*) FROM item_votes WHERE user_id = $1", user_id
#             )
#         if (vote_count or 0) < 1:
#             raise HTTPException(
#                 status_code=400,
#                 detail="You must cast at least one vote before enabling proxy voting."
#             )

#     next_run_at = datetime.utcnow() + timedelta(hours=PROXY_VOTE_INTERVAL_HOURS) if req.enabled else None

#     async with pool.acquire() as conn:
#         await conn.execute("""
#             INSERT INTO user_proxy_settings (user_id, enabled, next_run_at, updated_at)
#             VALUES ($1, $2, $3, NOW())
#             ON CONFLICT (user_id) DO UPDATE
#                 SET enabled     = EXCLUDED.enabled,
#                     next_run_at = EXCLUDED.next_run_at,
#                     updated_at  = NOW()
#         """, user_id, req.enabled, next_run_at)

#         row = await conn.fetchrow(
#             "SELECT enabled, next_run_at, last_run_at FROM user_proxy_settings WHERE user_id = $1",
#             user_id
#         )

#     print(f"[PROXY] user_id={user_id} → enabled={req.enabled}")

#     return {
#         "enabled":     row["enabled"],
#         "next_run_at": row["next_run_at"].isoformat() if row["next_run_at"] else None,
#         "last_run_at": row["last_run_at"].isoformat() if row["last_run_at"] else None,
#     }


# @app.get("/proxy-voting/preferences")
# async def get_proxy_preferences(authorization: Optional[str] = Header(None)):
#     """Get user's proxy voting preference profile."""
#     payload = await get_current_user(authorization)
#     user_id = int(payload["sub"])
    
#     pool = await get_pool()
#     prefs = await get_or_create_proxy_preferences(pool, user_id)
    
#     return {
#         "success": True,
#         "user_id": user_id,
#         "preferences": prefs,
#     }


# @app.put("/proxy-voting/preferences")
# async def update_proxy_preferences(
#     req: ProxyPreferenceUpdateRequest,
#     authorization: Optional[str] = Header(None)
# ):
#     """Update user's proxy voting preference profile."""
#     payload = await get_current_user(authorization)
#     user_id = int(payload["sub"])
    
#     pool = await get_pool()
    
#     # Build update dict from non-None values
#     updates = {}
#     for field, value in req.dict(exclude_unset=True).items():
#         if value is not None:
#             # Validate value is in range 0-100
#             if not (0 <= value <= 100):
#                 raise HTTPException(status_code=422, detail=f"{field} must be between 0 and 100")
#             updates[field] = value
    
#     if not updates:
#         # No updates provided
#         prefs = await get_or_create_proxy_preferences(pool, user_id)
#         return {"success": True, "message": "No changes made", "preferences": prefs}
    
#     # Build SET clause dynamically
#     set_clause = ", ".join([f"{k} = ${i+2}" for i, k in enumerate(updates.keys())])
#     values = [user_id] + list(updates.values())
    
#     async with pool.acquire() as conn:
#         await conn.execute(f"""
#             INSERT INTO proxy_preferences (user_id, {", ".join(updates.keys())})
#             VALUES ($1, {", ".join([f"${i+2}" for i in range(len(updates))])})
#             ON CONFLICT (user_id) DO UPDATE
#                 SET {set_clause}, updated_at = NOW()
#         """, *values)
    
#     # Return updated preferences
#     prefs = await get_or_create_proxy_preferences(pool, user_id)
#     return {"success": True, "message": "Preferences updated", "preferences": prefs}


# @app.get("/proxy-voting/vote-explanation/{vote_id}")
# async def get_vote_explanation(vote_id: int, authorization: Optional[str] = Header(None)):
#     """Get explanation metadata for a specific proxy vote (audit/debug)."""
#     payload = await get_current_user(authorization)
#     user_id = int(payload["sub"])
    
#     pool = await get_pool()
#     async with pool.acquire() as conn:
#         row = await conn.fetchrow("""
#             SELECT * FROM proxy_vote_explanations
#             WHERE id = $1 AND user_id = $2
#         """, vote_id, user_id)
    
#     if not row:
#         raise HTTPException(status_code=404, detail="Vote explanation not found")
    
#     # Convert to dict and format timestamps
#     explanation = dict(row)
#     explanation["created_at"] = explanation["created_at"].isoformat()
    
#     return {"success": True, "explanation": explanation}


# @app.get("/proxy-voting/recent-explanations")
# async def get_recent_explanations(
#     limit: int = 10,
#     authorization: Optional[str] = Header(None)
# ):
#     """Get recent proxy vote explanations for transparency/audit."""
#     limit = max(1, min(limit, 50))  # Clamp between 1 and 50
    
#     payload = await get_current_user(authorization)
#     user_id = int(payload["sub"])
    
#     pool = await get_pool()
#     async with pool.acquire() as conn:
#         rows = await conn.fetch("""
#             SELECT id, product_id, combined_score, score_computation_method,
#                    matched_preferences, boosted_by, tie_break_reason, created_at
#             FROM proxy_vote_explanations
#             WHERE user_id = $1
#             ORDER BY created_at DESC
#             LIMIT $2
#         """, user_id, limit)
    
#     explanations = []
#     for row in rows:
#         exp = dict(row)
#         exp["created_at"] = exp["created_at"].isoformat()
#         explanations.append(exp)
    
#     return {
#         "success": True,
#         "count": len(explanations),
#         "explanations": explanations,
#     }


# # ──────────────────────────────────────────────
# # Stripe Payment Endpoints
# # ──────────────────────────────────────────────
# def get_stripe_period(subscription_id: str):
#     if not subscription_id:
#         return None, None
#     try:
#         sub = stripe.Subscription.retrieve(subscription_id, expand=["items"])
#         if sub.items and sub.items.data:
#             item       = sub.items.data[0]
#             started_at = datetime.utcfromtimestamp(item.current_period_start)
#             ends_at    = datetime.utcfromtimestamp(item.current_period_end)
#             return started_at, ends_at
#         started_at = datetime.utcfromtimestamp(sub.current_period_start) if sub.current_period_start else None
#         ends_at    = datetime.utcfromtimestamp(sub.current_period_end)   if sub.current_period_end   else None
#         return started_at, ends_at
#     except Exception as e:
#         print(f"[STRIPE] Could not fetch subscription period for {subscription_id}: {e}")
#         return None, None


# @app.get("/payment/billing-config")
# async def get_billing_config():
#     """Public billing configuration for frontend."""
#     return {
#         "free_demo_mode": FREE_DEMO_MODE,
#         "stripe_configured": bool(STRIPE_SECRET_KEY),
#         "default_price_id": STRIPE_PRICE_PREMIUM_MONTHLY,
#         "gpt_free_daily_limit": GPT_FREE_DAILY_LIMIT,
#         "gpt_paid_hourly_limit": GPT_PAID_HOURLY_LIMIT,
#     }


# @app.post("/payment/create-checkout-session")
# async def create_checkout_session(
#     req: CreateCheckoutRequest,
#     authorization: Optional[str] = Header(None),
# ):
#     if not stripe.api_key:
#         raise HTTPException(status_code=503, detail="Stripe is not configured")

#     payload = await get_current_user(authorization)
#     user_id = int(payload["sub"])

#     try:
#         session = stripe.checkout.Session.create(
#             payment_method_types=["card"],
#             mode="subscription",
#             line_items=[{"price": req.price_id, "quantity": 1}],
#             success_url=(
#                 req.success_url
#                 or f"{os.getenv('FRONTEND_URL', 'http://localhost:5173')}/pricing/success?session_id={{CHECKOUT_SESSION_ID}}"
#             ),
#             cancel_url=(
#                 req.cancel_url
#                 or f"{os.getenv('FRONTEND_URL', 'http://localhost:5173')}/pricing"
#             ),
#             metadata={
#                 "user_id":   str(user_id),
#                 "plan_name": req.plan_name,
#             },
#         )
#         print(f"[STRIPE] Checkout session created for user {user_id} | Plan: {req.plan_name}")
#         return {"url": session.url, "session_id": session.id}

#     except stripe.StripeError as e:
#         print(f"[STRIPE ERROR] {e}")
#         raise HTTPException(status_code=400, detail=str(e))
#     except Exception as e:
#         print(f"[STRIPE] Unexpected error: {e}")
#         raise HTTPException(status_code=500, detail="Failed to create checkout session")


# @app.post("/payment/webhook")
# async def stripe_webhook(request: Request):
#     # Security B: Rate-limit webhook ingestion to prevent replay flooding
#     if not check_rate_limit(request, "/payment/webhook", max_requests=100):
#         raise HTTPException(status_code=429, detail="Webhook rate limit exceeded.")

#     webhook_secret = os.getenv("STRIPE_WEBHOOK_SECRET")
#     if not webhook_secret:
#         print("[WEBHOOK] STRIPE_WEBHOOK_SECRET not set")
#         return {"status": "error"}

#     payload    = await request.body()
#     sig_header = request.headers.get("stripe-signature")

#     try:
#         event = stripe.Webhook.construct_event(payload, sig_header, webhook_secret)
#     except Exception:
#         raise HTTPException(status_code=400, detail="Invalid signature or payload")

#     event_type = event["type"]
#     data       = event["data"]["object"]
#     print(f"[WEBHOOK] Received: {event_type}")

#     if event_type == "checkout.session.completed":
#         session     = data
#         metadata    = getattr(session, "metadata", {}) or {}
#         user_id_str = metadata.get("user_id")   if hasattr(metadata, "get") else None
#         plan_name   = metadata.get("plan_name") if hasattr(metadata, "get") else None
#         session_id  = session.get("id")
#         subscription_id = session.get("subscription")

#         if user_id_str and subscription_id:
#             started_at, ends_at = get_stripe_period(subscription_id)
#             pool = await get_pool()
#             async with pool.acquire() as conn:
#                 await conn.execute("""
#                     INSERT INTO user_subscriptions
#                         (user_id, stripe_session_id, stripe_subscription_id, plan_name, status, started_at, ends_at)
#                     VALUES ($1, $2, $3, $4, 'active', $5, $6)
#                     ON CONFLICT (stripe_session_id) DO UPDATE
#                         SET stripe_subscription_id = EXCLUDED.stripe_subscription_id,
#                             plan_name   = EXCLUDED.plan_name,
#                             status      = 'active',
#                             started_at  = EXCLUDED.started_at,
#                             ends_at     = EXCLUDED.ends_at,
#                             updated_at  = NOW()
#                 """, int(user_id_str), session_id, subscription_id, plan_name, started_at, ends_at)

#             # Emit paid feature event
#             try:
#                 await emit_interaction_event(
#                     pool=pool,
#                     event_type="paid_feature_use",
#                     entity_id=session_id,
#                     entity_type="subscription",
#                     payload={"plan_name": plan_name},
#                     user_id=int(user_id_str),
#                 )
#             except Exception:
#                 pass

#             print(f"✅ [WEBHOOK] Subscription saved → user={user_id_str} | plan={plan_name} | ends={ends_at}")

#     elif event_type == "invoice.payment_succeeded":
#         subscription_id = data.get("subscription")
#         if subscription_id:
#             started_at, ends_at = get_stripe_period(subscription_id)
#             pool = await get_pool()
#             async with pool.acquire() as conn:
#                 await conn.execute("""
#                     UPDATE user_subscriptions
#                     SET started_at = $1, ends_at = $2, status = 'active', updated_at = NOW()
#                     WHERE stripe_subscription_id = $3
#                 """, started_at, ends_at, subscription_id)

#     elif event_type == "customer.subscription.deleted":
#         subscription_id = data.get("id")
#         if subscription_id:
#             pool = await get_pool()
#             async with pool.acquire() as conn:
#                 await conn.execute("""
#                     UPDATE user_subscriptions
#                     SET status = 'cancelled', updated_at = NOW()
#                     WHERE stripe_subscription_id = $1
#                 """, subscription_id)

#     return {"status": "success"}


# @app.post("/payment/confirm-subscription")
# async def confirm_subscription(
#     request: Request,
#     authorization: Optional[str] = Header(None),
# ):
#     # Security B: Rate limit confirm calls to prevent replay
#     if not check_rate_limit(request, "/payment/confirm-subscription", max_requests=10):
#         raise HTTPException(status_code=429, detail="Rate limit exceeded.")
#     body       = await request.json()
#     session_id = body.get("session_id")

#     if not session_id:
#         raise HTTPException(status_code=400, detail="session_id is required")

#     try:
#         stripe_session = stripe.checkout.Session.retrieve(session_id)
#     except stripe.StripeError as e:
#         raise HTTPException(status_code=400, detail=f"Stripe error: {e}")
#     except Exception:
#         raise HTTPException(status_code=400, detail="Failed to retrieve session")

#     if stripe_session.payment_status != "paid":
#         raise HTTPException(status_code=400, detail="Payment not completed")

#     metadata    = getattr(stripe_session, "metadata", None) or {}
#     user_id_str = metadata.get("user_id")   if hasattr(metadata, "get") else getattr(metadata, "user_id",   None)
#     plan_name   = metadata.get("plan_name") if hasattr(metadata, "get") else getattr(metadata, "plan_name", None)

#     if not user_id_str:
#         raise HTTPException(status_code=400, detail="No user_id in session metadata")

#     subscription_id        = stripe_session.subscription
#     started_at, ends_at    = get_stripe_period(subscription_id)

#     pool = await get_pool()
#     async with pool.acquire() as conn:
#         await conn.execute("""
#             INSERT INTO user_subscriptions
#                 (user_id, stripe_session_id, stripe_subscription_id, plan_name, status, started_at, ends_at)
#             VALUES ($1, $2, $3, $4, 'active', $5, $6)
#             ON CONFLICT (stripe_session_id) DO UPDATE
#                 SET stripe_subscription_id = EXCLUDED.stripe_subscription_id,
#                     plan_name   = EXCLUDED.plan_name,
#                     status      = 'active',
#                     started_at  = EXCLUDED.started_at,
#                     ends_at     = EXCLUDED.ends_at,
#                     updated_at  = NOW()
#         """, int(user_id_str), session_id, subscription_id, plan_name, started_at, ends_at)

#     print(f"✅ [CONFIRM] Subscription stored → user={user_id_str} | plan={plan_name} | ends={ends_at}")
#     return {"success": True, "plan": plan_name or "Premium"}


# @app.post("/payment/cancel-subscription")
# async def cancel_subscription(request: Request, authorization: Optional[str] = Header(None)):
#     # Security B: Rate limit cancellation endpoint
#     if not check_rate_limit(request, "/payment/cancel-subscription", max_requests=5):
#         raise HTTPException(status_code=429, detail="Rate limit exceeded.")
#     payload = await get_current_user(authorization)
#     user_id = int(payload["sub"])

#     pool = await get_pool()
#     async with pool.acquire() as conn:
#         row = await conn.fetchrow("""
#             SELECT stripe_subscription_id
#             FROM user_subscriptions
#             WHERE user_id = $1 AND status = 'active'
#             ORDER BY created_at DESC LIMIT 1
#         """, user_id)

#         if not row or not row["stripe_subscription_id"]:
#             raise HTTPException(status_code=400, detail="No active subscription found")

#         sub_id = row["stripe_subscription_id"]

#     try:
#         stripe.Subscription.modify(sub_id, cancel_at_period_end=True)

#         async with pool.acquire() as conn:
#             await conn.execute("""
#                 UPDATE user_subscriptions
#                 SET status = 'cancelled', updated_at = NOW()
#                 WHERE stripe_subscription_id = $1
#             """, sub_id)

#         return {"success": True, "message": "Subscription cancelled at the end of the current billing period."}
#     except stripe.StripeError as e:
#         raise HTTPException(status_code=400, detail=str(e))


# @app.post("/payment/switch-plan")
# async def switch_plan(req: SwitchPlanRequest, request: Request = None, authorization: Optional[str] = Header(None)):
#     # Security B: Rate limit plan switching
#     if request and not check_rate_limit(request, "/payment/switch-plan", max_requests=5):
#         raise HTTPException(status_code=429, detail="Rate limit exceeded.")
#     payload = await get_current_user(authorization)
#     user_id = int(payload["sub"])

#     pool = await get_pool()
#     async with pool.acquire() as conn:
#         row = await conn.fetchrow("""
#             SELECT stripe_subscription_id
#             FROM user_subscriptions
#             WHERE user_id = $1 AND status = 'active'
#             ORDER BY created_at DESC LIMIT 1
#         """, user_id)

#         if not row or not row["stripe_subscription_id"]:
#             raise HTTPException(status_code=400, detail="No active subscription to switch")

#         current_sub_id = row["stripe_subscription_id"]

#     try:
#         sub     = stripe.Subscription.retrieve(current_sub_id)
#         if not sub.items.data:
#             raise HTTPException(status_code=400, detail="Invalid subscription")

#         item_id     = sub.items.data[0].id
#         updated_sub = stripe.Subscription.modify(
#             current_sub_id,
#             items=[{"id": item_id, "price": req.new_price_id}],
#             proration_behavior="create_prorations",
#         )

#         async with pool.acquire() as conn:
#             await conn.execute("""
#                 UPDATE user_subscriptions
#                 SET plan_name = $1, updated_at = NOW()
#                 WHERE stripe_subscription_id = $2
#             """, req.new_plan_name, current_sub_id)

#         return {
#             "success":      True,
#             "message":      f"Plan switched to {req.new_plan_name}.",
#             "subscription": updated_sub,
#         }

#     except stripe.StripeError as e:
#         raise HTTPException(status_code=400, detail=str(e))


# @app.get("/auth/me/subscription")
# async def get_my_subscription(authorization: Optional[str] = Header(None)):
#     payload = await get_current_user(authorization)
#     user_id = int(payload["sub"])
#     pool    = await get_pool()

#     async with pool.acquire() as conn:
#         row = await conn.fetchrow("""
#             SELECT plan_name, status, started_at, ends_at
#             FROM user_subscriptions
#             WHERE user_id = $1 AND status = 'active'
#             ORDER BY created_at DESC LIMIT 1
#         """, user_id)

#     subscribed = bool(row and row["started_at"])
#     premium_unlocked = subscribed or FREE_DEMO_MODE

#     if not subscribed:
#         return {
#             "subscribed": False,
#             "plan": None,
#             "since": None,
#             "ends_at": None,
#             "free_demo_mode": FREE_DEMO_MODE,
#             "premium_unlocked": premium_unlocked,
#         }

#     return {
#         "subscribed": True,
#         "plan":       row["plan_name"],
#         "status":     row["status"],
#         "since":      row["started_at"].isoformat() if row["started_at"] else None,
#         "ends_at":    row["ends_at"].isoformat()    if row["ends_at"]    else None,
#         "free_demo_mode": FREE_DEMO_MODE,
#         "premium_unlocked": premium_unlocked,
#     }


# # ──────────────────────────────────────────────
# # Collection (user-facing saved items) endpoints
# # ──────────────────────────────────────────────
# @app.get("/auth/me/collection/status/{item_id}")
# async def get_collection_status(item_id: str, authorization: Optional[str] = Header(None)):
#     if not authorization or not authorization.startswith("Bearer "):
#         return {"isInCollection": False}

#     payload = await get_current_user(authorization)
#     user_id = int(payload["sub"])

#     pool = await get_pool()
#     async with pool.acquire() as conn:
#         row = await conn.fetchrow(
#             "SELECT id FROM user_collections WHERE user_id = $1 AND item_id = $2",
#             user_id, item_id
#         )

#     return {"isInCollection": row is not None}


# @app.get("/auth/me/collection")
# async def get_my_collection(authorization: Optional[str] = Header(None)):
#     payload = await get_current_user(authorization)
#     user_id = int(payload["sub"])
#     pool = await get_pool()
#     async with pool.acquire() as conn:
#         rows = await conn.fetch("""
#             SELECT
#                 uc.item_id,
#                 COALESCE(s.title, 'Unknown Model') as title,
#                 COALESCE(s.image_url, '') as image_url,
#                 uc.added_at
#             FROM user_collections uc
#             LEFT JOIN showroom s
#                 ON s.design_id = CAST( (string_to_array(uc.item_id, '-'))[2] AS BIGINT )
#             WHERE uc.user_id = $1
#             ORDER BY uc.added_at DESC
#         """, user_id)
#     models = [dict(r) | {"added_at": r["added_at"].isoformat() if r["added_at"] else None} for r in rows]
#     return {"success": True, "models": models}


# @app.post("/auth/me/collection")
# async def add_to_collection(
#     req: CollectionRequest,
#     request: Request,
#     authorization: Optional[str] = Header(None),
# ):
#     payload = await get_current_user(authorization)
#     user_id = int(payload["sub"])

#     # Security B: Rate limit collection additions per user (max 50 per hour)
#     if not check_user_rate_limit(f"user_{user_id}", "/auth/me/collection", max_requests=50, window_seconds=3600):
#         raise HTTPException(status_code=429, detail="Too many collection additions. Max 50 per hour.")

#     pool = await get_pool()

#     async with pool.acquire() as conn:
#         exists = await conn.fetchval(
#             "SELECT EXISTS(SELECT 1 FROM user_collections WHERE user_id = $1 AND item_id = $2)",
#             user_id, req.item_id
#         )

#         if exists:
#             message   = "Already in collection"
#             was_added = False
#         else:
#             await conn.execute(
#                 "INSERT INTO user_collections (user_id, item_id, added_at) VALUES ($1, $2, NOW())",
#                 user_id, req.item_id
#             )
#             message   = "Model added to your collection!"
#             was_added = True

#     # FIX C: Emit save_look event
#     if was_added:
#         try:
#             await emit_interaction_event(
#                 pool=pool,
#                 event_type="save_look",
#                 entity_id=req.item_id,
#                 entity_type="design",
#                 payload={},
#                 user_id=user_id,
#             )
#         except Exception as e:
#             print(f"[EVENT] ⚠ save_look emit failed: {e}")

#     return {"success": True, "message": message, "isInCollection": True}


# # ──────────────────────────────────────────────
# # Design Agent endpoints
# # ──────────────────────────────────────────────
# @app.post("/run-design")
# async def run_design_endpoint(request: Request, authorization: Optional[str] = Header(None)):
#     # Require admin and check rate limit
#     payload = await require_admin(authorization)
#     user_id = int(payload["sub"])
    
#     if not check_rate_limit(request, "/run-design"):
#         pool = await get_pool()
#         await log_admin_action(pool, user_id, "rate_limit_exceeded", "/run-design", "Too many requests")
#         raise HTTPException(status_code=429, detail="Rate limit exceeded. Max 5 requests per hour.")
    
#     pool = await get_pool()
#     await log_admin_action(pool, user_id, "run_design_agent", "/run-design", "Triggered design generation")
    
#     try:
#         result = await run_design_agent(pool)
#         if result:
#             return {"success": True, **result}
#         return {"success": False, "message": "Agent gated or failed — check logs"}
#     except Exception as e:
#         import traceback; traceback.print_exc()
#         await log_admin_action(pool, user_id, "run_design_agent_error", "/run-design", str(e))
#         raise HTTPException(status_code=500, detail=str(e))


# @app.get("/showroom")
# async def get_showroom(page: int = 1, limit: int = 15, collection_id: Optional[int] = None):
#     # FIX B: collection_id query param makes showroom collection-first (optional filter)
#     limit  = max(1, min(limit, 100))
#     page   = max(1, page)
#     offset = (page - 1) * limit

#     pool = await get_pool()

#     async with pool.acquire() as conn:
#         if collection_id is not None:
#             total: int = await conn.fetchval(
#                 "SELECT COUNT(*) FROM showroom s JOIN generated_designs gd ON gd.id = s.design_id WHERE gd.collection_id = $1",
#                 collection_id
#             )
#             rows = await conn.fetch("""
#                 SELECT
#                     s.id, s.design_id, s.title, s.description, s.image_url,
#                     s.model_url, s.tags, s.likes, s.vision_score, s.created_at,
#                     gd.top_tags, gd.brief_json, gd.score_json, gd.collection_id,
#                     CONCAT('design-', gd.id) AS product_item_id,
#                     COUNT(iv.id)::INT AS votes
#                 FROM showroom s
#                 JOIN generated_designs gd ON gd.id = s.design_id
#                 LEFT JOIN item_votes iv ON iv.item_id = CONCAT('design-', gd.id)
#                 WHERE gd.collection_id = $3
#                 GROUP BY
#                     s.id, s.design_id, s.title, s.description, s.image_url,
#                     s.model_url, s.tags, s.likes, s.vision_score, s.created_at,
#                     gd.top_tags, gd.brief_json, gd.score_json, gd.collection_id, gd.id
#                 ORDER BY s.created_at DESC
#                 LIMIT $1 OFFSET $2
#             """, limit, offset, collection_id)
#         else:
#             total: int = await conn.fetchval(
#                 "SELECT COUNT(*) FROM showroom s JOIN generated_designs gd ON gd.id = s.design_id"
#             )
#             rows = await conn.fetch("""
#                 SELECT
#                     s.id, s.design_id, s.title, s.description, s.image_url,
#                     s.model_url, s.tags, s.likes, s.vision_score, s.created_at,
#                     gd.top_tags, gd.brief_json, gd.score_json, gd.collection_id,
#                     CONCAT('design-', gd.id) AS product_item_id,
#                     COUNT(iv.id)::INT AS votes
#                 FROM showroom s
#                 JOIN generated_designs gd ON gd.id = s.design_id
#                 LEFT JOIN item_votes iv ON iv.item_id = CONCAT('design-', gd.id)
#                 GROUP BY
#                     s.id, s.design_id, s.title, s.description, s.image_url,
#                     s.model_url, s.tags, s.likes, s.vision_score, s.created_at,
#                     gd.top_tags, gd.brief_json, gd.score_json, gd.collection_id, gd.id
#                 ORDER BY s.created_at DESC
#                 LIMIT $1 OFFSET $2
#             """, limit, offset)

#     items = []
#     for r in rows:
#         d = dict(r)
#         d["created_at"] = d["created_at"].isoformat()
#         for field in ("tags", "top_tags", "brief_json", "score_json"):
#             if isinstance(d.get(field), str):
#                 try:
#                     d[field] = json.loads(d[field])
#                 except Exception:
#                     d[field] = []
#         items.append(d)

#     total_pages = math.ceil(total / limit) if total > 0 else 1

#     return {
#         "success":       True,
#         "total":         total,
#         "total_pages":   total_pages,
#         "page":          page,
#         "limit":         limit,
#         "count":         len(items),
#         "collection_id": collection_id,
#         "items":         items,
#     }

# @app.get("/showroom/{showroom_id}")
# async def get_showroom_item(showroom_id: int):
#     pool = await get_pool()
#     async with pool.acquire() as conn:
#         row = await conn.fetchrow("""
#             SELECT
#                 s.id,
#                 s.design_id,
#                 s.title,
#                 s.description,
#                 s.image_url,
#                 s.model_url,
#                 s.tags,
#                 s.likes,
#                 s.vision_score,
#                 s.created_at,
#                 gd.brief_json,
#                 gd.top_tags,
#                 gd.score_json,
#                 gd.prompt_used,
#                 gd.cycle_number,
#                 gd.collection_id,
#                 CONCAT('design-', gd.id) AS product_item_id,
#                 COUNT(iv.id)::INT AS votes
#             FROM showroom s
#             JOIN generated_designs gd ON gd.id = s.design_id
#             LEFT JOIN item_votes iv ON iv.item_id = CONCAT('design-', gd.id)
#             WHERE s.id = $1
#             GROUP BY
#                 s.id, s.design_id, s.title, s.description, s.image_url,
#                 s.model_url, s.tags, s.likes, s.vision_score, s.created_at,
#                 gd.brief_json, gd.top_tags, gd.score_json, gd.prompt_used, gd.id, gd.cycle_number,
#                 gd.collection_id
#         """, showroom_id)

#     if not row:
#         raise HTTPException(status_code=404, detail="Design not found")

#     d = dict(row)
#     d["created_at"] = d["created_at"].isoformat()
#     for field in ("tags", "top_tags", "brief_json", "score_json"):
#         if isinstance(d.get(field), str):
#             try:
#                 d[field] = json.loads(d[field])
#             except Exception:
#                 d[field] = []

#     # Emit design_view event (fire-and-forget)
#     pool = await get_pool()
#     try:
#         await emit_interaction_event(
#             pool=pool,
#             event_type="design_view",
#             entity_id=str(showroom_id),
#             entity_type="design",
#             payload={"design_id": d.get("design_id")},
#             user_id=None,
#         )
#     except Exception:
#         pass

#     return {"success": True, "item": d}


# @app.get("/collections/{collection_id}/ranking")
# async def get_collection_ranking(collection_id: int, limit: int = 10):
#     """
#     API for collection-level ranking: top voted designs per collection.
#     """
#     pool = await get_pool()
#     async with pool.acquire() as conn:
#         rows = await conn.fetch("""
#             SELECT
#                 s.id,
#                 s.design_id,
#                 s.title,
#                 s.description,
#                 s.image_url,
#                 s.model_url,
#                 s.tags,
#                 s.likes,
#                 s.vision_score,
#                 s.created_at,
#                 gd.top_tags,
#                 gd.brief_json,
#                 gd.score_json,
#                 CONCAT('design-', gd.id) AS product_item_id,
#                 COUNT(iv.id)::INT AS votes
#             FROM showroom s
#             JOIN generated_designs gd ON gd.id = s.design_id
#             LEFT JOIN item_votes iv ON iv.item_id = CONCAT('design-', gd.id)
#             WHERE gd.collection_id = $1
#             GROUP BY
#                 s.id, s.design_id, s.title, s.description, s.image_url,
#                 s.model_url, s.tags, s.likes, s.vision_score, s.created_at,
#                 gd.top_tags, gd.brief_json, gd.score_json, gd.id
#             ORDER BY COUNT(iv.id) DESC, s.likes DESC
#             LIMIT $2
#         """, collection_id, limit)

#     items = []
#     for r in rows:
#         d = dict(r)
#         d["created_at"] = d["created_at"].isoformat()
#         for field in ("tags", "top_tags", "brief_json", "score_json"):
#             if isinstance(d.get(field), str):
#                 try:
#                     d[field] = json.loads(d[field])
#                 except Exception:
#                     d[field] = []
#         items.append(d)

#     return {"success": True, "collection_id": collection_id, "count": len(items), "ranked_items": items}


# @app.get("/design-signals")
# async def get_design_signals(limit: int = 30):
#     pool = await get_pool()
#     async with pool.acquire() as conn:
#         rows = await conn.fetch("""
#             SELECT DISTINCT ON (tag) tag, vote_score, like_score,
#                    comment_score, trend_score, total_score, computed_at
#             FROM design_signals ORDER BY tag, computed_at DESC
#         """)
#     signals = sorted(
#         [dict(r) | {"computed_at": r["computed_at"].isoformat()} for r in rows],
#         key=lambda x: x["total_score"], reverse=True
#     )
#     return {"success": True, "count": len(signals), "signals": signals[:limit]}


# @app.get("/generated-designs")
# async def get_generated_designs():
#     pool = await get_pool()
#     async with pool.acquire() as conn:
#         rows = await conn.fetch("""
#             SELECT id, cycle_number, collection_id, status, publishable, image_url, model_url,
#                    top_tags, created_at, published_at
#             FROM generated_designs
#             ORDER BY created_at DESC
#         """)
#     items = []
#     for r in rows:
#         d = dict(r)
#         d["created_at"]   = d["created_at"].isoformat()   if d["created_at"]   else None
#         d["published_at"] = d["published_at"].isoformat() if d["published_at"] else None
#         items.append(d)
#     return {"success": True, "count": len(items), "items": items}


# # ──────────────────────────────────────────────
# # Design Cycles endpoints
# # ──────────────────────────────────────────────
# @app.get("/design-cycles")
# async def get_design_cycles():
#     pool = await get_pool()
#     async with pool.acquire() as conn:
#         rows = await conn.fetch("""
#             SELECT
#                 dc.cycle_number,
#                 dc.started_at,
#                 dc.completed_at,
#                 COUNT(gd.id) FILTER (WHERE gd.status != 'rejected') AS design_count,
#                 COUNT(gd.id) FILTER (WHERE gd.publishable = TRUE)   AS published_count
#             FROM design_cycles dc
#             LEFT JOIN generated_designs gd ON gd.cycle_number = dc.cycle_number
#             GROUP BY dc.cycle_number, dc.started_at, dc.completed_at
#             ORDER BY dc.cycle_number DESC
#         """)

#     cycles = []
#     for r in rows:
#         d = dict(r)
#         d["started_at"]   = d["started_at"].isoformat()   if d["started_at"]   else None
#         d["completed_at"] = d["completed_at"].isoformat() if d["completed_at"] else None
#         d["is_active"]    = d["completed_at"] is None
#         cycles.append(d)

#     return {"success": True, "count": len(cycles), "cycles": cycles}


# @app.get("/design-cycles/active")
# async def get_active_cycle():
#     pool = await get_pool()
#     async with pool.acquire() as conn:
#         row = await conn.fetchrow("""
#             SELECT
#                 dc.cycle_number,
#                 dc.started_at,
#                 COUNT(gd.id) FILTER (WHERE gd.status != 'rejected') AS design_count,
#                 COUNT(gd.id) FILTER (WHERE gd.publishable = TRUE)   AS published_count
#             FROM design_cycles dc
#             LEFT JOIN generated_designs gd ON gd.cycle_number = dc.cycle_number
#             WHERE dc.completed_at IS NULL
#             GROUP BY dc.cycle_number, dc.started_at
#             ORDER BY dc.cycle_number DESC
#             LIMIT 1
#         """)

#     if not row:
#         return {"success": True, "cycle": None, "message": "No active cycle — CIA will start one when prerequisites are met"}

#     d = dict(row)
#     d["started_at"] = d["started_at"].isoformat()
#     d["is_active"]  = True
#     d["remaining"]  = max(0, CIA_MIN_DESIGNS - (d["design_count"] or 0))
#     d["target"]     = CIA_MIN_DESIGNS

#     return {"success": True, "cycle": d}


# # ──────────────────────────────────────────────
# # Cycle Integrity Agent endpoints
# # ──────────────────────────────────────────────
# @app.post("/cycle-integrity/run")
# async def run_cycle_integrity_endpoint(request: Request, authorization: Optional[str] = Header(None)):
#     # Require admin and check rate limit
#     payload = await require_admin(authorization)
#     user_id = int(payload["sub"])
    
#     if not check_rate_limit(request, "/cycle-integrity/run"):
#         pool = await get_pool()
#         await log_admin_action(pool, user_id, "rate_limit_exceeded", "/cycle-integrity/run", "Too many requests")
#         raise HTTPException(status_code=429, detail="Rate limit exceeded. Max 5 requests per hour.")
    
#     pool = await get_pool()
#     await log_admin_action(pool, user_id, "run_cia", "/cycle-integrity/run", "Triggered cycle integrity check")
    
#     try:
#         result = await run_cycle_integrity_agent()
#         return {"success": True, **result}
#     except Exception as e:
#         await log_admin_action(pool, user_id, "run_cia_error", "/cycle-integrity/run", str(e))
#         import traceback; traceback.print_exc()
#         raise HTTPException(status_code=500, detail=str(e))


# @app.get("/cycle-integrity/status")
# async def get_cycle_integrity_status(cycle_number: Optional[int] = None):
#     pool = await get_pool()

#     if cycle_number is not None:
#         async with pool.acquire() as conn:
#             row = await conn.fetchrow("""
#                 SELECT id, run_at, cycle_number, gate_results, overall_status, action_taken, notes
#                 FROM cycle_integrity_log
#                 WHERE cycle_number = $1
#                 ORDER BY run_at DESC
#                 LIMIT 1
#             """, cycle_number)
#     else:
#         async with pool.acquire() as conn:
#             row = await conn.fetchrow("""
#                 SELECT id, run_at, cycle_number, gate_results, overall_status, action_taken, notes
#                 FROM cycle_integrity_log
#                 ORDER BY run_at DESC
#                 LIMIT 1
#             """)

#     if not row:
#         return {
#             "success": True,
#             "status":  None,
#             "message": "No cycle integrity runs recorded yet",
#         }

#     d = dict(row)
#     d["run_at"] = d["run_at"].isoformat()
#     if isinstance(d.get("gate_results"), str):
#         try:
#             d["gate_results"] = json.loads(d["gate_results"])
#         except Exception:
#             d["gate_results"] = {}

#     return {"success": True, "status": d}


# @app.get("/cycle-integrity/history")
# async def get_cycle_integrity_history(limit: int = 50):
#     pool = await get_pool()
#     async with pool.acquire() as conn:
#         rows = await conn.fetch("""
#             SELECT id, run_at, cycle_number, overall_status, action_taken, notes
#             FROM cycle_integrity_log
#             ORDER BY run_at DESC
#             LIMIT $1
#         """, limit)

#     history = []
#     for r in rows:
#         d = dict(r)
#         d["run_at"] = d["run_at"].isoformat()
#         history.append(d)

#     return {"success": True, "count": len(history), "history": history}


# @app.get("/cycle-integrity/gates")
# async def get_gate_definitions():
#     return {
#         "success": True,
#         "gates": [
#             {
#                 "name":        "trend_data_exists",
#                 "description": "Has the Trend Curation Agent collected enough trends/signals?",
#                 "threshold":   CIA_MIN_TRENDS,
#                 "unit":        "trends",
#             },
#             {
#                 "name":        "design_brief_ready",
#                 "description": "Has memory been processed into a usable design brief?",
#                 "threshold":   CIA_MIN_TRENDS,
#                 "unit":        "signals or explicit briefs",
#             },
#             {
#                 "name":        "designs_generated",
#                 "description": f"Have {CIA_MIN_DESIGNS} designs been generated for this cycle?",
#                 "threshold":   CIA_MIN_DESIGNS,
#                 "unit":        "designs",
#             },
#             {
#                 "name":        "vision_scoring_complete",
#                 "description": "Have enough designs been evaluated by the vision scorer?",
#                 "threshold":   CIA_MIN_SCORED_DESIGNS,
#                 "unit":        "scored designs",
#             },
#             {
#                 "name":        "showroom_published",
#                 "description": "Are designs from this cycle visible in the showroom?",
#                 "threshold":   CIA_MIN_SHOWROOM_ITEMS,
#                 "unit":        "showroom items",
#             },
#             {
#                 "name":        "voting_captured",
#                 "description": "Are user votes on this cycle's showroom items captured?",
#                 "threshold":   CIA_MIN_VOTES,
#                 "unit":        "votes",
#             },
#             {
#                 "name":        "feedback_captured",
#                 "description": "Are user interactions stored in memory for the next cycle?",
#                 "threshold":   CIA_MIN_FEEDBACK_ITEMS,
#                 "unit":        "memory entries or signals",
#             },
#         ],
#         "thresholds": {
#             "CIA_MIN_TRENDS":         CIA_MIN_TRENDS,
#             "CIA_MIN_DESIGNS":        CIA_MIN_DESIGNS,
#             "CIA_MIN_SCORED_DESIGNS": CIA_MIN_SCORED_DESIGNS,
#             "CIA_MIN_SHOWROOM_ITEMS": CIA_MIN_SHOWROOM_ITEMS,
#             "CIA_MIN_VOTES":          CIA_MIN_VOTES,
#             "CIA_MIN_FEEDBACK_ITEMS": CIA_MIN_FEEDBACK_ITEMS,
#         },
#         "note": "Cycles are content-driven and identified by cycle_number (INTEGER). No date dependency.",
#     }


# # ──────────────────────────────────────────────
# # FIX E: Agent status / health endpoint
# # ──────────────────────────────────────────────
# @app.get("/agents/status")
# async def get_agents_status():
#     """
#     FIX E: Named agents with explicit status metrics.
#     Returns the current health/status of each defined agent.
#     """
#     pool = await get_pool()
#     async with pool.acquire() as conn:
#         # Trend Curation Agent
#         trend_count  = await conn.fetchval("SELECT COUNT(*) FROM trends")
#         latest_trend = await conn.fetchrow("SELECT created_at FROM trends ORDER BY created_at DESC LIMIT 1")

#         # Memory / RAG Agent
#         memory_count  = await conn.fetchval("SELECT COUNT(*) FROM memory_entries")
#         signal_count  = await conn.fetchval("SELECT COUNT(DISTINCT tag) FROM design_signals")
#         latest_memory = await conn.fetchrow("SELECT created_at FROM memory_entries ORDER BY created_at DESC LIMIT 1")

#         # Design Coordination Agent
#         design_count  = await conn.fetchval("SELECT COUNT(*) FROM generated_designs WHERE status != 'rejected'")
#         active_cycle  = await conn.fetchrow("SELECT cycle_number, started_at FROM design_cycles WHERE completed_at IS NULL ORDER BY cycle_number DESC LIMIT 1")

#         # Cycle Integrity Agent
#         latest_cia   = await conn.fetchrow("SELECT overall_status, action_taken, run_at FROM cycle_integrity_log ORDER BY run_at DESC LIMIT 1")

#         # Feedback Loop Processor
#         event_count  = await conn.fetchval("SELECT COUNT(*) FROM interaction_events WHERE created_at >= NOW() - INTERVAL '24 hours'")
#         latest_event = await conn.fetchrow("SELECT created_at FROM interaction_events ORDER BY created_at DESC LIMIT 1")

#         # GSNowGPT Orchestration
#         chat_count_24h = await conn.fetchval("SELECT COUNT(*) FROM gsnowgpt_chat_log WHERE created_at >= NOW() - INTERVAL '24 hours'")
#         latest_chat    = await conn.fetchrow("SELECT intent, created_at FROM gsnowgpt_chat_log ORDER BY created_at DESC LIMIT 1")

#         # Query Agent (articles / retrieval)
#         article_count  = await conn.fetchval("SELECT COUNT(*) FROM blog_articles")
#         latest_article = await conn.fetchrow("SELECT created_at FROM blog_articles ORDER BY created_at DESC LIMIT 1")

#     def iso(row, field="created_at"):
#         if row and row.get(field):
#             return row[field].isoformat()
#         return None

#     return {
#         "success": True,
#         "agents": {
#             "gsnowgpt_orchestration": {
#                 **agent_registry.get_status("gsnowgpt_orchestration"),
#                 "trigger":         "api",
#                 "endpoint":        "POST /gpt/query",
#                 "status":          "active",
#                 "chats_last_24h":  int(chat_count_24h or 0),
#                 "last_intent":     latest_chat["intent"] if latest_chat else None,
#                 "last_activity":   iso(latest_chat),
#             },
#             "trend_curation": {
#                 **agent_registry.get_status("trend_curation"),
#                 "trigger":         "scheduler",
#                 "interval":        f"every {SCRAPE_INTERVAL_HOURS}h",
#                 "status":          "active",
#                 "trend_count":     int(trend_count or 0),
#                 "last_trend_at":   iso(latest_trend),
#             },
#             "query_retrieval": {
#                 **agent_registry.get_status("query_retrieval"),
#                 "trigger":         "api",
#                 "endpoint":        "GET /articles | /gpt/query (intent=retrieval)",
#                 "status":          "active",
#                 "article_count":   int(article_count or 0),
#                 "last_article_at": iso(latest_article),
#             },
#             "feedback_loop": {
#                 **agent_registry.get_status("feedback_loop"),
#                 "trigger":         "scheduler + event",
#                 "interval":        "every 6h + after CIA run",
#                 "status":          "active",
#                 "events_24h":      int(event_count or 0),
#                 "last_event_at":   iso(latest_event),
#             },
#             "memory_rag": {
#                 **agent_registry.get_status("memory_rag"),
#                 "trigger":         "event + api",
#                 "endpoint":        "POST /memory/store | /design-signals/sync-embeddings",
#                 "status":          "active",
#                 "memory_entries":  int(memory_count or 0),
#                 "signal_tags":     int(signal_count or 0),
#                 "last_memory_at":  iso(latest_memory),
#             },
#             "design_coordination": {
#                 **agent_registry.get_status("design_coordination"),
#                 "trigger":         "scheduler (CIA)",
#                 "status":          "active",
#                 "designs_total":   int(design_count or 0),
#                 "active_cycle":    active_cycle["cycle_number"] if active_cycle else None,
#                 "cycle_started":   iso(active_cycle) if active_cycle else None,
#             },
#             "cycle_integrity": {
#                 **agent_registry.get_status("cycle_integrity"),
#                 "trigger":         "scheduler",
#                 "interval":        "every 1h",
#                 "status":          "active",
#                 "last_status":     latest_cia["overall_status"] if latest_cia else None,
#                 "last_action":     latest_cia["action_taken"]   if latest_cia else None,
#                 "last_run_at":     iso(latest_cia, "run_at")    if latest_cia else None,
#             },
#             "proxy_voting": {
#                 **agent_registry.get_status("proxy_voting"),
#                 "trigger":         "scheduler",
#                 "interval":        "every 24h",
#                 "status":          "active",
#             },
#         },
#         "event_types_supported": sorted(VALID_EVENT_TYPES),
#         "intent_routes":         list(INTENT_ROUTING.keys()),
#         "premium_intent_features": PREMIUM_INTENT_FEATURES,
#     }

# # ──────────────────────────────────────────────
# # MVP: Admin export endpoint — GET /admin/export-users
# # ──────────────────────────────────────────────
# @app.get("/admin/export-users")
# async def export_users(
#     request: Request,
#     authorization: Optional[str] = Header(None),
#     format: str = "json",
# ):
#     """
#     MVP Technical Specification: Admin CSV/JSON export of users for marketing.
#     Requires admin access. Rate limited.
#     """
#     payload = await require_admin(authorization)
#     user_id = int(payload["sub"])

#     if not check_rate_limit(request, "/admin/export-users", max_requests=10):
#         pool = await get_pool()
#         await log_admin_action(pool, user_id, "rate_limit_exceeded", "/admin/export-users", "Too many requests")
#         raise HTTPException(status_code=429, detail="Rate limit exceeded.")

#     pool = await get_pool()
#     await log_admin_action(pool, user_id, "export_users", "/admin/export-users", f"format={format}")

#     async with pool.acquire() as conn:
#         rows = await conn.fetch("""
#             SELECT
#                 u.id, u.first_name, u.last_name, u.email,
#                 u.is_admin, u.email_verified, u.created_at,
#                 us.plan_name AS subscription_plan,
#                 us.status    AS subscription_status,
#                 us.ends_at   AS subscription_ends_at,
#                 (SELECT COUNT(*) FROM item_votes iv WHERE iv.user_id = u.id)       AS votes_cast,
#                 (SELECT COUNT(*) FROM article_comments ac WHERE ac.user_id = u.id) AS comments_made,
#                 (SELECT COUNT(*) FROM article_likes al WHERE al.user_id = u.id)    AS articles_liked
#             FROM users u
#             LEFT JOIN LATERAL (
#                 SELECT plan_name, status, ends_at
#                 FROM user_subscriptions
#                 WHERE user_id = u.id AND status = 'active'
#                 ORDER BY created_at DESC LIMIT 1
#             ) us ON TRUE
#             ORDER BY u.created_at DESC
#         """)

#     users = []
#     for r in rows:
#         d = dict(r)
#         for f in ("created_at", "subscription_ends_at"):
#             if d.get(f):
#                 d[f] = d[f].isoformat()
#         users.append(d)

#     if format.lower() == "csv":
#         import io, csv as csv_mod
#         from fastapi.responses import StreamingResponse
#         output = io.StringIO()
#         if users:
#             writer = csv_mod.DictWriter(output, fieldnames=users[0].keys())
#             writer.writeheader()
#             writer.writerows(users)
#         output.seek(0)
#         return StreamingResponse(
#             iter([output.getvalue()]),
#             media_type="text/csv",
#             headers={"Content-Disposition": "attachment; filename=gia-users-export.csv"},
#         )

#     return {"success": True, "count": len(users), "users": users}


# # ──────────────────────────────────────────────
# # Health check endpoint
# # ──────────────────────────────────────────────
# @app.get("/health")
# async def health():
#     """Simple health check — confirms DB pool is alive."""
#     try:
#         pool = await get_pool()
#         async with pool.acquire() as conn:
#             await conn.fetchval("SELECT 1")
#         return {"status": "ok", "db": "connected"}
#     except Exception as e:
#         raise HTTPException(status_code=503, detail=f"DB connection failed: {e}")
