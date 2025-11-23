
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

// --- STRATEGY 1: Local Vite Proxy (Preferred) ---
// Preserves headers, secure, no CORS issues if configured correctly.
const getLocalUrl = (queryParams: string) => {
  const basePath = "/justcall-api/v1/calls";
  if (typeof window !== 'undefined') {
    return new URL(`${basePath}${queryParams}`, window.location.origin).toString();
  }
  return `${basePath}${queryParams}`;
};

// --- STRATEGY 2: Public Proxy (Fallback) ---
// Used if user hasn't restarted dev server (404) or is in an environment without local proxy.
// Uses 'allorigins' which allows requests from anywhere.
// Credentials passed in URL because proxies often strip Authorization headers.
const getPublicUrl = (queryParams: string, apiKey: string, apiSecret: string) => {
   // Remove leading ?
   const cleanParams = queryParams.startsWith('?') ? queryParams.slice(1) : queryParams;
   
   // Construct target URL with Auth in Query (JustCall V1 supports this)
   // We add a timestamp to prevent proxy caching
   const target = `https://api.justcall.io/v1/calls?api_key=${encodeURIComponent(apiKey)}&api_secret=${encodeURIComponent(apiSecret)}&${cleanParams}&_t=${Date.now()}`;
   
   // Encode for proxy
   return `https://api.allorigins.win/get?url=${encodeURIComponent(target)}`;
};

/**
 * Validates the API credentials by fetching a single record.
 * Tries Local Proxy first, falls back to Public Proxy if Local is missing (404).
 */
export const testConnection = async (apiKey: string, apiSecret: string): Promise<boolean> => {
  const cleanKey = apiKey.trim();
  const cleanSecret = apiSecret.trim();
  
  try {
    // Attempt 1: Local Proxy (Standard Headers)
    await axios.get(getLocalUrl('?page=1&per_page=1'), {
      headers: {
        'Authorization': `${cleanKey}:${cleanSecret}`,
        'Accept': 'application/json'
      }
    });
    return true;
  } catch (error: any) {
    // If Local Proxy isn't found (404) or Network Error, try Fallback
    if (error.response?.status === 404 || error.message === 'Network Error') {
       console.warn("Local proxy failed (404/Network), attempting public proxy fallback...");
       try {
         const fallbackUrl = getPublicUrl('?page=1&per_page=1', cleanKey, cleanSecret);
         const response = await axios.get(fallbackUrl);
         
         // AllOrigins returns data in 'contents' property as a string
         if (response.data && response.data.contents) {
             const innerData = JSON.parse(response.data.contents);
             // Check if the API returned a functional error (like 403 inside the JSON)
             if (innerData.error || (innerData.status && innerData.status !== 'success' && !Array.isArray(innerData) && !Array.isArray(innerData.data))) {
                 throw new Error("API Error: " + JSON.stringify(innerData));
             }
             return true;
         }
       } catch (fallbackError: any) {
          console.error("Fallback failed:", fallbackError);
          // If fallback also fails, we want to show the original Auth error if possible, or the fallback error
          throw new Error("Connection failed via both Local and Public proxies. Check credentials.");
       }
       return true; // Fallback succeeded
    }
    
    // Handle standard errors (401/403 from Local)
    if (error.response) {
        const status = error.response.status;
        if (status === 403 || status === 401) {
            throw new Error(`Invalid Credentials (Status ${status}). Please check your API Key/Secret.`);
        }
        throw new Error(`Server Error (${status}): ${error.response.data?.message || 'Unknown'}`);
    }
    
    throw error;
  }
};

/**
 * Fetches calls from JustCall API.
 * Automatically detects if it needs to use the Fallback Proxy.
 */
export const fetchJustCallTranscripts = async (
  config: { apiKey: string; apiSecret: string; startDate: string; endDate: string },
  onProgress: (count: number) => void
): Promise<TranscriptData[]> => {
  const allTranscripts: TranscriptData[] = [];
  let page = 1;
  let hasMore = true;
  let useFallback = false;

  // Helper to delay execution (rate limiting)
  const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

  // Unix Timestamps (Seconds)
  const startUnix = Math.floor(new Date(config.startDate).getTime() / 1000);
  const endUnix = Math.floor(new Date(config.endDate).getTime() / 1000) + 86399;

  // Step 1: Determine Strategy (Test Page 1)
  try {
      // Try Local First
      await axios.get(getLocalUrl('?page=1&per_page=1'), {
        headers: { 'Authorization': `${config.apiKey}:${config.apiSecret}`, 'Accept': 'application/json' }
      });
  } catch (err: any) {
      if (err.response?.status === 404 || err.message === 'Network Error') {
          console.log("Switched to Fallback Proxy for extraction.");
          useFallback = true;
      } else {
          throw err; // Real error (auth, rate limit)
      }
  }

  // Step 2: Fetch Loop
  try {
    while (hasMore) {
      const queryParams = `?from=${startUnix}&to=${endUnix}&page=${page}&per_page=50&fetch_transcription=true`;
      let calls: any[] = [];

      if (!useFallback) {
          // Local Strategy
          const targetUrl = getLocalUrl(queryParams);
          const response = await axios.get(targetUrl, {
            headers: {
                'Authorization': `${config.apiKey}:${config.apiSecret}`,
                'Accept': 'application/json'
            }
          });
          const data = response.data;
          calls = Array.isArray(data.data) ? data.data : (Array.isArray(data) ? data : []);
      } else {
          // Fallback Strategy
          const targetUrl = getPublicUrl(queryParams, config.apiKey, config.apiSecret);
          const response = await axios.get(targetUrl);
          if (response.data && response.data.contents) {
              const parsed = JSON.parse(response.data.contents);
              calls = Array.isArray(parsed.data) ? parsed.data : (Array.isArray(parsed) ? parsed : []);
          }
      }

      if (calls.length === 0) {
        hasMore = false;
        break;
      }

      for (const call of calls) {
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
        await sleep(500); 
      }
    }
  } catch (error: any) {
    console.error("Fetch Error:", error);
    throw new Error("Failed to retrieve transcripts. Please check connection.");
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
