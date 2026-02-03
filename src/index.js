require('dotenv').config();
const express = require('express');
const session = require('express-session');
const path = require('path');
const config = require('./config');
const { requireSitePassword, verifySitePassword } = require('./middleware/auth');
const outlook = require('./services/outlook');
const azureOpenAI = require('./services/azure-openai');
const twilioService = require('./services/twilio');
const smsRoutes = require('./routes/sms');

const app = express();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '../public')));

// Session configuration
app.use(session({
  secret: config.server.sessionSecret,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
  },
}));

// SMS webhook routes (no password protection needed - Twilio handles auth)
app.use('/sms', smsRoutes);

// Password protection for all other routes
app.use(requireSitePassword);

// Login page
app.get('/login', (req, res) => {
  res.send(getLoginPage());
});

// Handle login
app.post('/login', (req, res) => {
  const { password } = req.body;
  
  if (verifySitePassword(password)) {
    req.session.siteAuthenticated = true;
    res.redirect('/');
  } else {
    res.send(getLoginPage('Invalid password'));
  }
});

// Logout
app.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/login');
});

// Setup page (Microsoft auth)
app.get('/setup', async (req, res) => {
  res.send(getSetupPage());
});

// Microsoft Auth - Start
app.get('/auth/microsoft', async (req, res) => {
  try {
    const authUrl = await outlook.getAuthUrl();
    console.log('Generated Auth URL:', authUrl);
    res.redirect(authUrl);
  } catch (error) {
    console.error('Auth URL Error:', error);
    res.send(getSetupPage('Failed to initiate Microsoft login: ' + error.message));
  }
});

// Debug - Show auth URL without redirecting
app.get('/auth/test', async (req, res) => {
  try {
    const authUrl = await outlook.getAuthUrl();
    res.send(`
      <html>
      <head><title>Auth URL Debug</title></head>
      <body style="font-family: monospace; padding: 20px; word-break: break-all;">
        <h2>Generated Auth URL:</h2>
        <p>${authUrl}</p>
        <hr>
        <h3>Checking for redirect_uri in URL:</h3>
        <p>${authUrl.includes('redirect_uri') ? 'YES - redirect_uri is present' : 'NO - redirect_uri is MISSING!'}</p>
        <hr>
        <a href="${authUrl}">Click here to test the auth URL</a>
      </body>
      </html>
    `);
  } catch (error) {
    res.send('Error: ' + error.message);
  }
});

// Microsoft Auth - Callback
app.get('/auth/callback', async (req, res) => {
  try {
    const { code, error, error_description } = req.query;
    
    if (error) {
      throw new Error(error_description || error);
    }
    
    if (!code) {
      throw new Error('No authorization code received');
    }
    
    await outlook.handleAuthCallback(code);
    res.redirect('/');
  } catch (error) {
    console.error('Auth Callback Error:', error);
    res.send(getSetupPage('Microsoft authentication failed: ' + error.message));
  }
});

// Sign out of Microsoft
app.get('/auth/signout', (req, res) => {
  outlook.clearTokens();
  res.redirect('/setup');
});

// Dashboard
app.get('/', async (req, res) => {
  if (!outlook.isAuthenticated()) {
    return res.redirect('/setup');
  }
  
  try {
    const user = await outlook.getUserProfile();
    res.send(getDashboardPage(user));
  } catch (error) {
    console.error('Dashboard Error:', error);
    res.send(getDashboardPage(null, error.message));
  }
});

// API - Get status
app.get('/api/status', async (req, res) => {
  res.json({
    microsoftAuthenticated: outlook.isAuthenticated(),
    serverTime: new Date().toISOString(),
  });
});

// Debug - Show configuration (remove in production if needed)
app.get('/debug', (req, res) => {
  const envVars = {
    BASE_URL: process.env.BASE_URL,
    MICROSOFT_CLIENT_ID: process.env.MICROSOFT_CLIENT_ID,
    MICROSOFT_CLIENT_SECRET: process.env.MICROSOFT_CLIENT_SECRET,
    MICROSOFT_TENANT_ID: process.env.MICROSOFT_TENANT_ID,
  };
  
  res.send(`
    <html>
    <head><title>Debug Info</title></head>
    <body style="font-family: monospace; padding: 20px;">
      <h2>Configuration Debug</h2>
      
      <h3>Loaded Config Values:</h3>
      <p><strong>BASE_URL:</strong> ${config.server.baseUrl}</p>
      <p><strong>Redirect URI:</strong> ${config.microsoft.redirectUri}</p>
      <p><strong>Client ID:</strong> ${config.microsoft.clientId ? config.microsoft.clientId.substring(0, 8) + '...' : 'NOT SET'}</p>
      <p><strong>Client Secret:</strong> ${config.microsoft.clientSecret ? 'SET (' + config.microsoft.clientSecret.length + ' chars)' : 'NOT SET'}</p>
      <p><strong>Tenant ID:</strong> ${config.microsoft.tenantId || 'NOT SET'}</p>
      <p><strong>Microsoft Configured:</strong> ${outlook.isConfigured() ? 'YES' : 'NO'}</p>
      
      <h3>Raw Environment Variables:</h3>
      <p><strong>BASE_URL env:</strong> ${envVars.BASE_URL || 'NOT SET'}</p>
      <p><strong>MICROSOFT_CLIENT_ID env:</strong> ${envVars.MICROSOFT_CLIENT_ID ? envVars.MICROSOFT_CLIENT_ID.substring(0, 8) + '...' : 'NOT SET'}</p>
      <p><strong>MICROSOFT_CLIENT_SECRET env:</strong> ${envVars.MICROSOFT_CLIENT_SECRET ? 'SET (' + envVars.MICROSOFT_CLIENT_SECRET.length + ' chars)' : 'NOT SET'}</p>
      <p><strong>MICROSOFT_TENANT_ID env:</strong> ${envVars.MICROSOFT_TENANT_ID || 'NOT SET'}</p>
      
      <hr>
      <p>Make sure the <strong>Redirect URI</strong> above is added to your Microsoft App Registration under Authentication.</p>
      <p style="color: red;">If any values show "NOT SET", check your Azure App Service environment variables.</p>
    </body>
    </html>
  `);
});

// API - Test SMS
app.post('/api/test-sms', async (req, res) => {
  try {
    const { message } = req.body;
    await twilioService.sendToUser(message || 'Test message from Outlook AI Assistant');
    res.json({ success: true, message: 'Test SMS sent successfully' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// API - Get summary
app.get('/api/summary', async (req, res) => {
  try {
    const summary = await azureOpenAI.getDailySummary();
    res.json({ success: true, summary });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// HTML Templates
function getLoginPage(error = null) {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Login - Outlook AI Assistant</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .login-container {
      background: white;
      padding: 40px;
      border-radius: 16px;
      box-shadow: 0 20px 60px rgba(0,0,0,0.3);
      width: 100%;
      max-width: 400px;
    }
    h1 {
      text-align: center;
      color: #333;
      margin-bottom: 30px;
      font-size: 24px;
    }
    .icon {
      text-align: center;
      font-size: 48px;
      margin-bottom: 20px;
    }
    input[type="password"] {
      width: 100%;
      padding: 15px;
      border: 2px solid #e1e1e1;
      border-radius: 8px;
      font-size: 16px;
      margin-bottom: 20px;
      transition: border-color 0.3s;
    }
    input[type="password"]:focus {
      outline: none;
      border-color: #667eea;
    }
    button {
      width: 100%;
      padding: 15px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      border: none;
      border-radius: 8px;
      font-size: 16px;
      font-weight: 600;
      cursor: pointer;
      transition: transform 0.2s, box-shadow 0.2s;
    }
    button:hover {
      transform: translateY(-2px);
      box-shadow: 0 5px 20px rgba(102, 126, 234, 0.4);
    }
    .error {
      background: #fee2e2;
      color: #dc2626;
      padding: 12px;
      border-radius: 8px;
      margin-bottom: 20px;
      text-align: center;
    }
  </style>
</head>
<body>
  <div class="login-container">
    <div class="icon">📧</div>
    <h1>Outlook AI Assistant</h1>
    ${error ? `<div class="error">${error}</div>` : ''}
    <form method="POST" action="/login">
      <input type="password" name="password" placeholder="Enter password" required autofocus>
      <button type="submit">Sign In</button>
    </form>
  </div>
</body>
</html>`;
}

function getSetupPage(error = null) {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Setup - Outlook AI Assistant</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }
    .setup-container {
      background: white;
      padding: 40px;
      border-radius: 16px;
      box-shadow: 0 20px 60px rgba(0,0,0,0.3);
      width: 100%;
      max-width: 500px;
      text-align: center;
    }
    h1 {
      color: #333;
      margin-bottom: 10px;
      font-size: 28px;
    }
    .subtitle {
      color: #666;
      margin-bottom: 30px;
    }
    .icon {
      font-size: 64px;
      margin-bottom: 20px;
    }
    .ms-button {
      display: inline-flex;
      align-items: center;
      gap: 12px;
      padding: 15px 30px;
      background: #0078d4;
      color: white;
      border: none;
      border-radius: 8px;
      font-size: 16px;
      font-weight: 600;
      cursor: pointer;
      text-decoration: none;
      transition: background 0.3s;
    }
    .ms-button:hover {
      background: #106ebe;
    }
    .ms-logo {
      width: 24px;
      height: 24px;
    }
    .error {
      background: #fee2e2;
      color: #dc2626;
      padding: 12px;
      border-radius: 8px;
      margin-bottom: 20px;
    }
    .info {
      margin-top: 30px;
      padding: 20px;
      background: #f3f4f6;
      border-radius: 8px;
      text-align: left;
    }
    .info h3 {
      color: #333;
      margin-bottom: 10px;
    }
    .info ul {
      color: #666;
      padding-left: 20px;
    }
    .info li {
      margin-bottom: 5px;
    }
  </style>
</head>
<body>
  <div class="setup-container">
    <div class="icon">🔗</div>
    <h1>Connect Your Microsoft Account</h1>
    <p class="subtitle">Sign in once to allow access to your Outlook email and calendar</p>
    
    ${error ? `<div class="error">${error}</div>` : ''}
    
    <a href="/auth/microsoft" class="ms-button">
      <svg class="ms-logo" viewBox="0 0 24 24" fill="currentColor">
        <path d="M11.4 24H0V12.6h11.4V24zM24 24H12.6V12.6H24V24zM11.4 11.4H0V0h11.4v11.4zm12.6 0H12.6V0H24v11.4z"/>
      </svg>
      Sign in with Microsoft
    </a>
    
    <div class="info">
      <h3>What permissions are needed?</h3>
      <ul>
        <li>Read your emails</li>
        <li>Read your calendar events</li>
        <li>Access your basic profile</li>
      </ul>
      <p style="margin-top: 10px; color: #888; font-size: 14px;">
        Your data stays private. The AI only processes your data when you send a text message.
      </p>
    </div>
  </div>
</body>
</html>`;
}

function getDashboardPage(user, error = null) {
  const userName = user?.displayName || 'User';
  const userEmail = user?.mail || user?.userPrincipalName || '';
  
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Dashboard - Outlook AI Assistant</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
      background: #f5f5f5;
      min-height: 100vh;
    }
    .header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 20px 40px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .header h1 {
      font-size: 24px;
    }
    .header-actions {
      display: flex;
      gap: 15px;
    }
    .header-actions a {
      color: white;
      text-decoration: none;
      padding: 8px 16px;
      border-radius: 6px;
      background: rgba(255,255,255,0.2);
      transition: background 0.3s;
    }
    .header-actions a:hover {
      background: rgba(255,255,255,0.3);
    }
    .container {
      max-width: 1200px;
      margin: 0 auto;
      padding: 40px 20px;
    }
    .status-card {
      background: white;
      border-radius: 12px;
      padding: 30px;
      margin-bottom: 30px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.1);
    }
    .status-header {
      display: flex;
      align-items: center;
      gap: 15px;
      margin-bottom: 20px;
    }
    .status-icon {
      width: 50px;
      height: 50px;
      border-radius: 50%;
      background: #10b981;
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
      font-size: 24px;
    }
    .status-info h2 {
      color: #333;
      font-size: 20px;
    }
    .status-info p {
      color: #666;
    }
    .cards-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
      gap: 20px;
    }
    .card {
      background: white;
      border-radius: 12px;
      padding: 25px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.1);
    }
    .card h3 {
      color: #333;
      margin-bottom: 15px;
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .card p {
      color: #666;
      line-height: 1.6;
    }
    .card ul {
      color: #666;
      padding-left: 20px;
    }
    .card li {
      margin-bottom: 8px;
    }
    .btn {
      display: inline-block;
      padding: 12px 24px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      border: none;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      text-decoration: none;
      margin-top: 15px;
      transition: transform 0.2s;
    }
    .btn:hover {
      transform: translateY(-2px);
    }
    .btn-secondary {
      background: #6b7280;
    }
    .error {
      background: #fee2e2;
      color: #dc2626;
      padding: 15px;
      border-radius: 8px;
      margin-bottom: 20px;
    }
    .code {
      background: #1f2937;
      color: #10b981;
      padding: 15px;
      border-radius: 8px;
      font-family: monospace;
      margin-top: 10px;
      overflow-x: auto;
    }
    .test-section {
      margin-top: 20px;
      padding-top: 20px;
      border-top: 1px solid #e5e7eb;
    }
    #testResult {
      margin-top: 15px;
      padding: 15px;
      border-radius: 8px;
      display: none;
    }
    #testResult.success {
      background: #d1fae5;
      color: #065f46;
      display: block;
    }
    #testResult.error {
      background: #fee2e2;
      color: #dc2626;
      display: block;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>📧 Outlook AI Assistant</h1>
    <div class="header-actions">
      <a href="/auth/signout">Disconnect Microsoft</a>
      <a href="/logout">Logout</a>
    </div>
  </div>
  
  <div class="container">
    ${error ? `<div class="error">${error}</div>` : ''}
    
    <div class="status-card">
      <div class="status-header">
        <div class="status-icon">✓</div>
        <div class="status-info">
          <h2>Connected as ${userName}</h2>
          <p>${userEmail}</p>
        </div>
      </div>
      <p>Your Microsoft account is connected. You can now text your Twilio number to interact with your emails and calendar using AI.</p>
    </div>
    
    <div class="cards-grid">
      <div class="card">
        <h3>📱 How to Use</h3>
        <p>Simply send a text message to your Twilio phone number with questions like:</p>
        <ul>
          <li>"What emails came in today?"</li>
          <li>"What's on my calendar?"</li>
          <li>"Any important emails?"</li>
          <li>"Do I have any meetings tomorrow?"</li>
          <li>"Summarize my unread emails"</li>
        </ul>
      </div>
      
      <div class="card">
        <h3>⚙️ Configuration</h3>
        <p>Twilio Webhook URL (set this in your Twilio console):</p>
        <div class="code">${config.server.baseUrl}/sms/webhook</div>
        <p style="margin-top: 15px; font-size: 14px; color: #888;">
          Set HTTP POST method for incoming messages
        </p>
      </div>
      
      <div class="card">
        <h3>🧪 Test SMS</h3>
        <p>Send a test message to verify SMS is working:</p>
        <div class="test-section">
          <button class="btn" onclick="sendTestSMS()">Send Test SMS</button>
          <div id="testResult"></div>
        </div>
      </div>
      
      <div class="card">
        <h3>📊 Quick Summary</h3>
        <p>Get an AI summary of your day:</p>
        <div class="test-section">
          <button class="btn" onclick="getSummary()">Get Daily Summary</button>
          <div id="summaryResult" style="margin-top: 15px; display: none; padding: 15px; background: #f3f4f6; border-radius: 8px; white-space: pre-wrap;"></div>
        </div>
      </div>
    </div>
  </div>
  
  <script>
    async function sendTestSMS() {
      const resultDiv = document.getElementById('testResult');
      resultDiv.className = '';
      resultDiv.style.display = 'none';
      
      try {
        const response = await fetch('/api/test-sms', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: 'Test from Outlook AI Assistant - SMS is working!' })
        });
        const data = await response.json();
        
        if (data.success) {
          resultDiv.textContent = 'Test SMS sent successfully!';
          resultDiv.className = 'success';
        } else {
          resultDiv.textContent = 'Error: ' + data.error;
          resultDiv.className = 'error';
        }
      } catch (error) {
        resultDiv.textContent = 'Error: ' + error.message;
        resultDiv.className = 'error';
      }
    }
    
    async function getSummary() {
      const resultDiv = document.getElementById('summaryResult');
      resultDiv.style.display = 'none';
      resultDiv.textContent = 'Loading...';
      resultDiv.style.display = 'block';
      
      try {
        const response = await fetch('/api/summary');
        const data = await response.json();
        
        if (data.success) {
          resultDiv.textContent = data.summary;
        } else {
          resultDiv.textContent = 'Error: ' + data.error;
        }
      } catch (error) {
        resultDiv.textContent = 'Error: ' + error.message;
      }
    }
  </script>
</body>
</html>`;
}

// Start server
app.listen(config.server.port, () => {
  console.log(`
╔════════════════════════════════════════════════════════════╗
║           Outlook AI SMS Assistant Started                 ║
╠════════════════════════════════════════════════════════════╣
║  Server running at: ${config.server.baseUrl.padEnd(36)}║
║  SMS Webhook: ${(config.server.baseUrl + '/sms/webhook').padEnd(43)}║
╚════════════════════════════════════════════════════════════╝
  `);
  
  if (!outlook.isAuthenticated()) {
    console.log('⚠️  Microsoft not authenticated. Visit the web dashboard to sign in.');
  } else {
    console.log('✅ Microsoft account connected.');
  }
});
