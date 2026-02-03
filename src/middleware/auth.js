const config = require('../config');

// Check if user is authenticated with site password
function requireSitePassword(req, res, next) {
  // Skip password check for webhook endpoints (Twilio needs direct access)
  if (req.path.startsWith('/sms/webhook')) {
    return next();
  }

  // Check if already authenticated via session
  if (req.session && req.session.siteAuthenticated) {
    return next();
  }

  // If this is a login attempt
  if (req.path === '/login' && req.method === 'POST') {
    return next();
  }

  // Allow access to login page and static assets
  if (req.path === '/login' || req.path.startsWith('/public/')) {
    return next();
  }

  // Redirect to login
  res.redirect('/login');
}

// Verify site password
function verifySitePassword(password) {
  return password === config.sitePassword;
}

// Check if Microsoft is authenticated
function requireMicrosoftAuth(req, res, next) {
  const outlook = require('../services/outlook');
  
  if (!outlook.isAuthenticated()) {
    // Allow access to auth routes
    if (req.path.startsWith('/auth/')) {
      return next();
    }
    
    // Redirect to setup page
    return res.redirect('/setup');
  }
  
  next();
}

module.exports = {
  requireSitePassword,
  verifySitePassword,
  requireMicrosoftAuth,
};
