# Outlook AI SMS Assistant

An AI-powered assistant that lets you interact with your Outlook email and calendar through SMS text messages. Powered by Azure OpenAI.

## Features

- **SMS Interface**: Text your questions and get AI-powered responses about your emails and calendar
- **Outlook Integration**: Access your emails and calendar events via Microsoft Graph API
- **Azure OpenAI**: Intelligent processing of your queries using Azure OpenAI
- **One-Time Login**: Sign in to Microsoft once, stay logged in with refresh tokens
- **Password Protected**: Web dashboard protected with a password

## Example SMS Queries

- "What emails came in today?"
- "Any important or urgent emails?"
- "What's on my calendar today?"
- "Do I have any meetings tomorrow?"
- "Summarize my unread emails"
- "Any emails from John?"
- "What's my schedule for this week?"

## Prerequisites

1. **Azure OpenAI Service** - With a deployed model
2. **Microsoft Azure AD App Registration** - For Outlook access
3. **Twilio Account** - For SMS messaging
4. **Node.js 18+**

## Setup Guide

### 1. Azure OpenAI Setup

1. Create an Azure OpenAI resource in Azure Portal
2. Deploy a model (e.g., gpt-4 or gpt-35-turbo)
3. Note your:
   - API Key
   - Endpoint URL
   - Deployment Name

### 2. Microsoft Azure AD App Registration

1. Go to [Azure Portal](https://portal.azure.com) > Azure Active Directory > App registrations
2. Click "New registration"
3. Name: "Outlook AI Assistant"
4. Supported account types: "Accounts in any organizational directory and personal Microsoft accounts"
5. Redirect URI: `http://localhost:3000/auth/callback` (Web)
6. After creation, note your:
   - Application (client) ID
   - Directory (tenant) ID
7. Go to "Certificates & secrets" > New client secret > Note the secret value
8. Go to "API permissions" > Add permissions:
   - Microsoft Graph > Delegated permissions:
     - `User.Read`
     - `Mail.Read`
     - `Calendars.Read`
     - `offline_access`
   - Click "Grant admin consent" (if you're an admin)

### 3. Twilio Setup

1. Create a [Twilio account](https://www.twilio.com)
2. Get a phone number with SMS capability
3. Note your:
   - Account SID
   - Auth Token
   - Twilio Phone Number

### 4. Environment Configuration

1. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```

2. Fill in your credentials:
   ```env
   # Azure OpenAI
   AZURE_OPENAI_API_KEY=your_key
   AZURE_OPENAI_DEPLOYMENT_NAME=your_deployment
   AZURE_OPENAI_ENDPOINT=https://your-resource.openai.azure.com

   # Microsoft
   MICROSOFT_CLIENT_ID=your_client_id
   MICROSOFT_CLIENT_SECRET=your_secret
   MICROSOFT_TENANT_ID=common  # or your tenant ID

   # Twilio
   TWILIO_ACCOUNT_SID=your_sid
   TWILIO_AUTH_TOKEN=your_token
   TWILIO_PHONE_NUMBER=+1234567890

   # Your phone number
   USER_PHONE_NUMBER=+1234567890

   # Server
   PORT=3000
   BASE_URL=http://localhost:3000
   SESSION_SECRET=random_string_here

   # Site password (for dashboard access)
   SITE_PASSWORD=79697969
   ```

### 5. Install & Run

```bash
# Install dependencies
npm install

# Start the server
npm start

# Or for development with auto-reload
npm run dev
```

### 6. First-Time Setup

1. Open `http://localhost:3000` in your browser
2. Enter the site password: `79697969`
3. Click "Sign in with Microsoft" and authorize the app
4. Your Microsoft account is now connected!

### 7. Configure Twilio Webhook

1. Go to Twilio Console > Phone Numbers > Your Number
2. Under "Messaging Configuration":
   - Set "A message comes in" webhook to: `https://your-domain.com/sms/webhook`
   - Method: HTTP POST
3. Save

**Note**: For local development, use [ngrok](https://ngrok.com) to expose your local server:
```bash
ngrok http 3000
```
Then use the ngrok URL as your webhook.

## Deployment

For production deployment, make sure to:

1. Update `BASE_URL` in `.env` to your production URL
2. Update the Microsoft App redirect URI to your production callback URL
3. Set `NODE_ENV=production`
4. Use HTTPS
5. Update Twilio webhook URL

### Deploy to Railway/Render/Heroku

1. Push code to GitHub
2. Connect repository to your hosting platform
3. Set environment variables in the platform's dashboard
4. Deploy

## Architecture

```
┌─────────────┐     SMS      ┌─────────────┐
│   Your      │ ──────────── │   Twilio    │
│   Phone     │              │   Service   │
└─────────────┘              └──────┬──────┘
                                    │ Webhook
                                    ▼
                             ┌─────────────┐
                             │   Express   │
                             │   Server    │
                             └──────┬──────┘
                                    │
                    ┌───────────────┼───────────────┐
                    │               │               │
                    ▼               ▼               ▼
             ┌───────────┐  ┌───────────┐  ┌───────────┐
             │  Azure    │  │ Microsoft │  │  Twilio   │
             │  OpenAI   │  │  Graph    │  │  (Reply)  │
             └───────────┘  └───────────┘  └───────────┘
                    │               │
                    │               ▼
                    │        ┌───────────┐
                    │        │  Outlook  │
                    │        │  Email &  │
                    │        │  Calendar │
                    │        └───────────┘
                    │
                    ▼
             AI processes email/calendar
             data and generates response
```

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/` | GET | Dashboard (requires login) |
| `/login` | GET/POST | Site password login |
| `/logout` | GET | Logout |
| `/setup` | GET | Microsoft auth setup page |
| `/auth/microsoft` | GET | Initiate Microsoft OAuth |
| `/auth/callback` | GET | OAuth callback |
| `/auth/signout` | GET | Disconnect Microsoft |
| `/sms/webhook` | POST | Twilio SMS webhook |
| `/api/status` | GET | Check auth status |
| `/api/test-sms` | POST | Send test SMS |
| `/api/summary` | GET | Get AI daily summary |

## Troubleshooting

### "Session expired" errors
- The refresh token may have expired
- Visit the dashboard and re-authenticate with Microsoft

### SMS not received
- Check Twilio webhook URL is correct
- Verify your phone number in `.env`
- Check Twilio console for error logs

### "Unauthorized number" response
- Make sure `USER_PHONE_NUMBER` matches your phone number exactly (including country code)

## License

MIT
