require('dotenv').config();

module.exports = {
  // Azure OpenAI
  azureOpenAI: {
    apiKey: process.env.AZURE_OPENAI_API_KEY,
    deploymentName: process.env.AZURE_OPENAI_DEPLOYMENT_NAME,
    endpoint: process.env.AZURE_OPENAI_ENDPOINT,
  },

  // Microsoft Graph API
  microsoft: {
    clientId: process.env.MICROSOFT_CLIENT_ID,
    clientSecret: process.env.MICROSOFT_CLIENT_SECRET,
    tenantId: process.env.MICROSOFT_TENANT_ID,
    redirectUri: `${process.env.BASE_URL || 'http://localhost:3000'}/auth/callback`,
    scopes: [
      'offline_access',
      'User.Read',
      'Mail.Read',
      'Calendars.Read',
    ],
  },

  // Twilio
  twilio: {
    accountSid: process.env.TWILIO_ACCOUNT_SID,
    authToken: process.env.TWILIO_AUTH_TOKEN,
    phoneNumber: process.env.TWILIO_PHONE_NUMBER,
  },

  // User phone number
  userPhoneNumber: process.env.USER_PHONE_NUMBER,

  // Server
  server: {
    port: process.env.PORT || 3000,
    baseUrl: process.env.BASE_URL || 'http://localhost:3000',
    sessionSecret: process.env.SESSION_SECRET || 'default-secret-change-me',
  },

  // Site password
  sitePassword: process.env.SITE_PASSWORD || '79697969',
};
