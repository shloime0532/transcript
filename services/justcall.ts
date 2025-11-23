
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

// We rotate through these proxies to find one that works
const PROXY_SERVICES = [
    (url: string) => `https://corsproxy.io/?${encodeURIComponent(url)}`,
    (url: string) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`
];

const BASE_URL = "https://api.justcall.io/v1/calls";

/**
 * Helper to try multiple proxies
 */
async function fetchWithFailover(targetUrl: string, headers: any = {}) {
    let lastError;
    
    for (const createProxyUrl of PROXY_SERVICES) {
        try {
            const proxyUrl = createProxyUrl(targetUrl);
            // console.log("Trying proxy:", proxyUrl); 
            const response = await axios.get(proxyUrl, { headers, timeout: 15000 });
            return response;
        } catch (err: any) {
            // console.warn("Proxy failed, trying next...", err.message);
            lastError = err;
            // If it's a 401/403 from the actual API (not the proxy), stop trying other proxies
            if (err.response && (err.response.status === 401 || err.response.status === 403)) {
                throw err;
            }
        }
    }
    throw lastError;
}

/**
 * Validates the API credentials by fetching a single record.
 */
export const testConnection = async (apiKey: string, apiSecret: string): Promise<boolean> => {
  try {
    // CRITICAL FIX: Encode key/secret individually so symbols don't break the URL query params
    const safeKey = encodeURIComponent(apiKey);
    const safeSecret = encodeURIComponent(apiSecret);
    
    const targetUrl = `${BASE_URL}?page=1&per_page=1&api_key=${safeKey}&api_secret=${safeSecret}`;
    
    await fetchWithFailover(targetUrl, { 'Accept': 'application/json' });
    return true;
  } catch (error: any) {
    console.error("Connection Test Failed:", error);
    
    if (error.response) {
        // If we get a response, the server rejected us (e.g. 403), so we propagate that specific error
        throw new Error(`Server rejected credentials (Status ${error.response.status})`);
    }
    
    return false;
  }
};

/**
 * Fetches calls from JustCall API, handling pagination and extracting transcripts.
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

  try {
    // Encode credentials once
    const safeKey = encodeURIComponent(config.apiKey);
    const safeSecret = encodeURIComponent(config.apiSecret);

    while (hasMore) {
      // Construct authenticated URL
      const targetUrl = `${BASE_URL}?from=${config.startDate}&to=${config.endDate}&page=${page}&per_page=50&api_key=${safeKey}&api_secret=${safeSecret}`;

      const response = await fetchWithFailover(targetUrl, {
        'Accept': 'application/json'
      });

      const data = response.data;

      // Validate response structure
      if (!data || (!Array.isArray(data.data) && !Array.isArray(data))) {
        hasMore = false;
        break;
      }

      // Handle both data.data (paginated wrapper) and raw array responses
      const calls = Array.isArray(data.data) ? data.data : (Array.isArray(data) ? data : []);
      
      if (calls.length === 0) {
        hasMore = false;
        break;
      }

      // Extract relevant fields
      for (const call of calls) {
        // Aggressively hunt for the transcript in known fields
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
      
      // Pagination check
      if (calls.length < 50) {
        hasMore = false;
      } else {
        page++;
        await sleep(1000); // 1s delay to be safe with rate limits
      }
    }
  } catch (error: any) {
    console.error("Fetch Error:", error);
    
    let errorMessage = "Failed to connect to JustCall.";
    
    if (error.response) {
        const status = error.response.status;
        const apiMsg = error.response.data?.message || JSON.stringify(error.response.data);
        
        if (status === 403 || status === 401) {
            errorMessage = `Authentication Failed (${status}). The server rejected the keys. Please Reset Connection and check your API Key/Secret.`;
        } else if (status === 429) {
            errorMessage = "Rate Limit Exceeded. Please try a smaller date range.";
        } else {
            errorMessage = `API Error (${status}): ${apiMsg}`;
        }
    } else if (error.message) {
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
