const cron = require('node-cron');
const fs = require('fs');
const path = require('path');
const twilioService = require('./twilio');
const telegram = require('./telegram');
const azureOpenAI = require('./azure-openai');
const outlook = require('./outlook');
const config = require('../config');

// Send message via available channel (Telegram or Twilio)
async function sendNotification(message) {
  // Try Telegram first (it's free)
  if (config.telegram.botToken && config.telegram.chatId) {
    try {
      await telegram.sendToUser(message);
      console.log('Notification sent via Telegram');
      return;
    } catch (error) {
      console.error('Telegram notification failed:', error.message);
    }
  }
  
  // Fall back to Twilio SMS
  if (config.twilio.accountSid && config.userPhoneNumber) {
    try {
      await twilioService.sendToUser(message);
      console.log('Notification sent via SMS');
      return;
    } catch (error) {
      console.error('SMS notification failed:', error.message);
    }
  }
  
  console.log('No notification channel available');
}

const SCHEDULE_FILE = path.join(__dirname, '../../schedule.json');

// Load schedule configuration
function loadSchedule() {
  try {
    if (fs.existsSync(SCHEDULE_FILE)) {
      return JSON.parse(fs.readFileSync(SCHEDULE_FILE, 'utf8'));
    }
  } catch (error) {
    console.error('Error loading schedule:', error);
  }
  return getDefaultSchedule();
}

// Get default schedule
function getDefaultSchedule() {
  return {
    enabled: true,
    timezone: "America/New_York",
    
    // Morning summary - sends a summary of your day
    morningSummary: {
      enabled: true,
      time: "08:00",  // 8:00 AM
      message: "Good morning! Here's your daily briefing."
    },
    
    // Evening recap - sends recap of what happened
    eveningRecap: {
      enabled: false,
      time: "18:00",  // 6:00 PM
      message: "Here's your evening recap."
    },
    
    // Meeting reminders - reminds you X minutes before meetings
    meetingReminders: {
      enabled: true,
      minutesBefore: 15  // Remind 15 minutes before
    },
    
    // Urgent email alerts - check for urgent emails periodically
    urgentEmailAlerts: {
      enabled: true,
      checkEveryMinutes: 30,  // Check every 30 minutes
      onlyDuring: {
        start: "09:00",
        end: "17:00"  // Only during work hours
      }
    }
  };
}

// Active cron jobs
let activeJobs = [];

// Send morning summary
async function sendMorningSummary() {
  if (!outlook.isAuthenticated()) {
    console.log('Skipping morning summary - not authenticated');
    return;
  }
  
  try {
    const schedule = loadSchedule();
    const summary = await azureOpenAI.processMessage(
      `Give me my morning briefing: What's on my calendar today? Any important emails I should know about? Keep it concise.`
    );
    
    const message = `${schedule.morningSummary.message}\n\n${summary}`;
    await sendNotification(message);
    console.log('Morning summary sent');
  } catch (error) {
    console.error('Failed to send morning summary:', error);
  }
}

// Send evening recap
async function sendEveningRecap() {
  if (!outlook.isAuthenticated()) {
    console.log('Skipping evening recap - not authenticated');
    return;
  }
  
  try {
    const schedule = loadSchedule();
    const recap = await azureOpenAI.processMessage(
      `Give me a quick recap of today: How many emails did I get? Any I haven't read? Any meetings I had? Keep it brief.`
    );
    
    const message = `${schedule.eveningRecap.message}\n\n${recap}`;
    await sendNotification(message);
    console.log('Evening recap sent');
  } catch (error) {
    console.error('Failed to send evening recap:', error);
  }
}

// Check for upcoming meetings and send reminders
async function checkMeetingReminders() {
  if (!outlook.isAuthenticated()) {
    return;
  }
  
  try {
    const schedule = loadSchedule();
    const minutesBefore = schedule.meetingReminders.minutesBefore || 15;
    
    const events = await outlook.getTodayEvents();
    const now = new Date();
    
    for (const event of events) {
      const eventStart = new Date(event.start.dateTime + 'Z');
      const minutesUntil = (eventStart - now) / (1000 * 60);
      
      // If event is coming up within the reminder window (but not past)
      if (minutesUntil > 0 && minutesUntil <= minutesBefore && minutesUntil > minutesBefore - 1) {
        const location = event.location?.displayName ? ` at ${event.location.displayName}` : '';
        const message = `⏰ Reminder: "${event.subject}"${location} starts in ${Math.round(minutesUntil)} minutes!`;
        await sendNotification(message);
        console.log(`Meeting reminder sent for: ${event.subject}`);
      }
    }
  } catch (error) {
    console.error('Failed to check meeting reminders:', error);
  }
}

// Check for urgent emails
let lastCheckedEmailTime = new Date();

async function checkUrgentEmails() {
  if (!outlook.isAuthenticated()) {
    return;
  }
  
  try {
    const schedule = loadSchedule();
    const settings = schedule.urgentEmailAlerts;
    
    // Check if we're within the allowed time window
    const now = new Date();
    const currentTime = now.toTimeString().slice(0, 5);
    if (currentTime < settings.onlyDuring.start || currentTime > settings.onlyDuring.end) {
      return; // Outside of alert hours
    }
    
    const emails = await outlook.getUnreadEmails();
    
    // Filter for urgent/important emails received since last check
    const urgentEmails = emails.filter(email => {
      const receivedTime = new Date(email.receivedDateTime);
      return email.importance === 'high' && receivedTime > lastCheckedEmailTime;
    });
    
    if (urgentEmails.length > 0) {
      for (const email of urgentEmails) {
        const from = email.from?.emailAddress?.name || email.from?.emailAddress?.address || 'Unknown';
        const message = `🚨 Urgent email from ${from}: "${email.subject}"`;
        await sendNotification(message);
        console.log(`Urgent email alert sent for: ${email.subject}`);
      }
    }
    
    lastCheckedEmailTime = now;
  } catch (error) {
    console.error('Failed to check urgent emails:', error);
  }
}

// Convert time string (HH:MM) to cron expression
function timeToCron(time) {
  const [hours, minutes] = time.split(':');
  return `${minutes} ${hours} * * *`;
}

// Start all scheduled jobs
function startScheduler() {
  // Stop any existing jobs first
  stopScheduler();
  
  const schedule = loadSchedule();
  
  if (!schedule.enabled) {
    console.log('Scheduler is disabled');
    return;
  }
  
  console.log('Starting scheduler...');
  
  // Morning summary
  if (schedule.morningSummary.enabled) {
    const cronExpr = timeToCron(schedule.morningSummary.time);
    const job = cron.schedule(cronExpr, sendMorningSummary, {
      timezone: schedule.timezone
    });
    activeJobs.push(job);
    console.log(`Morning summary scheduled for ${schedule.morningSummary.time}`);
  }
  
  // Evening recap
  if (schedule.eveningRecap.enabled) {
    const cronExpr = timeToCron(schedule.eveningRecap.time);
    const job = cron.schedule(cronExpr, sendEveningRecap, {
      timezone: schedule.timezone
    });
    activeJobs.push(job);
    console.log(`Evening recap scheduled for ${schedule.eveningRecap.time}`);
  }
  
  // Meeting reminders - check every minute
  if (schedule.meetingReminders.enabled) {
    const job = cron.schedule('* * * * *', checkMeetingReminders, {
      timezone: schedule.timezone
    });
    activeJobs.push(job);
    console.log(`Meeting reminders enabled (${schedule.meetingReminders.minutesBefore} min before)`);
  }
  
  // Urgent email alerts
  if (schedule.urgentEmailAlerts.enabled) {
    const minutes = schedule.urgentEmailAlerts.checkEveryMinutes || 30;
    const job = cron.schedule(`*/${minutes} * * * *`, checkUrgentEmails, {
      timezone: schedule.timezone
    });
    activeJobs.push(job);
    console.log(`Urgent email alerts enabled (every ${minutes} min)`);
  }
  
  console.log('Scheduler started with', activeJobs.length, 'jobs');
}

// Stop all scheduled jobs
function stopScheduler() {
  activeJobs.forEach(job => job.stop());
  activeJobs = [];
  console.log('Scheduler stopped');
}

// Reload schedule (call after editing schedule.json)
function reloadSchedule() {
  stopScheduler();
  startScheduler();
}

module.exports = {
  loadSchedule,
  startScheduler,
  stopScheduler,
  reloadSchedule,
  sendMorningSummary,
  sendEveningRecap,
};
