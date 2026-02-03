const { AzureOpenAI } = require('openai');
const fs = require('fs');
const path = require('path');
const config = require('../config');
const outlook = require('./outlook');

const MEMORY_FILE = path.join(__dirname, '../../memory.json');

// Load user memory/preferences
function loadMemory() {
  try {
    if (fs.existsSync(MEMORY_FILE)) {
      return JSON.parse(fs.readFileSync(MEMORY_FILE, 'utf8'));
    }
  } catch (error) {
    console.error('Error loading memory:', error);
  }
  return null;
}

// Format memory for AI context
function formatMemory() {
  const memory = loadMemory();
  if (!memory) return '';

  let memoryText = '\n=== USER PREFERENCES & MEMORY ===\n';
  
  if (memory.user_name) {
    memoryText += `User's name: ${memory.user_name}\n`;
  }
  
  if (memory.preferences) {
    if (memory.preferences.summary_style) {
      memoryText += `Preferred summary style: ${memory.preferences.summary_style}\n`;
    }
    if (memory.preferences.important_senders && memory.preferences.important_senders.length > 0) {
      memoryText += `Important senders to highlight: ${memory.preferences.important_senders.join(', ')}\n`;
    }
    if (memory.preferences.important_keywords && memory.preferences.important_keywords.length > 0) {
      memoryText += `Important keywords to watch for: ${memory.preferences.important_keywords.join(', ')}\n`;
    }
  }
  
  if (memory.notes && memory.notes.length > 0) {
    memoryText += `\nNotes about user:\n`;
    memory.notes.forEach(note => {
      memoryText += `- ${note}\n`;
    });
  }
  
  if (memory.custom_instructions) {
    memoryText += `\nCustom instructions: ${memory.custom_instructions}\n`;
  }
  
  return memoryText;
}

// Initialize Azure OpenAI client
const client = new AzureOpenAI({
  apiKey: config.azureOpenAI.apiKey,
  endpoint: config.azureOpenAI.endpoint,
  apiVersion: '2024-02-15-preview',
});

const deploymentName = config.azureOpenAI.deploymentName;

// Format email for AI context
function formatEmail(email) {
  const from = email.from?.emailAddress?.name || email.from?.emailAddress?.address || 'Unknown';
  const date = new Date(email.receivedDateTime).toLocaleString();
  const importance = email.importance === 'high' ? '[HIGH PRIORITY] ' : '';
  const readStatus = email.isRead ? '' : '[UNREAD] ';
  
  return `${importance}${readStatus}From: ${from}\nDate: ${date}\nSubject: ${email.subject}\nPreview: ${email.bodyPreview || 'No preview available'}\n`;
}

// Format calendar event for AI context
function formatEvent(event) {
  const start = new Date(event.start.dateTime + 'Z').toLocaleString();
  const end = new Date(event.end.dateTime + 'Z').toLocaleString();
  const location = event.location?.displayName || 'No location';
  const organizer = event.organizer?.emailAddress?.name || 'Unknown';
  
  return `Event: ${event.subject}\nTime: ${start} - ${end}\nLocation: ${location}\nOrganizer: ${organizer}\n${event.bodyPreview ? `Details: ${event.bodyPreview}` : ''}\n`;
}

// Get current context (emails and calendar)
async function getCurrentContext() {
  let context = '';
  
  try {
    // Get today's emails
    const todayEmails = await outlook.getTodayEmails();
    context += `\n=== TODAY'S EMAILS (${todayEmails.length} total) ===\n`;
    if (todayEmails.length > 0) {
      todayEmails.forEach((email, index) => {
        context += `\n--- Email ${index + 1} ---\n${formatEmail(email)}`;
      });
    } else {
      context += 'No emails received today.\n';
    }
  } catch (error) {
    context += `\n=== EMAILS ===\nUnable to fetch emails: ${error.message}\n`;
  }

  try {
    // Get today's events
    const todayEvents = await outlook.getTodayEvents();
    context += `\n=== TODAY'S CALENDAR (${todayEvents.length} events) ===\n`;
    if (todayEvents.length > 0) {
      todayEvents.forEach((event, index) => {
        context += `\n--- Event ${index + 1} ---\n${formatEvent(event)}`;
      });
    } else {
      context += 'No events scheduled for today.\n';
    }
  } catch (error) {
    context += `\n=== CALENDAR ===\nUnable to fetch calendar: ${error.message}\n`;
  }

  try {
    // Get unread emails count
    const unreadEmails = await outlook.getUnreadEmails();
    context += `\n=== UNREAD EMAILS ===\nYou have ${unreadEmails.length} unread emails.\n`;
    
    // Add high priority unread emails
    const highPriority = unreadEmails.filter(e => e.importance === 'high');
    if (highPriority.length > 0) {
      context += `\n=== HIGH PRIORITY UNREAD (${highPriority.length}) ===\n`;
      highPriority.forEach((email, index) => {
        context += `\n--- Priority Email ${index + 1} ---\n${formatEmail(email)}`;
      });
    }
  } catch (error) {
    // Silent fail for unread count
  }

  return context;
}

// Parse calendar event request from AI response
function parseCalendarRequest(text) {
  // Check if the AI response contains a calendar creation request
  const calendarMatch = text.match(/\[CREATE_EVENT\]([\s\S]*?)\[\/CREATE_EVENT\]/);
  if (calendarMatch) {
    try {
      return JSON.parse(calendarMatch[1]);
    } catch (e) {
      console.error('Failed to parse calendar event:', e);
    }
  }
  return null;
}

// Process user message and generate AI response
async function processMessage(userMessage) {
  try {
    // Build context from Outlook data
    const outlookContext = await getCurrentContext();
    
    // Load user memory/preferences
    const memoryContext = formatMemory();
    
    const systemPrompt = `You are a helpful AI assistant that helps the user manage their Outlook email and calendar via SMS. 
You have access to their current email and calendar data provided below.

Current Date/Time: ${new Date().toLocaleString()}
${memoryContext}
${outlookContext}

CAPABILITIES:
- READ emails (you can see and summarize emails)
- READ calendar (you can see calendar events)
- CREATE calendar events (you can add new events)
- You CANNOT send, write, or reply to emails - only read them

INSTRUCTIONS:
- Answer questions about their emails and calendar based on the data provided
- Be concise since responses are sent via SMS (keep under 300 characters when possible)
- Highlight important or urgent items, especially from important senders listed in preferences
- If asked about something not in the data, explain what information you have access to
- For emails, mention sender, subject, and key details
- For calendar, mention event name, time, and location
- Be friendly but professional
- Follow any custom instructions from the user's preferences
- If user asks to send/write/reply to an email, politely explain you can only read emails, not send them

CREATING CALENDAR EVENTS:
When the user asks to add something to their calendar, respond with the event details AND include a JSON block like this:
[CREATE_EVENT]{"subject": "Meeting title", "startDateTime": "2026-02-03T14:00:00", "endDateTime": "2026-02-03T15:00:00", "location": "Office", "body": "Optional notes"}[/CREATE_EVENT]

Use ISO 8601 format for dates. Always confirm what you're adding before adding it.`;

    const response = await client.chat.completions.create({
      model: deploymentName,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      max_tokens: 500,
      temperature: 0.7,
    });

    let aiResponse = response.choices[0].message.content;
    
    // Check if AI wants to create a calendar event
    const eventRequest = parseCalendarRequest(aiResponse);
    if (eventRequest) {
      try {
        await outlook.createCalendarEvent(eventRequest);
        // Remove the JSON block from the response shown to user
        aiResponse = aiResponse.replace(/\[CREATE_EVENT\][\s\S]*?\[\/CREATE_EVENT\]/, '').trim();
        aiResponse += '\n✓ Event added to your calendar!';
      } catch (error) {
        console.error('Failed to create calendar event:', error);
        aiResponse = aiResponse.replace(/\[CREATE_EVENT\][\s\S]*?\[\/CREATE_EVENT\]/, '').trim();
        aiResponse += '\n⚠ Failed to add event to calendar.';
      }
    }

    return aiResponse;
  } catch (error) {
    console.error('Azure OpenAI Error:', error);
    throw new Error(`AI processing failed: ${error.message}`);
  }
}

// Get a summary of today's schedule
async function getDailySummary() {
  const userMessage = "Give me a brief summary of my day - what emails came in today and what's on my calendar?";
  return processMessage(userMessage);
}

// Check for important/urgent items
async function getImportantItems() {
  const userMessage = "What are the most important or urgent items I should pay attention to today? Consider high-priority emails and upcoming meetings.";
  return processMessage(userMessage);
}

module.exports = {
  processMessage,
  getDailySummary,
  getImportantItems,
  getCurrentContext,
};
