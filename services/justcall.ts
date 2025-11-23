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

// --- CONFIGURATION ---
// We ONLY use the local proxy path. This is defined in vite.config.ts
const BASE_PATH = "/justcall-api/v1/calls";

/**
 * Helper to construct the full URL.
 * It uses window.location.origin to ensure we hit the local server.
 */
const getProxyUrl = (queryParams: string) => {
  if (typeof window !== 'undefined') {
    return new URL(`${BASE_PATH}${queryParams}`, window.location.origin).toString();
  }
  return `${BASE_PATH}${queryParams}`;
};

/**
 * Validates the connection.
 * STRICT MODE: No fallbacks. It tells you exactly why the local connection failed.
 */
export const testConnection = async (apiKey: string, apiSecret: string): Promise<boolean> => {
  const cleanKey = apiKey.trim();
  const cleanSecret = apiSecret.trim();
  
  try {
    const authHeaders = {
      'Authorization': `${cleanKey}:${cleanSecret}`,
      'Accept': 'application/json'
    };
    
    // We request just 1 call to test the auth
    console.log(`Testing connection to: ${getProxyUrl('?page=1')}`);
    await axios.get(getProxyUrl('?page=1&per_page=1'), { headers: authHeaders });
    return true;
  } catch (error: any) {
    console.error("Connection Test Failed:", error);

    // CASE 1: Proxy Not Found (Most Common)
    if (error.response?.status === 404) {
       throw new Error("❌ PROXY ERROR (404): The server doesn't recognize '/justcall-api'. YOU MUST RESTART THE SERVER (Ctrl+C then 'npm run dev').");
    }
    
    // CASE 2: Wrong Password
    if (error.response?.status === 401 || error.response?.status === 403) {
        throw new Error("🔒 AUTH ERROR: Your API Key or Secret is incorrect.");
    }

    // CASE 3: Rate Limit (Too many tests)
    if (error.response?.status === 429) {
        throw new Error("⚠️ RATE LIMIT: You are testing too often. Wait 1 minute.");
    }
    
    // CASE 4: Network Error (CORS/Block)
    if (error.message === 'Network Error') {
        throw new Error("🌐 NETWORK ERROR: Browser blocked the request. Ensure you are on the correct preview URL.");
    }

    throw error;
  }
};

/**
 * Fetches calls using ONLY the local proxy.
 */
export const fetchJustCallTranscripts = async (
  config: { apiKey: string; apiSecret: string; startDate: string; endDate: string },
  onProgress: (count: number) => void
): Promise<TranscriptData[]> => {
  const allTranscripts: TranscriptData[] = [];
  let page = 1;
  let hasMore = true;
  
  const cleanKey = config.apiKey.trim();
  const cleanSecret = config.apiSecret.trim();
  const startUnix = Math.floor(new Date(config.startDate).getTime() / 1000);
  const endUnix = Math.floor(new Date(config.endDate).getTime() / 1000) + 86399;
  
  // Rate Limit Safety: 2000ms delay
  const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

  try {
    while (hasMore) {
      const baseParams = `from=${startUnix}&to=${endUnix}&page=${page}&per_page=50&fetch_transcription=true`;
      const targetUrl = getProxyUrl(`?${baseParams}`);
      
      const response = await axios.get(targetUrl, {
         headers: { 'Authorization': `${cleanKey}:${cleanSecret}`, 'Accept': 'application/json' }
      });

      const data = response.data;
      const calls = Array.isArray(data.data) ? data.data : (Array.isArray(data) ? data : []);

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
        await sleep(2000); // 2 Second Delay
      }
    }
  } catch (error: any) {
    console.error("Fetch Error:", error);
    if (error.response?.status === 404) {
        throw new Error("❌ PROXY STOPPED: Please restart the server.");
    }
    throw new Error(error.message || "Failed to retrieve transcripts.");
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