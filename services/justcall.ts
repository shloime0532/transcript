
import axios from 'axios';

export interface TranscriptData {
  id: string;
  datetime: string;
  from: string;
  to: string;
  duration: string;
  direction: string;
  transcript: string;
  recording_url: string;
}

// USE LOCAL PROXY PATH (Defined in vite.config.ts)
// This forwards requests from http://localhost:PORT/justcall-api -> https://api.justcall.io
// This bypasses CORS and allows us to send secure Headers.
const BASE_URL = "/justcall-api/v1/calls";

/**
 * Validates the API credentials by fetching a single record.
 * Uses the Authorization header for security.
 */
export const testConnection = async (apiKey: string, apiSecret: string): Promise<boolean> => {
  try {
    // Clean inputs
    const cleanKey = apiKey.trim();
    const cleanSecret = apiSecret.trim();

    // We request 1 item just to check if keys work.
    // We use the Standard Authentication method: Authorization Header.
    await axios.get(`${BASE_URL}?page=1&per_page=1`, {
      headers: {
        'Authorization': `${cleanKey}:${cleanSecret}`,
        'Accept': 'application/json'
      }
    });
    return true;
  } catch (error: any) {
    console.error("Connection Test Failed:", error);
    
    if (error.response) {
        const status = error.response.status;
        if (status === 404) {
            throw new Error("Proxy Error (404): Please restart your dev server to apply vite.config.ts changes.");
        }
        if (status === 403 || status === 401) {
            throw new Error(`Invalid Credentials (Status ${status}). Please check your API Key/Secret.`);
        }
        throw new Error(`Server Error (${status}): ${error.response.data?.message || 'Unknown'}`);
    }
    
    throw new Error(error.message || "Connection failed. Ensure local dev server is running.");
  }
};

/**
 * Fetches calls from JustCall API using the local proxy.
 */
export const fetchJustCallTranscripts = async (
  config: { apiKey: string; apiSecret: string; startDate: string; endDate: string },
  onProgress: (count: number) => void
): Promise<TranscriptData[]> => {
  const allTranscripts: TranscriptData[] = [];
  let page = 1;
  let hasMore = true;
  
  // Helper to delay execution (rate limiting)
  const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

  // Unix Timestamps (Seconds)
  const startUnix = Math.floor(new Date(config.startDate).getTime() / 1000);
  const endUnix = Math.floor(new Date(config.endDate).getTime() / 1000) + 86399;

  try {
    while (hasMore) {
      // JustCall V1 uses Unix timestamps for 'from' and 'to' usually, but accepts YYYY-MM-DD in some endpoints.
      // Using Unix timestamps is safer.
      const targetUrl = `${BASE_URL}?from=${startUnix}&to=${endUnix}&page=${page}&per_page=50`;

      const response = await axios.get(targetUrl, {
        headers: {
            'Authorization': `${config.apiKey}:${config.apiSecret}`,
            'Accept': 'application/json'
        }
      });

      const data = response.data;

      // Robust data checking
      if (!data || (!Array.isArray(data.data) && !Array.isArray(data))) {
        hasMore = false;
        break;
      }

      const calls = Array.isArray(data.data) ? data.data : (Array.isArray(data) ? data : []);
      
      if (calls.length === 0) {
        hasMore = false;
        break;
      }

      for (const call of calls) {
        // JustCall stores transcripts in various fields depending on the integration type (AI, IQ, Standard)
        const text = call.iq_transcript || 
                     call.call_transcription || 
                     call.transcription || 
                     (call.extra_details && call.extra_details.transcript) ||
                     (call.justcall_iq && call.justcall_iq.transcript) ||
                     "[No Transcript Found]";
        
        allTranscripts.push({
            id: call.id,
            datetime: call.datetime || call.date || 'Unknown Date',
            from: call.from || 'Unknown',
            to: call.to || 'Unknown',
            duration: call.duration || '0',
            direction: call.direction || 'Unknown',
            transcript: typeof text === 'string' ? text : JSON.stringify(text),
            recording_url: call.recording_url || ''
        });
      }

      onProgress(allTranscripts.length);
      
      if (calls.length < 50) {
        hasMore = false;
      } else {
        page++;
        await sleep(500); // 500ms delay to be safe with rate limits
      }
    }
  } catch (error: any) {
    console.error("Fetch Error:", error);
    
    let errorMessage = "Failed to connect to JustCall.";
    
    if (error.response) {
        const status = error.response.status;
        if (status === 403 || status === 401) {
            errorMessage = `Authentication Failed (${status}). Please check your API Key/Secret.`;
        } else if (status === 429) {
            errorMessage = "Rate Limit Exceeded. Please try a smaller date range.";
        } else if (status === 404) {
             errorMessage = "Proxy Error: Endpoint not found. Ensure vite.config.ts is loaded.";
        } else {
            errorMessage = `API Error (${status}): ${error.response.data?.message || 'Unknown error'}`;
        }
    } else {
        errorMessage = error.message;
    }
    throw new Error(errorMessage);
  }

  return allTranscripts;
};

export const convertToCSV = (data: TranscriptData[]): string => {
  const headers = ['Call ID', 'Date Time', 'From', 'To', 'Direction', 'Duration', 'Transcript', 'Recording URL'];
  const rows = data.map(row => [
    row.id,
    row.datetime,
    row.from,
    row.to,
    row.direction,
    row.duration,
    `"${(row.transcript || '').replace(/"/g, '""')}"`,
    row.recording_url
  ]);

  return [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
};
