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
// This works if vite.config.ts is loaded correctly (requires server restart).
const getLocalUrl = (queryParams: string) => {
  const basePath = "/justcall-api/v1/calls";
  if (typeof window !== 'undefined') {
    // FIX: Using window.location.origin prevents the "Invalid URL" error
    return new URL(`${basePath}${queryParams}`, window.location.origin).toString();
  }
  return `${basePath}${queryParams}`;
};

// --- STRATEGY 2: Header-Compatible Public Proxy (Fallback) ---
// Used automatically if the local proxy fails (404).
// We use corsproxy.io because it FORWARDS the Authorization headers securely.
const getPublicUrl = (queryParams: string) => {
    // We construct the direct JustCall URL
    const target = `https://api.justcall.io/v1/calls${queryParams}`;
    // And wrap it in the proxy
    return `https://corsproxy.io/?${encodeURIComponent(target)}`;
};

/**
 * Validates the API credentials.
 * Automatically switches to the Public Proxy if the Local Proxy isn't running.
 */
export const testConnection = async (apiKey: string, apiSecret: string): Promise<boolean> => {
  const cleanKey = apiKey.trim();
  const cleanSecret = apiSecret.trim();
  const authHeaders = {
    'Authorization': `${cleanKey}:${cleanSecret}`,
    'Accept': 'application/json'
  };
  
  try {
    // Attempt 1: Try Local Proxy
    await axios.get(getLocalUrl('?page=1&per_page=1'), { headers: authHeaders });
    return true;
  } catch (error: any) {
    // If Local Proxy is missing (404) or Network Error, switch to Fallback
    if (error.response?.status === 404 || error.message === 'Network Error' || error.code === 'ERR_NETWORK') {
       console.warn("Local proxy unavailable (404), switching to fallback proxy...");
       try {
         // Fallback: Use Public Proxy with Headers
         await axios.get(getPublicUrl('?page=1&per_page=1'), { headers: authHeaders });
         return true;
       } catch (fallbackError: any) {
          console.error("Fallback failed:", fallbackError);
          throw new Error("Connection failed. Please check your API Key and Secret.");
       }
    }
    
    // Handle specific Auth errors
    if (error.response?.status === 403 || error.response?.status === 401) {
        throw new Error(`Invalid Credentials (Status ${error.response.status}). Please check your API Key/Secret.`);
    }
    
    throw error;
  }
};

/**
 * Fetches calls from JustCall API.
 * Uses the appropriate proxy strategy based on availability.
 */
export const fetchJustCallTranscripts = async (
  config: { apiKey: string; apiSecret: string; startDate: string; endDate: string },
  onProgress: (count: number) => void
): Promise<TranscriptData[]> => {
  const allTranscripts: TranscriptData[] = [];
  let page = 1;
  let hasMore = true;
  let useFallback = false;
  
  const cleanKey = config.apiKey.trim();
  const cleanSecret = config.apiSecret.trim();
  const authHeaders = {
    'Authorization': `${cleanKey}:${cleanSecret}`,
    'Accept': 'application/json'
  };

  const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
  const startUnix = Math.floor(new Date(config.startDate).getTime() / 1000);
  const endUnix = Math.floor(new Date(config.endDate).getTime() / 1000) + 86399;

  // Step 1: Detect which Proxy Strategy to use
  try {
      await axios.get(getLocalUrl('?page=1&per_page=1'), { headers: authHeaders });
  } catch (err: any) {
      if (err.response?.status === 404 || err.message === 'Network Error' || err.code === 'ERR_NETWORK') {
          useFallback = true;
      }
  }

  // Step 2: Fetch Loop
  try {
    while (hasMore) {
      // FIX: Added &fetch_transcription=true to ensure text content is returned
      const queryParams = `?from=${startUnix}&to=${endUnix}&page=${page}&per_page=50&fetch_transcription=true`;
      let calls: any[] = [];
      let response;

      // Select URL based on strategy
      if (!useFallback) {
          response = await axios.get(getLocalUrl(queryParams), { headers: authHeaders });
      } else {
          response = await axios.get(getPublicUrl(queryParams), { headers: authHeaders });
      }

      const data = response.data;
      calls = Array.isArray(data.data) ? data.data : (Array.isArray(data) ? data : []);

      if (calls.length === 0) {
        hasMore = false;
        break;
      }

      for (const call of calls) {
        // JustCall stores transcripts in various fields depending on the integration type
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