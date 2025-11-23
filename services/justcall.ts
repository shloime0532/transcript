
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

// PROXY STRATEGY:
// 1. corsproxy.io: Usually fastest, supports headers.
// 2. allorigins.win: Very reliable, but often strips headers (requires URL auth).
// 3. thingproxy: Backup.
const PROXY_SERVICES = [
    (url: string) => `https://corsproxy.io/?${encodeURIComponent(url)}`,
    (url: string) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
    (url: string) => `https://thingproxy.freeboard.io/fetch/${url}`
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
            // 15s timeout for proxy responses
            const response = await axios.get(proxyUrl, { headers, timeout: 15000 });
            return response;
        } catch (err: any) {
            lastError = err;
            // Continue to next proxy on error
            // console.warn(`Proxy ${createProxyUrl('')} failed:`, err.message);
        }
    }
    throw lastError;
}

/**
 * Validates the API credentials by fetching a single record.
 */
export const testConnection = async (apiKey: string, apiSecret: string): Promise<boolean> => {
  try {
    // AUTH STRATEGY: 
    // Send credentials in BOTH Headers (Standard) and URL (Backup for proxies that strip headers).
    // JustCall V1 historically accepts URL params, which is safer for proxies.
    
    const encodedKey = encodeURIComponent(apiKey);
    const encodedSecret = encodeURIComponent(apiSecret);

    // Construct URL with credentials
    const targetUrl = `${BASE_URL}?page=1&per_page=1&api_key=${encodedKey}&api_secret=${encodedSecret}`;
    
    const headers = {
        'Authorization': `${apiKey}:${apiSecret}`,
        'Accept': 'application/json'
    };
    
    await fetchWithFailover(targetUrl, headers);
    return true;
  } catch (error: any) {
    console.error("Connection Test Failed:", error);
    
    if (error.message === 'Network Error') {
        throw new Error('Network Error: Proxies blocked. Please disable AdBlockers/Privacy extensions for this page.');
    }

    if (error.response) {
        const status = error.response.status;
        if (status === 403) {
             throw new Error(`Access Denied (403). Check API Keys or IP Whitelist.`);
        }
        throw new Error(`Server Error: ${status}`);
    }
    
    throw error;
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
  
  const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

  // Unix Timestamps
  const startUnix = Math.floor(new Date(config.startDate).getTime() / 1000);
  const endUnix = Math.floor(new Date(config.endDate).getTime() / 1000) + 86399;

  const encodedKey = encodeURIComponent(config.apiKey);
  const encodedSecret = encodeURIComponent(config.apiSecret);

  const headers = {
      'Authorization': `${config.apiKey}:${config.apiSecret}`,
      'Accept': 'application/json'
  };

  try {
    while (hasMore) {
      // Include credentials in URL for proxy reliability
      const targetUrl = `${BASE_URL}?from=${startUnix}&to=${endUnix}&page=${page}&per_page=50&api_key=${encodedKey}&api_secret=${encodedSecret}`;

      const response = await fetchWithFailover(targetUrl, headers);

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
        await sleep(1000); // 1s delay
      }
    }
  } catch (error: any) {
    console.error("Fetch Error:", error);
    
    let errorMessage = "Failed to connect to JustCall.";
    
    if (error.message === 'Network Error') {
        errorMessage = "Network Error: Proxies were blocked. Please check your internet connection or disable ad-blockers.";
    } else if (error.response) {
        const status = error.response.status;
        const apiMsg = error.response.data?.message || JSON.stringify(error.response.data);
        
        if (status === 403 || status === 401) {
            errorMessage = `Authentication Failed (${status}). Please check API Credentials.`;
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
