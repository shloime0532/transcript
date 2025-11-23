import { GoogleGenAI } from "@google/genai";
import { CodeSnippet } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

/**
 * Generates the specific Node.js backend script based on user config.
 */
export const generateIntegrationCode = async (config: { apiKey: string; apiSecret: string; startDate: string; endDate: string }): Promise<CodeSnippet> => {
  try {
    const model = "gemini-2.5-flash";

    // We hardcode the prompt to be extremely specific to the user's need for "JustCall IQ" and "Past Data".
    // Updated to include config.json persistence logic.
    const prompt = `
      Create a single, robust **Node.js** file named 'extractor.js'.
      
      **GOAL**: Download historical call transcripts (specifically JustCall IQ/AI transcripts) for the date range provided.

      **CONFIGURATION**:
      - Default API Key: "${config.apiKey}"
      - Default API Secret: "${config.apiSecret}"
      - Start Date: "${config.startDate} 00:00:00"
      - End Date: "${config.endDate} 23:59:59"

      **TECHNICAL REQUIREMENTS**:
      1. **Dependencies**: Use 'axios' (standard promise-based HTTP client) and 'fs' (file system).
      2. **Persistence Strategy**:
         - Define a constant 'CONFIG_FILE' = './config.json'.
         - On startup, check if 'config.json' exists.
         - If 'config.json' DOES NOT exist:
           - Create it immediately using the Default API Key, Secret, and Dates provided above.
           - Log "Initialized config.json with provided credentials."
         - If 'config.json' DOES exist:
           - Read and parse it to get the credentials.
           - Log "Loaded credentials from existing config.json."
         - Use the credentials from the config object for all requests.
      3. **Endpoint**: Use 'https://api.justcall.io/v1/calls' (or the correct current endpoint for listing calls).
      4. **Headers**: Authorization header should be 'Authorization': 'api_key:api_secret' (Accept: application/json).
      5. **Pagination Logic**: 
         - Implement a 'while' loop to fetch ALL pages. 
         - JustCall usually uses a 'page' or 'from' parameter. Start at page 1 and increment until no results are returned.
      6. **Data Extraction**:
         - For each call, extract: 'id', 'datetime', 'from', 'to', 'duration', and critically **'iq_transcript'** or **'call_transcription'**.
         - Note: If the list endpoint does not return the full transcript, generate code to fetch the individual call details endpoint ('/v1/calls/get') for each call ID to get the 'transcript' field.
      7. **Rate Limiting**:
         - Add a 'sleep' function (500ms) between every API call to prevent 429 errors.
      8. **Output**:
         - Collect all transcripts into an array.
         - Write the array to a file named 'justcall_historical_data.json' at the end.
      
      **OUTPUT FORMAT**:
      - Return ONLY the raw JavaScript code. 
      - Do not wrap in markdown blocks if possible, or I will strip them.
      - Add comments explaining how to run it (e.g., "npm install axios").
    `;

    const response = await ai.models.generateContent({
      model,
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: {
        systemInstruction: "You are a Senior Backend Engineer. Write production-grade, error-handling Node.js code. Do not use placeholders. Use the provided credentials directly.",
      }
    });

    const text = response.text || "";
    
    // Clean up markdown formatting if present
    const match = text.match(/```javascript([\s\S]*?)```/) || text.match(/```js([\s\S]*?)```/) || text.match(/```([\s\S]*?)```/);
    const code = match ? match[1].trim() : text;
    
    return {
      language: "javascript",
      code: code,
      explanation: "Generated based on JustCall API standards."
    };

  } catch (error) {
    console.error("Gemini Code Gen Error:", error);
    throw new Error("Failed to generate backend script.");
  }
};

// Legacy function kept for type safety but unused
export const researchJustCallApi = async (query: string): Promise<any> => { return {}; };