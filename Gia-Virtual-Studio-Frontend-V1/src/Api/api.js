const BASE_URL = import.meta.env.VITE_BACKEND_API_URL ;
console.log('Using API base URL:', BASE_URL);
/**
 * Core fetch wrapper — handles JSON parsing and error normalisation.
 * @param {string} endpoint  - e.g. '/articles' or '/articles/1'
 * @param {RequestInit} options - standard fetch options
 * @returns {Promise<any>}
 */
async function callApi(endpoint, options = {}) {
  const url = `${BASE_URL}${endpoint}`;

  const defaultHeaders = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };

  const config = {
    ...options,
    headers: {
      ...defaultHeaders,
      ...options.headers,
    },
  };

  const response = await fetch(url, config);

  if (!response.ok) {
    // Attempt to pull a message from the response body, fall back to status text
    let errorMessage = `Request failed: ${response.status} ${response.statusText}`;
    try {
      const errorBody = await response.json();
      errorMessage = errorBody?.detail || errorBody?.message || errorMessage;
    } catch {
      // body wasn't JSON — keep the default message
    }
    throw new Error(errorMessage);
  }

  // 204 No Content — nothing to parse
  if (response.status === 204) return null;

  return response.json();
}

// ─── Convenience helpers ─────────────────────────────────────────────────────

export const apiGet = (endpoint, options = {}) =>
  callApi(endpoint, { ...options, method: 'GET' });

export const apiPost = (endpoint, body, options = {}) =>
  callApi(endpoint, { ...options, method: 'POST', body: JSON.stringify(body) });

export const apiPatch = (endpoint, body, options = {}) =>
  callApi(endpoint, { ...options, method: 'PATCH', body: JSON.stringify(body) });

export const apiDelete = (endpoint, options = {}) =>
  callApi(endpoint, { ...options, method: 'DELETE' });

// ─── Article-specific calls ───────────────────────────────────────────────────

/** Fetch all articles */
export const fetchArticles = () => apiGet('/articles');

/** Fetch a single article by id */
export const fetchArticleById = (id) => apiGet(`/articles/${id}`);




// Like toggle — sends Bearer token
export async function likeArticle(articleId) {
  const token = localStorage.getItem('gia_token');
  const res = await fetch(`${BASE_URL}/articles/${articleId}/like`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    },
  });
  if (!res.ok) throw new Error(`Like failed: ${res.status}`);
  return res.json(); // { liked, likes }
}

// Check if current user already liked this article
export async function fetchLikeStatus(articleId) {
  const token = localStorage.getItem('gia_token');
  const res = await fetch(`${BASE_URL}/articles/${articleId}/like-status`, {
    headers: {
      Authorization: `Bearer ${token ?? ''}`,
      Accept: 'application/json',
    },
  });
  if (!res.ok) return { liked: false };
  return res.json(); // { liked }
}

// Fetch comments for an article
export async function fetchComments(articleId) {
  const res = await fetch(`${BASE_URL}/articles/${articleId}/comments`, {
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) throw new Error('Failed to load comments');
  return res.json(); // { success, comments }
}

// Post a comment — auth required
export async function postComment(articleId, text) {
  const token = localStorage.getItem('gia_token');
  const res = await fetch(`${BASE_URL}/articles/${articleId}/comments`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Failed to post comment: ${res.status}`);
  }
  const data = await res.json();
  return data.comment;
}
// Style agent — send user message + product context + conversation history
export async function askStyleAgent({ message, product, conversationHistory = [] }) {
  const res = await fetch(`${BASE_URL}/style-agent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      message,
      product_name:  product?.name  ?? null,
      product_desc:  product?.desc  ?? null,
      product_price: product?.price ?? null,
      conversation_history: conversationHistory,
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Style agent request failed');
  }
  const data = await res.json();
  return data.reply;
}


// ─── Product Voting ─────────────────────────────────────────────

export async function voteProduct(productId) {
  const token = localStorage.getItem('gia_token');

  const res = await fetch(`${BASE_URL}/products/${productId}/vote`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    },
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Vote failed: ${res.status}`);
  }

  return res.json(); // { votes }
}
export async function fetchVoteStatus(productId) {
  const token = localStorage.getItem('gia_token');

  const res = await fetch(`${BASE_URL}/products/${productId}/vote-status`, {
    headers: {
      Authorization: `Bearer ${token ?? ''}`,
      Accept: 'application/json',
    },
  });

  if (!res.ok) {
    return { hasVoted: false, votes: 0 };
  }

  return res.json(); 
  // { hasVoted: true, votes: 12 }
}
export async function fetchMyStats() {
  const token = localStorage.getItem('gia_token');
  const res = await fetch(`${BASE_URL}/auth/me/stats`, {
    headers: {
      Authorization: `Bearer ${token ?? ''}`,
      Accept: 'application/json',
    },
  });
  if (!res.ok) return { votes_cast: 0, comments_made: 0, articles_liked: 0, activity: 0, member_since: '—' };
  return res.json();
}

export async function fetchMyActivity() {
  const token = localStorage.getItem('gia_token');
  const res = await fetch(`${BASE_URL}/auth/me/activity`, {
    headers: {
      Authorization: `Bearer ${token ?? ''}`,
      Accept: 'application/json',
    },
  });
  if (!res.ok) return { feed: [] };
  return res.json();
}

export async function fetchProxyStatus() {
  const token = localStorage.getItem('gia_token');
  const res = await fetch(`${BASE_URL}/proxy-voting/status`, {
    headers: {
      Authorization: `Bearer ${token ?? ''}`,
      Accept: 'application/json',
    },
  });
  if (!res.ok) return { enabled: false, next_run_at: null };
  return res.json();
}
 
/**
 * Enable or disable proxy voting for the authenticated user.
 * @param {boolean} enable
 * Returns: { enabled: boolean, next_run_at: string | null }
 */
export async function toggleProxyVoting(enable) {
  const token = localStorage.getItem('gia_token');
  const res = await fetch(`${BASE_URL}/proxy-voting/toggle`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    },
    body: JSON.stringify({ enabled: enable }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Proxy toggle failed: ${res.status}`);
  }
  return res.json();
}






// ─── Subscription ─────────────────────────────────────────────────────────────
export async function fetchMySubscription() {
  const token = localStorage.getItem('gia_token');
  const res = await fetch(`${BASE_URL}/auth/me/subscription`, {
    headers: { Authorization: `Bearer ${token ?? ''}`, Accept: 'application/json' },
  });
  if (!res.ok) throw new Error('Failed to fetch subscription');
  return res.json();
  // Returns: { subscribed, plan, status, since, ends_at }
}
 
// ─── Stripe Checkout ──────────────────────────────────────────────────────────
export async function createCheckoutSession(priceId, planName) {
  const token = localStorage.getItem('gia_token');
  if (!token) throw new Error('Please log in to subscribe');
 
  const res = await fetch(`${BASE_URL}/payment/create-checkout-session`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    },
    body: JSON.stringify({ price_id: priceId, plan_name: planName }),
  });
 
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Failed to create checkout session');
  }
  return res.json(); // { url, session_id }
}
 
// ─── Confirm Subscription (called on success page) ────────────────────────────
export async function confirmSubscription(sessionId) {
  const token = localStorage.getItem('gia_token');
  const res = await fetch(`${BASE_URL}/payment/confirm-subscription`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token ?? ''}`,
      Accept: 'application/json',
    },
    body: JSON.stringify({ session_id: sessionId }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Failed to confirm subscription');
  }
  return res.json(); // { success, plan }
}


// In api.js

export async function cancelSubscription() {
  const token = localStorage.getItem('gia_token');
  const res = await fetch(`${BASE_URL}/payment/cancel-subscription`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
  });
  if (!res.ok) throw new Error('Failed to cancel subscription');
  return res.json();
}



// ─── Generated Designs ────────────────────────────────────────────────────────

/**
 * Fetch all published generated designs from the backend.
 * Returns { success, count, items: [{ id, model_url, image_url, ... }] }
 */
export async function fetchGeneratedDesigns() {
  const res = await fetch(`${BASE_URL}/generated-designs`, {
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`Failed to fetch generated designs: ${res.status} ${res.statusText}`);
  return res.json();
}

export async function fetchMyCollection() {
  const token = localStorage.getItem('gia_token');
  const res = await fetch(`${BASE_URL}/auth/me/collection`, {
    headers: { Authorization: `Bearer ${token ?? ''}`, Accept: 'application/json' },
  });
  if (!res.ok) return { models: [] };
  return res.json(); // { models: [{ id, title, image_url, voted_at }] }
}


export async function addToCollection(itemId, modelUrl = null, imageUrl = null) {
  const token = localStorage.getItem('gia_token');
  const res = await fetch(`${BASE_URL}/auth/me/collection`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    },
    body: JSON.stringify({
      item_id:   itemId,
      model_url: modelUrl || null,
      image_url: imageUrl || null,
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Failed to add to collection: ${res.status}`);
  }
  return res.json();
}


// ─── Collection Item Status ───────────────────────────────────────────────────

/**
 * Check whether a specific design item is in the authenticated user's collection.
 * Uses the correct backend endpoint: GET /auth/me/collection/status/{item_id}
 * @param {string} itemId  e.g. "design-42"
 * @returns {Promise<{ isInCollection: boolean }>}
 */
export const fetchCollectionStatus = async (itemId) => {
  const token = localStorage.getItem('gia_token');
  if (!token) return { isInCollection: false };
  const res = await fetch(`${BASE_URL}/auth/me/collection/status/${itemId}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    },
  });
  if (!res.ok) return { isInCollection: false };
  return res.json(); // { isInCollection: boolean }
};

// ─── GPT Quota ────────────────────────────────────────────────────────────────

/**
 * Fetch the current user's GSNowGPT message quota from the backend.
 * Returns live remaining count for free users, or unlimited flag for paid.
 * GET /gpt/quota
 */
export async function fetchGPTQuota() {
  const token = localStorage.getItem('gia_token');
  const headers = { Accept: 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${BASE_URL}/gpt/quota`, { headers });
  if (!res.ok) return null;
  return res.json();
  // free:  { plan:"free",  remaining, used_today, daily_limit, unlimited:false }
  // paid:  { plan:"paid",  remaining, unlimited:true }
}

// ─── GSNowGPT Chat ────────────────────────────────────────────────────────────

/**
 * Send a message to the GSNowGPT unified endpoint.
 * POST /gpt/query
 * @param {string}  message
 * @param {object}  opts
 * @param {string}  [opts.sessionId]
 * @param {string}  [opts.productName]
 * @param {string}  [opts.productDesc]
 * @param {string}  [opts.productPrice]
 * @param {Array}   [opts.conversationHistory]
 * @returns {Promise<object>} Full response contract: { success, type, intent, reply, payload, actions, session_id }
 */
export async function askGSNowGPT(message, {
  sessionId            = null,
  productName          = null,
  productDesc          = null,
  productPrice         = null,
  conversationHistory  = [],
} = {}) {
  const token = localStorage.getItem('gia_token');
  const headers = { 'Content-Type': 'application/json', Accept: 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${BASE_URL}/gpt/query`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      message,
      session_id:           sessionId,
      product_name:         productName,
      product_desc:         productDesc,
      product_price:        productPrice,
      conversation_history: conversationHistory,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const error = Object.assign(
      new Error(err?.detail || `GSNowGPT error ${res.status}`),
      { status: res.status, upgradeRequired: res.headers.get('X-Upgrade-Required') === 'true' }
    );
    throw error;
  }
  return res.json();
}

// ─── Showroom ─────────────────────────────────────────────────────────────────

/**
 * Fetch paginated showroom items from the backend.
 * GET /showroom?page=N&limit=N&collection_id=N
 */
export async function fetchShowroom({ page = 1, limit = 15, collectionId = null } = {}) {
  let url = `${BASE_URL}/showroom?page=${page}&limit=${limit}`;
  if (collectionId != null) url += `&collection_id=${collectionId}`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`Failed to fetch showroom: ${res.status}`);
  return res.json();
  // { success, total, total_pages, page, items: [...] }
}

/**
 * Fetch a single showroom item by its showroom row id.
 * GET /showroom/{showroom_id}
 */
export async function fetchShowroomItem(showroomId) {
  const res = await fetch(`${BASE_URL}/showroom/${showroomId}`, {
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`Showroom item not found: ${res.status}`);
  return res.json(); // { success, item }
}




export default callApi;