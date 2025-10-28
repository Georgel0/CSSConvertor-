// Load environment variables (like the API Key) from a .env file
require('dotenv').config();

const express = require('express');
const bodyParser = require('body-parser');
const fetch = require('node-fetch');
const path = require('path');
const cors = require('cors');

const app = express();
const port = 3000;

// Middleware setup
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, '')));

// --- Gemini API Configuration ---
const API_KEY = process.env.GEMINI_API_KEY;
const API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=" + API_KEY;

// System Prompt now instructs the model to output a JSON object with two fields
const SYSTEM_PROMPT = `You are an expert CSS to Tailwind CSS converter. Your task is to analyze the provided CSS code and generate a JSON object containing two fields:

1.  **output:** The resulting Tailwind CSS classes, following ALL conversion rules below.
2.  **analysis:** A brief, one-sentence explanation (max 20 words) of the most notable conversion made (e.g., "Converted all media queries to responsive Tailwind prefixes like 'lg:'").

## Conversion Rules:
1.  **Output ONLY the Tailwind classes.** Do not include the original CSS or any markdown code fences for the 'output' field.
2.  If the CSS contains multiple, distinct class selectors (e.g., ".card" and ".button"), provide the classes for each selector on a new line, prefixed by the selector itself for clarity (e.g., '.card: bg-white...').
3.  Combine pseudo-classes and media queries with their base selector.
4.  Handle media queries using Tailwind's responsive prefixes (e.g., \`@media (min-width: 768px) { ... }\` becomes \`md:...\`).
5.  Handle pseudo-selectors using Tailwind's variant prefixes (e.g., \`:hover\` becomes \`hover:...\`, \`::before\` becomes \`before:...\`).
6.  Handle complex values (\`calc()\`, \`var()\`, \`minmax()\`) using Tailwind's arbitrary value syntax.

Example Input:
.card { background: white; width: 100%; } @media (min-width: 640px) { .card { width: 50%; } }

Example Output (JSON):
{
  "output": ".card: bg-white w-full sm:w-1/2",
  "analysis": "Media query for sm breakpoint was successfully applied."
}
`;


// --- Conversion Endpoint ---
app.post('/convert', async (req, res) => {
  if (!API_KEY) {
    return res.status(500).json({ error: "Server API Key not configured. Check your .env file." });
  }
  
  const cssCode = req.body.cssCode;
  if (!cssCode) {
    return res.status(400).json({ error: "Missing CSS code in request body." });
  }
  
  try {
    const payload = {
      contents: [{ parts: [{ text: cssCode }] }],
      systemInstruction: {
        parts: [{ text: SYSTEM_PROMPT }]
      },
      generationConfig: {
        // Ensure the model returns a structured JSON object
        responseMimeType: "application/json",
        responseSchema: {
          type: "OBJECT",
          properties: {
            "output": { "type": "STRING", "description": "The converted Tailwind classes." },
            "analysis": { "type": "STRING", "description": "One-sentence explanation of the conversion." }
          },
          required: ["output", "analysis"]
        }
      }
    };
    
    const apiResponse = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    
    if (!apiResponse.ok) {
      const errorBody = await apiResponse.json();
      console.error("Google API Error:", errorBody);
      // Relay a friendly error
      return res.status(apiResponse.status).json({
        error: `Google API error: ${apiResponse.statusText}. Please check the server logs.`,
        details: errorBody.error ? errorBody.error.message : 'Unknown API error.'
      });
    }
    
    const result = await apiResponse.json();
    
    // The AI output is a JSON string inside the text part
    const jsonText = result.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!jsonText) {
      return res.status(500).json({ error: "AI response was empty." });
    }
    
    let parsedJson;
    try {
      parsedJson = JSON.parse(jsonText);
    } catch (e) {
      console.error("Failed to parse AI JSON output:", jsonText);
      return res.status(500).json({ error: "AI generated malformed JSON. Try simplifying the CSS." });
    }
    
    // Success: Send the structured data back to the client
    res.json({
      output: parsedJson.output,
      analysis: parsedJson.analysis
    });
    
  } catch (error) {
    console.error("Server-side conversion error:", error);
    res.status(500).json({ error: "Internal server error during API call. Check server connectivity." });
  }
});

// Start the server
app.listen(port, () => {
  console.log(`Server is running at http://localhost:${port}`);
  console.log(`Open http://localhost:${port}/index.html in your browser.`);
});