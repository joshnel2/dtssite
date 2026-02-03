const twilio = require('twilio');
const config = require('../config');

// Initialize Twilio client
const client = twilio(config.twilio.accountSid, config.twilio.authToken);

// Send SMS message
async function sendSMS(to, message) {
  try {
    // Twilio SMS has a character limit, so we may need to split long messages
    const MAX_SMS_LENGTH = 1600; // Twilio's actual limit
    
    if (message.length <= MAX_SMS_LENGTH) {
      const result = await client.messages.create({
        body: message,
        from: config.twilio.phoneNumber,
        to: to,
      });
      console.log(`SMS sent successfully. SID: ${result.sid}`);
      return result;
    } else {
      // Split long messages
      const parts = splitMessage(message, MAX_SMS_LENGTH - 20); // Reserve space for part indicators
      const results = [];
      
      for (let i = 0; i < parts.length; i++) {
        const partMessage = parts.length > 1 
          ? `(${i + 1}/${parts.length}) ${parts[i]}`
          : parts[i];
          
        const result = await client.messages.create({
          body: partMessage,
          from: config.twilio.phoneNumber,
          to: to,
        });
        results.push(result);
        console.log(`SMS part ${i + 1}/${parts.length} sent. SID: ${result.sid}`);
      }
      
      return results;
    }
  } catch (error) {
    console.error('Twilio SMS Error:', error);
    throw new Error(`Failed to send SMS: ${error.message}`);
  }
}

// Send SMS to the configured user
async function sendToUser(message) {
  if (!config.userPhoneNumber) {
    throw new Error('User phone number not configured');
  }
  return sendSMS(config.userPhoneNumber, message);
}

// Split long messages intelligently
function splitMessage(message, maxLength) {
  const parts = [];
  let remaining = message;
  
  while (remaining.length > 0) {
    if (remaining.length <= maxLength) {
      parts.push(remaining);
      break;
    }
    
    // Try to split at a sentence boundary
    let splitIndex = remaining.lastIndexOf('. ', maxLength);
    if (splitIndex === -1 || splitIndex < maxLength / 2) {
      // Try to split at a word boundary
      splitIndex = remaining.lastIndexOf(' ', maxLength);
    }
    if (splitIndex === -1 || splitIndex < maxLength / 2) {
      // Force split at max length
      splitIndex = maxLength;
    }
    
    parts.push(remaining.substring(0, splitIndex + 1).trim());
    remaining = remaining.substring(splitIndex + 1).trim();
  }
  
  return parts;
}

// Validate incoming webhook request (Twilio signature validation)
function validateTwilioRequest(req) {
  const twilioSignature = req.headers['x-twilio-signature'];
  const url = `${config.server.baseUrl}/sms/webhook`;
  
  return twilio.validateRequest(
    config.twilio.authToken,
    twilioSignature,
    url,
    req.body
  );
}

// Generate TwiML response
function generateTwiMLResponse(message) {
  const twiml = new twilio.twiml.MessagingResponse();
  twiml.message(message);
  return twiml.toString();
}

module.exports = {
  sendSMS,
  sendToUser,
  validateTwilioRequest,
  generateTwiMLResponse,
};
