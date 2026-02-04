const TelegramBot = require('node-telegram-bot-api');
const config = require('../config');
const azureOpenAI = require('./azure-openai');
const outlook = require('./outlook');

let bot = null;
let authorizedChatId = null;

// Initialize Telegram bot
function initBot() {
  if (!config.telegram.botToken) {
    console.log('Telegram bot token not configured - skipping Telegram integration');
    return null;
  }

  bot = new TelegramBot(config.telegram.botToken, { polling: true });
  authorizedChatId = config.telegram.chatId;

  console.log('Telegram bot initialized');

  // Handle /start command
  bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    
    // If no chat ID is configured, show this one so user can set it
    if (!authorizedChatId) {
      bot.sendMessage(chatId, 
        `👋 Welcome to Outlook AI Assistant!\n\n` +
        `Your Chat ID is: \`${chatId}\`\n\n` +
        `Add this to your environment variables as:\n` +
        `TELEGRAM_CHAT_ID=${chatId}\n\n` +
        `Then restart the app to enable messaging.`,
        { parse_mode: 'Markdown' }
      );
      return;
    }

    if (chatId.toString() !== authorizedChatId.toString()) {
      bot.sendMessage(chatId, '⛔ Unauthorized. This bot is configured for a specific user.');
      return;
    }

    bot.sendMessage(chatId,
      `👋 Welcome to your Outlook AI Assistant!\n\n` +
      `You can ask me about:\n` +
      `• Your emails - "What emails came in today?"\n` +
      `• Your calendar - "What's on my schedule?"\n` +
      `• Add events - "Add meeting with John tomorrow at 3pm"\n\n` +
      `Commands:\n` +
      `/status - Check connection status\n` +
      `/summary - Get daily summary\n` +
      `/help - Show this message`
    );
  });

  // Handle /status command
  bot.onText(/\/status/, async (msg) => {
    const chatId = msg.chat.id;
    
    if (authorizedChatId && chatId.toString() !== authorizedChatId.toString()) {
      return;
    }

    const msStatus = outlook.isAuthenticated() ? '✅ Connected' : '❌ Not connected';
    bot.sendMessage(chatId,
      `📊 Status:\n\n` +
      `Microsoft: ${msStatus}\n` +
      `Telegram: ✅ Working`
    );
  });

  // Handle /summary command
  bot.onText(/\/summary/, async (msg) => {
    const chatId = msg.chat.id;
    
    if (authorizedChatId && chatId.toString() !== authorizedChatId.toString()) {
      return;
    }

    if (!outlook.isAuthenticated()) {
      bot.sendMessage(chatId, '❌ Microsoft not connected. Please sign in via the web dashboard first.');
      return;
    }

    bot.sendMessage(chatId, '⏳ Getting your summary...');
    
    try {
      const summary = await azureOpenAI.getDailySummary();
      bot.sendMessage(chatId, summary);
    } catch (error) {
      bot.sendMessage(chatId, '❌ Error getting summary: ' + error.message);
    }
  });

  // Handle /help command
  bot.onText(/\/help/, (msg) => {
    const chatId = msg.chat.id;
    
    if (authorizedChatId && chatId.toString() !== authorizedChatId.toString()) {
      return;
    }

    bot.sendMessage(chatId,
      `📧 *Outlook AI Assistant Help*\n\n` +
      `*Ask me things like:*\n` +
      `• "What emails came in today?"\n` +
      `• "Any important emails?"\n` +
      `• "What's on my calendar?"\n` +
      `• "Do I have meetings tomorrow?"\n` +
      `• "Add lunch with Sarah tomorrow at noon"\n\n` +
      `*Commands:*\n` +
      `/start - Welcome message\n` +
      `/status - Check connection status\n` +
      `/summary - Get daily summary\n` +
      `/help - Show this help`,
      { parse_mode: 'Markdown' }
    );
  });

  // Handle regular messages
  bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;

    // Ignore commands (handled above)
    if (text && text.startsWith('/')) {
      return;
    }

    // Check authorization
    if (authorizedChatId && chatId.toString() !== authorizedChatId.toString()) {
      bot.sendMessage(chatId, '⛔ Unauthorized.');
      return;
    }

    // Test mode
    if (text && text.toLowerCase().startsWith('test')) {
      bot.sendMessage(chatId, `✅ Telegram is working! You said: "${text}"`);
      return;
    }

    // Check if Microsoft is connected
    if (!outlook.isAuthenticated()) {
      bot.sendMessage(chatId, 
        '❌ Microsoft not connected yet.\n\n' +
        'Send "test" to verify Telegram works, or visit the web dashboard to sign in to Microsoft.'
      );
      return;
    }

    // Process with AI
    try {
      bot.sendChatAction(chatId, 'typing');
      const response = await azureOpenAI.processMessage(text);
      bot.sendMessage(chatId, response);
    } catch (error) {
      console.error('Telegram message error:', error);
      bot.sendMessage(chatId, '❌ Error: ' + error.message);
    }
  });

  // Error handling
  bot.on('polling_error', (error) => {
    console.error('Telegram polling error:', error.message);
  });

  return bot;
}

// Send message to authorized user
async function sendToUser(message) {
  if (!bot || !authorizedChatId) {
    throw new Error('Telegram bot not configured or no chat ID set');
  }
  
  return bot.sendMessage(authorizedChatId, message);
}

// Get bot instance
function getBot() {
  return bot;
}

module.exports = {
  initBot,
  sendToUser,
  getBot,
};
