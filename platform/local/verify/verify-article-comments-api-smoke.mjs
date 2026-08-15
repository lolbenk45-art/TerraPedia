#!/usr/bin/env node

import { resolveAdminAuth, resolveBackendApiBase } from '../../lib/local-runtime-config.mjs';

const args = parseArgs(process.argv.slice(2));
const apiBase = trimTrailingSlash(resolveBackendApiBase(args));
const { username, password: adminPassword } = resolveAdminAuth(args);
const smokeEmail = text(args.email, 'comment-smoke-20260605@terrapedia.local').toLowerCase();
const smokePassword = text(args.password, 'CommentSmoke123');
const articleId = Number(args.articleId ?? args['article-id'] ?? 32);

if (!Number.isFinite(articleId) || articleId <= 0) {
  throw new Error('Missing valid --article-id. Use a published article id.');
}

const adminToken = await loginAdmin();
const smokeUser = await ensureSmokeUser(adminToken);
const userCookies = await loginUser();
const stamp = new Date().toISOString();

const rootComment = await createComment(`api smoke root ${stamp}`);
const replyComment = await createReply(rootComment.id, `api smoke reply ${stamp}`);
const likedComment = await likeComment(rootComment.id);
const unlikedComment = await unlikeComment(rootComment.id);
await deleteComment(replyComment.id);
await deleteComment(rootComment.id);

const summary = {
  ok: true,
  apiBase,
  articleId,
  smokeUserId: smokeUser.id,
  rootCommentId: rootComment.id,
  replyCommentId: replyComment.id,
  likedByCurrentUserAfterLike: likedComment.likedByCurrentUser,
  likedByCurrentUserAfterUnlike: unlikedComment.likedByCurrentUser,
};

console.log(JSON.stringify(summary, null, 2));

async function loginAdmin() {
  const payload = await apiJson('/auth/login', {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify({ username, password: adminPassword }),
    expectedStatus: 200,
    label: 'admin login',
  });
  const token = payload?.data?.token;
  if (!token) throw new Error('Admin login response missing token');
  return token;
}

async function ensureSmokeUser(token) {
  const lookup = await apiJson(`/admin/users?email=${encodeURIComponent(smokeEmail)}&page=1&limit=10`, {
    headers: adminHeaders(token),
    expectedStatus: 200,
    label: 'admin user lookup',
  });
  const existing = Array.isArray(lookup?.data)
    ? lookup.data.find(user => String(user.email ?? '').toLowerCase() === smokeEmail)
    : null;

  if (!existing) {
    const created = await apiJson('/admin/users', {
      method: 'POST',
      headers: adminHeaders(token),
      body: JSON.stringify({
        email: smokeEmail,
        password: smokePassword,
        displayName: 'Comment Smoke',
        status: 1,
      }),
      expectedStatus: 201,
      label: 'admin user create',
    });
    if (!created?.data?.id) throw new Error('Created smoke user response missing id');
    return created.data;
  }

  if (Number(existing.status) !== 1) {
    await apiJson(`/admin/users/${existing.id}/status`, {
      method: 'PATCH',
      headers: adminHeaders(token),
      body: JSON.stringify({ status: 1 }),
      expectedStatus: 200,
      label: 'admin user enable',
    });
  }

  await apiJson(`/admin/users/${existing.id}/reset-password`, {
    method: 'POST',
    headers: adminHeaders(token),
    body: JSON.stringify({ newPassword: smokePassword }),
    expectedStatus: 200,
    label: 'admin user reset password',
  });

  return existing;
}

async function loginUser() {
  const response = await fetch(`${apiBase}/user-auth/login`, {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify({ email: smokeEmail, password: smokePassword }),
  });
  const text = await response.text();
  if (response.status !== 200) {
    throw new Error(`user login failed: status=${response.status} body=${preview(text)}`);
  }
  const cookies = cookieHeader(response.headers.getSetCookie());
  if (!cookies.includes('tp_user_access=')) {
    throw new Error('user login response missing tp_user_access cookie');
  }
  return cookies;
}

async function createComment(content) {
  const payload = await apiJson(`/articles/${articleId}/comments`, {
    method: 'POST',
    headers: userJsonHeaders(),
    body: JSON.stringify({ content }),
    expectedStatus: 200,
    label: 'create article comment',
  });
  const comment = payload?.data;
  if (!comment?.id || Number(comment.articleId) !== articleId) {
    throw new Error(`create article comment returned invalid payload: ${JSON.stringify(comment)}`);
  }
  return comment;
}

async function createReply(rootCommentId, content) {
  const payload = await apiJson(`/articles/${articleId}/comments/${rootCommentId}/replies`, {
    method: 'POST',
    headers: userJsonHeaders(),
    body: JSON.stringify({ content, replyToCommentId: rootCommentId }),
    expectedStatus: 200,
    label: 'create article comment reply',
  });
  const reply = payload?.data;
  if (!reply?.id || Number(reply.rootId) !== Number(rootCommentId)) {
    throw new Error(`create article comment reply returned invalid payload: ${JSON.stringify(reply)}`);
  }
  return reply;
}

async function likeComment(commentId) {
  const payload = await apiJson(`/articles/${articleId}/comments/${commentId}/like`, {
    method: 'POST',
    headers: userCookieHeaders(),
    expectedStatus: 200,
    label: 'like article comment',
  });
  if (payload?.data?.likedByCurrentUser !== true) {
    throw new Error(`like article comment did not return likedByCurrentUser=true: ${JSON.stringify(payload?.data)}`);
  }
  return payload.data;
}

async function unlikeComment(commentId) {
  const payload = await apiJson(`/articles/${articleId}/comments/${commentId}/like`, {
    method: 'DELETE',
    headers: userCookieHeaders(),
    expectedStatus: 200,
    label: 'unlike article comment',
  });
  if (payload?.data?.likedByCurrentUser !== false) {
    throw new Error(`unlike article comment did not return likedByCurrentUser=false: ${JSON.stringify(payload?.data)}`);
  }
  return payload.data;
}

async function deleteComment(commentId) {
  await apiJson(`/articles/${articleId}/comments/${commentId}`, {
    method: 'DELETE',
    headers: userCookieHeaders(),
    expectedStatus: 200,
    label: `delete article comment ${commentId}`,
  });
}

async function apiJson(path, options) {
  const response = await fetch(`${apiBase}${path}`, {
    method: options.method ?? 'GET',
    headers: options.headers,
    body: options.body,
  });
  const body = await response.text();
  if (response.status !== options.expectedStatus) {
    throw new Error(`${options.label} failed: status=${response.status} path=${path} body=${preview(body)}`);
  }
  return body ? JSON.parse(body) : null;
}

function adminHeaders(token) {
  return { ...jsonHeaders(), Authorization: `Bearer ${token}` };
}

function userJsonHeaders() {
  return { ...jsonHeaders(), Cookie: userCookies };
}

function userCookieHeaders() {
  return { Cookie: userCookies };
}

function jsonHeaders() {
  return { 'content-type': 'application/json' };
}

function cookieHeader(setCookieHeaders) {
  return setCookieHeaders
    .map(value => value.split(';')[0])
    .filter(Boolean)
    .join('; ');
}

function parseArgs(argv) {
  const out = {};
  for (const token of argv) {
    if (!token.startsWith('--')) continue;
    const body = token.slice(2);
    const index = body.indexOf('=');
    if (index >= 0) out[body.slice(0, index)] = body.slice(index + 1);
    else out[body] = 'true';
  }
  return out;
}

function text(value, fallback) {
  const normalized = String(value ?? '').trim();
  return normalized || fallback;
}

function trimTrailingSlash(value) {
  let result = String(value ?? '').trim();
  while (result.endsWith('/')) result = result.slice(0, -1);
  return result;
}

function preview(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, 400);
}
