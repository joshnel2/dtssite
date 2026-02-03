const msal = require('@azure/msal-node');
const { Client } = require('@microsoft/microsoft-graph-client');
const fs = require('fs');
const path = require('path');
const config = require('../config');

const TOKEN_FILE = path.join(__dirname, '../../tokens.json');

// Debug: Log what credentials we have (without exposing secrets)
console.log('Microsoft Config Check:');
console.log('- Client ID:', config.microsoft.clientId ? `SET (${config.microsoft.clientId.length} chars)` : 'NOT SET');
console.log('- Client Secret:', config.microsoft.clientSecret ? `SET (${config.microsoft.clientSecret.length} chars)` : 'NOT SET');
console.log('- Tenant ID:', config.microsoft.tenantId || 'NOT SET');
console.log('- Redirect URI:', config.microsoft.redirectUri);

// MSAL Configuration
const msalConfig = {
  auth: {
    clientId: config.microsoft.clientId || 'not-set',
    clientSecret: config.microsoft.clientSecret || 'not-set',
    authority: `https://login.microsoftonline.com/${config.microsoft.tenantId || 'common'}`,
  },
};

let cca = null;
try {
  if (config.microsoft.clientId && config.microsoft.clientSecret) {
    cca = new msal.ConfidentialClientApplication(msalConfig);
    console.log('MSAL client initialized successfully');
  } else {
    console.error('MSAL client NOT initialized - missing credentials');
  }
} catch (error) {
  console.error('Failed to initialize MSAL client:', error.message);
}

// Token storage functions
function saveTokens(tokens) {
  fs.writeFileSync(TOKEN_FILE, JSON.stringify(tokens, null, 2));
}

function loadTokens() {
  try {
    if (fs.existsSync(TOKEN_FILE)) {
      return JSON.parse(fs.readFileSync(TOKEN_FILE, 'utf8'));
    }
  } catch (error) {
    console.error('Error loading tokens:', error);
  }
  return null;
}

function clearTokens() {
  try {
    if (fs.existsSync(TOKEN_FILE)) {
      fs.unlinkSync(TOKEN_FILE);
    }
  } catch (error) {
    console.error('Error clearing tokens:', error);
  }
}

// Check if user is authenticated
function isAuthenticated() {
  const tokens = loadTokens();
  return tokens && tokens.refreshToken;
}

// Check if Microsoft is configured
function isConfigured() {
  return cca !== null;
}

// Get auth URL for initial login
function getAuthUrl() {
  if (!cca) {
    throw new Error('Microsoft credentials not configured. Please set MICROSOFT_CLIENT_ID and MICROSOFT_CLIENT_SECRET environment variables.');
  }
  const authCodeUrlParameters = {
    scopes: config.microsoft.scopes,
    redirectUri: config.microsoft.redirectUri,
  };
  return cca.getAuthCodeUrl(authCodeUrlParameters);
}

// Handle auth callback and get tokens
async function handleAuthCallback(code) {
  if (!cca) {
    throw new Error('Microsoft credentials not configured.');
  }
  const tokenRequest = {
    code,
    scopes: config.microsoft.scopes,
    redirectUri: config.microsoft.redirectUri,
  };

  const response = await cca.acquireTokenByCode(tokenRequest);
  
  // Save tokens including refresh token
  saveTokens({
    accessToken: response.accessToken,
    refreshToken: response.account ? response.account.homeAccountId : null,
    expiresOn: response.expiresOn,
    account: response.account,
  });

  return response;
}

// Get valid access token (refresh if needed)
async function getAccessToken() {
  if (!cca) {
    throw new Error('Microsoft credentials not configured.');
  }
  
  const tokens = loadTokens();
  
  if (!tokens || !tokens.account) {
    throw new Error('Not authenticated. Please sign in first.');
  }

  try {
    // Try to acquire token silently using the cached account
    const silentRequest = {
      scopes: config.microsoft.scopes,
      account: tokens.account,
    };

    const response = await cca.acquireTokenSilent(silentRequest);
    
    // Update saved tokens
    saveTokens({
      accessToken: response.accessToken,
      refreshToken: tokens.refreshToken,
      expiresOn: response.expiresOn,
      account: response.account,
    });

    return response.accessToken;
  } catch (error) {
    console.error('Error refreshing token:', error);
    throw new Error('Session expired. Please sign in again.');
  }
}

// Create Microsoft Graph client
async function getGraphClient() {
  const accessToken = await getAccessToken();
  
  return Client.init({
    authProvider: (done) => {
      done(null, accessToken);
    },
  });
}

// Get user profile
async function getUserProfile() {
  const client = await getGraphClient();
  return client.api('/me').get();
}

// Get emails from today
async function getTodayEmails() {
  const client = await getGraphClient();
  
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayISO = today.toISOString();

  const messages = await client
    .api('/me/messages')
    .filter(`receivedDateTime ge ${todayISO}`)
    .select('subject,from,receivedDateTime,bodyPreview,isRead,importance')
    .orderby('receivedDateTime desc')
    .top(50)
    .get();

  return messages.value;
}

// Get recent emails (last N days)
async function getRecentEmails(days = 7) {
  const client = await getGraphClient();
  
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  startDate.setHours(0, 0, 0, 0);
  const startDateISO = startDate.toISOString();

  const messages = await client
    .api('/me/messages')
    .filter(`receivedDateTime ge ${startDateISO}`)
    .select('subject,from,receivedDateTime,bodyPreview,isRead,importance')
    .orderby('receivedDateTime desc')
    .top(100)
    .get();

  return messages.value;
}

// Get unread emails
async function getUnreadEmails() {
  const client = await getGraphClient();

  const messages = await client
    .api('/me/messages')
    .filter('isRead eq false')
    .select('subject,from,receivedDateTime,bodyPreview,importance')
    .orderby('receivedDateTime desc')
    .top(50)
    .get();

  return messages.value;
}

// Search emails
async function searchEmails(query) {
  const client = await getGraphClient();

  const messages = await client
    .api('/me/messages')
    .search(`"${query}"`)
    .select('subject,from,receivedDateTime,bodyPreview,isRead,importance')
    .orderby('receivedDateTime desc')
    .top(20)
    .get();

  return messages.value;
}

// Get today's calendar events
async function getTodayEvents() {
  const client = await getGraphClient();
  
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStart = today.toISOString();
  
  const todayEnd = new Date(today);
  todayEnd.setHours(23, 59, 59, 999);
  const todayEndISO = todayEnd.toISOString();

  const events = await client
    .api('/me/calendarview')
    .query({
      startDateTime: todayStart,
      endDateTime: todayEndISO,
    })
    .select('subject,start,end,location,organizer,isAllDay,bodyPreview')
    .orderby('start/dateTime')
    .top(50)
    .get();

  return events.value;
}

// Get upcoming events (next N days)
async function getUpcomingEvents(days = 7) {
  const client = await getGraphClient();
  
  const now = new Date();
  const futureDate = new Date();
  futureDate.setDate(futureDate.getDate() + days);

  const events = await client
    .api('/me/calendarview')
    .query({
      startDateTime: now.toISOString(),
      endDateTime: futureDate.toISOString(),
    })
    .select('subject,start,end,location,organizer,isAllDay,bodyPreview')
    .orderby('start/dateTime')
    .top(100)
    .get();

  return events.value;
}

// Get events for a specific date
async function getEventsForDate(date) {
  const client = await getGraphClient();
  
  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);
  
  const endOfDay = new Date(date);
  endOfDay.setHours(23, 59, 59, 999);

  const events = await client
    .api('/me/calendarview')
    .query({
      startDateTime: startOfDay.toISOString(),
      endDateTime: endOfDay.toISOString(),
    })
    .select('subject,start,end,location,organizer,isAllDay,bodyPreview')
    .orderby('start/dateTime')
    .top(50)
    .get();

  return events.value;
}

module.exports = {
  isAuthenticated,
  isConfigured,
  getAuthUrl,
  handleAuthCallback,
  getAccessToken,
  getUserProfile,
  getTodayEmails,
  getRecentEmails,
  getUnreadEmails,
  searchEmails,
  getTodayEvents,
  getUpcomingEvents,
  getEventsForDate,
  clearTokens,
};
