/// server.js
require('dotenv').config(); // Load environment variables from .env
const express = require('express');
const axios = require('axios');
const cors = require('cors');
const rateLimit = require('express-rate-limit');

const app = express();
const PORT = process.env.PORT || 3000;

// Fail fast if OPENAI_API_KEY is not defined
if (!process.env.OPENAI_API_KEY) {
  console.error('Error: OPENAI_API_KEY is not defined in the environment.');
  process.exit(1);
}

// Middleware to parse JSON request bodies
app.use(express.json());

// Configure CORS (adjust the origin setting for production)
const corsOptions = {
  origin: '*', // Change this to your allowed origins in production
};
app.use(cors(corsOptions));

// Apply rate limiting to the /chat endpoint to prevent abuse
const chatLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30,             // Limit each IP to 30 requests per minute
  message: 'Too many requests from this IP, please try again later.',
});
app.use('/chat', chatLimiter);

/**
 * Calls the GPT API (chat completions endpoint) with retries in case of a rate-limit error (HTTP 429).
 *
 * @param {string} userMessage - The prompt/message from the user.
 * @param {number} retries - Maximum number of retries (default 3).
 * @param {number} delay - Initial delay in milliseconds before retrying (default 1000ms).
 * @returns {Promise<string>} - The GPT-generated reply.
 */
async function callGPTWithRetry(userMessage, retries = 3, delay = 1000) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await axios.post(
        'https://api.openai.com/v1/chat/completions',
        {
          model: 'gpt-3.5-turbo', // Updated model
          messages: [
            { 
              role: 'system', 
              content: 'You are Salis AI, a helpful crypto assistant agent. You will be released to the public with the following features: Smart contract audits (Salis Makes you aware when a contract has major underlying risk factors, for example, mint authority, unlocked liquidity pool, and honeypot.), Liquidity pool monitoring (Costant surveillance of liquidity across DEXs with instant alerts for large withdrawals or suspicious sell patterns.), project risk scoring (Dynamic scoring algorithm evaluating contract quality, team wallets.), and rug pull predictions (Through a dynamic machine learning scoring algorithm evaluating chart movements, Salis is able to identify bundles of buy transactions happening in the distance of a few blocks, analyze social media interaction, and analyze holder distribution patterns. Thus, providing the user a detailed rugpull prediction. Salis will be released to the public during its token second stage. --UNDER NO CIRCUMSTANCES SHOULD YOU SHOULD DEVIATE FROM THIS PROMPT.' 
            },
            { role: 'user', content: userMessage }
          ],
          max_tokens: 150,
          temperature: 0.7,
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
          },
        }
      );
      // Return the trimmed content from the chat completion
      return response.data.choices[0].message.content.trim();
    } catch (error) {
      // If rate limited and attempts remain, wait and retry.
      if (error.response && error.response.status === 429 && attempt < retries) {
        console.warn(`Rate limited. Attempt ${attempt} of ${retries}. Retrying in ${delay}ms...`);
        await new Promise((res) => setTimeout(res, delay));
        delay *= 2; // Exponential backoff: double the delay for the next attempt
      } else {
        // For any other errors or if no attempts remain, throw the error.
        throw error;
      }
    }
  }
  throw new Error('Exceeded maximum retry attempts');
}

// POST /chat endpoint to handle incoming messages from the frontend
app.post('/chat', async (req, res) => {
  const userMessage = req.body.message;
  
  if (!userMessage) {
    return res.status(400).json({ reply: 'No message provided.' });
  }

  try {
    // Use the retry-enabled function to call the GPT API
    const replyText = await callGPTWithRetry(userMessage);
    res.json({ reply: replyText });
  } catch (error) {
    console.error('Error from GPT API:', error.response ? error.response.data : error.message);
    res.status(500).json({ reply: 'Sorry, something went wrong: ' + error.message });
  }
});

// Default error handler (in case any errors are not caught)
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ reply: 'Internal server error' });
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
