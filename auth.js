const crypto = require('crypto');

const SESSION_SECRET = 'pdr_exam_secret_salt_2026_super_secure_key';
const COOKIE_NAME = 'pdr_session';

function createToken(payload) {
  const data = JSON.stringify({ ...payload, exp: Date.now() + 24 * 60 * 60 * 1000 }); // 24h expiration
  const base64Data = Buffer.from(data).toString('base64url');
  const signature = crypto.createHmac('sha256', SESSION_SECRET).update(base64Data).digest('base64url');
  return `${base64Data}.${signature}`;
}

function verifyToken(token) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [base64Data, signature] = parts;
  const expectedSignature = crypto.createHmac('sha256', SESSION_SECRET).update(base64Data).digest('base64url');
  if (signature !== expectedSignature) return null;

  try {
    const payload = JSON.parse(Buffer.from(base64Data, 'base64url').toString('utf8'));
    if (payload.exp && Date.now() > payload.exp) return null; // expired
    return payload;
  } catch (err) {
    return null;
  }
}

function authMiddleware(req, res, next) {
  const token = req.cookies ? req.cookies[COOKIE_NAME] : null;
  if (!token) {
    req.session = null;
    return next();
  }
  const session = verifyToken(token);
  req.session = session;
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session || req.session.role !== 'admin') {
    return res.status(401).json({ error: 'Необхідна авторизація адміністратора' });
  }
  next();
}

function requireUser(req, res, next) {
  if (!req.session || req.session.role !== 'user') {
    return res.status(401).json({ error: 'Необхідна авторизація користувача' });
  }
  next();
}

function requireAuth(req, res, next) {
  if (!req.session) {
    return res.status(401).json({ error: 'Необхідна авторизація' });
  }
  next();
}

module.exports = {
  COOKIE_NAME,
  createToken,
  verifyToken,
  authMiddleware,
  requireAdmin,
  requireUser,
  requireAuth
};
