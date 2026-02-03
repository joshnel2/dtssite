const express = require('express');
const router = express.Router();
const twilioService = require('../services/twilio');
const azureOpenAI = require('../services/azure-openai');
const outlook = require('../services/outlook');
const config = require('../config');

// Webhook endpoint for incoming SMS
router.post('/webhook', express.urlencoded({ extended: false }), async (req, res) => {
  try {
    const incomingMessage = req.body.Body;
    const fromNumber = req.body.From;
    
    console.log(`Received SMS from ${fromNumber}: ${incomingMessage}`);

    // Optional: Validate that the message is from the configured user
    if (config.userPhoneNumber && fromNumber !== config.userPhoneNumber) {
      console.log(`Ignoring message from unauthorized number: ${fromNumber}`);
      res.type('text/xml');
      return res.send(twilioService.generateTwiMLResponse('Unauthorized number.'));
    }

    // Test mode - if message starts with "test", just echo back
    if (incomingMessage.toLowerCase().startsWith('test')) {
      console.log('Test mode - echoing back');
      res.type('text/xml');
      return res.send(twilioService.generateTwiMLResponse(
        `✅ SMS is working! You said: "${incomingMessage}"\n\nTwilio connection successful.`
      ));
    }

    // Check if Microsoft is authenticated
    if (!outlook.isAuthenticated()) {
      res.type('text/xml');
      return res.send(twilioService.generateTwiMLResponse(
        'Microsoft not connected yet. Text "test" to verify SMS works, or visit the web dashboard to sign in.'
      ));
    }

    // Process the message with AI
    const aiResponse = await azureOpenAI.processMessage(incomingMessage);
    
    console.log(`AI Response: ${aiResponse}`);

    // Send response via TwiML
    res.type('text/xml');
    res.send(twilioService.generateTwiMLResponse(aiResponse));

  } catch (error) {
    console.error('SMS Webhook Error:', error);
    
    res.type('text/xml');
    res.send(twilioService.generateTwiMLResponse(
      'Sorry, I encountered an error processing your request. Please try again.'
    ));
  }
});

// Status callback endpoint (optional, for delivery receipts)
router.post('/status', express.urlencoded({ extended: false }), (req, res) => {
  const messageSid = req.body.MessageSid;
  const messageStatus = req.body.MessageStatus;
  
  console.log(`Message ${messageSid} status: ${messageStatus}`);
  
  res.sendStatus(200);
});

module.exports = router;
