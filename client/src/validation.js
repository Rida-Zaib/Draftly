// Shared input rules for accounts. client/src/validation.js is an identical copy
// (a test asserts they match), so the form and the API can never disagree.

export const PASSWORD_RULE =
  'A strong password has at least 8 characters, with an uppercase letter, a lowercase letter, a number and a symbol.';

// local part: letters, digits and . _ % + - (no leading, trailing or doubled dots); domain needs a dot and a 2+ letter ending
const EMAIL_RE = /^[A-Za-z0-9_%+-]+(\.[A-Za-z0-9_%+-]+)*@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$/;

// the mistakes people make most often when typing a popular address
const TYPO_DOMAINS = {
  'gmial.com': 'gmail.com', 'gmai.com': 'gmail.com', 'gmal.com': 'gmail.com', 'gamil.com': 'gmail.com',
  'gnail.com': 'gmail.com', 'gmaill.com': 'gmail.com', 'gmail.con': 'gmail.com', 'gmail.co': 'gmail.com',
  'gmail.cm': 'gmail.com', 'gmail.om': 'gmail.com', 'gmail.comm': 'gmail.com', 'gmali.com': 'gmail.com',
  'hotmial.com': 'hotmail.com', 'hotmal.com': 'hotmail.com', 'hotmail.con': 'hotmail.com',
  'yahooo.com': 'yahoo.com', 'yaho.com': 'yahoo.com', 'yahoo.con': 'yahoo.com',
  'outlok.com': 'outlook.com', 'outlook.con': 'outlook.com',
};

/** Returns an error message, or '' when the email looks valid. */
export function checkEmail(raw) {
  const email = String(raw || '').trim().toLowerCase();
  if (!email) return 'Enter your email address';
  if (email.length > 120) return 'That email address is too long';
  if (!email.includes('@')) return 'Email must contain "@", like name@gmail.com';
  if (!EMAIL_RE.test(email)) return 'Enter a valid email address, like name@gmail.com';
  const [local, domain] = email.split('@');
  if (TYPO_DOMAINS[domain]) return `Did you mean ${local}@${TYPO_DOMAINS[domain]}?`;
  return '';
}

/** Returns an error message, or '' when the password meets every rule. */
export function checkPassword(password) {
  if (typeof password !== 'string' || !password) return 'Enter a password';
  if (password.length > 100) return 'Password must be 100 characters or fewer';
  const ok = password.length >= 8 && /[a-z]/.test(password) && /[A-Z]/.test(password)
    && /\d/.test(password) && /[^A-Za-z0-9\s]/.test(password);
  return ok ? '' : PASSWORD_RULE;
}
