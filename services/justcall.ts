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
const BASE_PATH = "/justcall-api/v1/calls";
const DIRECT_API = "https://api.justcall.io/v1/calls";

/**
 * STRATEGY 1: Local Vite Proxy (Best)
 */
const getLocalUrl = (queryParams: string) => {
  if (typeof window !== 'undefined') {
    return new URL(`${BASE_PATH}${queryParams}`, window.location.origin).toString();
  }
  return `${BASE_PATH}${queryParams}`;
};

/**
 * STRATEGY 2: Public Proxies (Fallback)
 */
const getFallbackUrls = (targetUrlWithAuth: string) => {
  return [
    `https://corsproxy.io/?${encodeURIComponent(targetUrlWithAuth)}`,
    `https://api.allorigins.win/raw?url=${encodeURIComponent(targetUrlWithAuth)}`
  ];
};

export const testConnection = async (apiKey: string, apiSecret: string): Promise<boolean> => {
  const cleanKey = apiKey.trim();
  const cleanSecret = apiSecret.trim();
  
  try {
    const authHeaders = {
      'Authorization': `${cleanKey}:${cleanSecret}`,
      'Accept': 'application/json'
    };
    // Test a single small request
    await axios.get(getLocalUrl('?page=1&per_page=1'), { headers: authHeaders });
    return true;
  } catch (error: any) {
    if (error.response?.status === 404 || error.message === 'Network Error' || error.code === 'ERR_NETWORK') {
       console.warn("Local proxy unavailable, attempting fallbacks...");
       return await testFallbacks(cleanKey, cleanSecret);
    }
    if (error.response?.status === 403 || error.response?.status === 401) {
        throw new Error(`Invalid Credentials (Status ${error.response.status}). Please check your API Key/Secret.`);
    }
    throw error;
  }
};

const testFallbacks = async (apiKey: string, apiSecret: string): Promise<boolean> => {
  const queryAuth = `?api_key=${encodeURIComponent(apiKey)}&api_secret=${encodeURIComponent(apiSecret)}&page=1&per_page=1&_t=${Date.now()}`;
  const targetUrl = `${DIRECT_API}${queryAuth}`;
  const proxies = getFallbackUrls(targetUrl);

  for (const proxyUrl of proxies) {
    try {
      await axios.get(proxyUrl);
      return true;
    } catch (e) {
      console.warn(`Proxy failed: ${proxyUrl}`, e);
      continue;
    }
  }
  throw new Error("Connection failed. Could not reach JustCall via any proxy.");
};

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
  
  // FIX 1: INCREASED DELAY to 2000ms (2 seconds) to prevent Rate Limiting errors
  const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

  // Step 1: Determine Strategy
  let activeStrategy: 'LOCAL' | 'PROXY_1' | 'PROXY_2' = 'LOCAL';
  
  try {
     await axios.get(getLocalUrl('?page=1&per_page=1'), { 
        headers: { 'Authorization': `${cleanKey}:${cleanSecret}` } 
     });
     activeStrategy = 'LOCAL';
  } catch (e: any) {
     const testUrl = `${DIRECT_API}?api_key=${cleanKey}&api_secret=${cleanSecret}&page=1&per_page=1`;
     const proxies = getFallbackUrls(testUrl);
     try {
        await axios.get(proxies[0]);
        activeStrategy = 'PROXY_1';
     } catch {
        activeStrategy = 'PROXY_2';
     }
  }

  // Step 2: Fetch Loop
  try {
    while (hasMore) {
      // FIX 2: Removed leading '&' from baseParams to ensure clean URL
      const baseParams = `from=${startUnix}&to=${endUnix}&page=${page}&per_page=50&fetch_transcription=true`;
      
      let response;
      
      if (activeStrategy === 'LOCAL') {
         response = await axios.get(getLocalUrl(`?${baseParams}`), {
            headers: { 'Authorization': `${cleanKey}:${cleanSecret}`, 'Accept': 'application/json' }
         });
      } else {
         const authParams = `?api_key=${encodeURIComponent(cleanKey)}&api_secret=${encodeURIComponent(cleanSecret)}`;
         const fullTarget = `${DIRECT_API}${authParams}&${baseParams}`;
         
         const proxyUrl = activeStrategy === 'PROXY_1' 
            ? getFallbackUrls(fullTarget)[0] 
            : getFallbackUrls(fullTarget)[1];
            
         response = await axios.get(proxyUrl);
      }

      const data = response.data;
      const validData = data.data || (data.contents ? JSON.parse(data.contents).data : data);
      const calls = Array.isArray(validData) ? validData : [];

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
        // FIX 3: Wait 2 seconds between pages
        await sleep(2000); 
      }
    }
  } catch (error: any) {
    console.error("Fetch Error:", error);
    
    // FIX 4: Better Error Reporting
    const status = error.response?.status;
    let msg = "Failed to retrieve transcripts.";
    
    if (status === 429) {
        msg = "⚠️ RATE LIMIT REACHED: You are fetching too fast. The system will now wait longer between requests.";
    } else if (status === 401 || status === 403) {
        msg = "🔒 AUTH ERROR: Your credentials expired or are invalid.";
    } else if (error.message === 'Network Error') {
        msg = "🌐 NETWORK BLOCKED: A proxy or firewall blocked the request.";
    } else {
        msg = `System Error (${status || 'Unknown'}): ${error.message}`;
    }
    
    throw new Error(msg);
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
