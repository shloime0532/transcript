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
 * Uses HTTP Headers. Secure. Requires Vite Dev Server.
 */
const getLocalUrl = (queryParams: string) => {
  if (typeof window !== 'undefined') {
    return new URL(`${BASE_PATH}${queryParams}`, window.location.origin).toString();
  }
  return `${BASE_PATH}${queryParams}`;
};

/**
 * STRATEGY 2: Public Proxies (Fallback)
 * Uses URL Query Params for Auth (Bypasses Header stripping issues).
 * We iterate through these if Local Proxy fails.
 */
const getFallbackUrls = (targetUrlWithAuth: string) => {
  return [
    // CorsProxy.io - Fast, reliable
    `https://corsproxy.io/?${encodeURIComponent(targetUrlWithAuth)}`,
    // AllOrigins - Good backup, handles simple requests well
    `https://api.allorigins.win/raw?url=${encodeURIComponent(targetUrlWithAuth)}`
  ];
};

/**
 * Validates the API credentials.
 * Tries Local Proxy first, then cycles through Public Proxies.
 */
export const testConnection = async (apiKey: string, apiSecret: string): Promise<boolean> => {
  const cleanKey = apiKey.trim();
  const cleanSecret = apiSecret.trim();
  
  // 1. Try Local Proxy (Standard Header Auth)
  try {
    const authHeaders = {
      'Authorization': `${cleanKey}:${cleanSecret}`,
      'Accept': 'application/json'
    };
    await axios.get(getLocalUrl('?page=1&per_page=1'), { headers: authHeaders });
    return true;
  } catch (error: any) {
    // Only fallback if it's a "Network Error" (Proxy blocked) or 404 (Proxy missing)
    if (error.response?.status === 404 || error.message === 'Network Error' || error.code === 'ERR_NETWORK') {
       console.warn("Local proxy unavailable, attempting fallbacks...");
       return await testFallbacks(cleanKey, cleanSecret);
    }
    
    // If it's a legitimate 403/401 from the Local Proxy, fail immediately (invalid keys)
    if (error.response?.status === 403 || error.response?.status === 401) {
        throw new Error(`Invalid Credentials (Status ${error.response.status}). Please check your API Key/Secret.`);
    }
    throw error;
  }
};

const testFallbacks = async (apiKey: string, apiSecret: string): Promise<boolean> => {
  // Construct URL with Auth embedded (Robust for proxies)
  const queryAuth = `?api_key=${encodeURIComponent(apiKey)}&api_secret=${encodeURIComponent(apiSecret)}&page=1&per_page=1&_t=${Date.now()}`;
  const targetUrl = `${DIRECT_API}${queryAuth}`;
  const proxies = getFallbackUrls(targetUrl);

  for (const proxyUrl of proxies) {
    try {
      // No headers needed for this method, it's a simple GET
      await axios.get(proxyUrl);
      return true; // Success!
    } catch (e) {
      console.warn(`Proxy failed: ${proxyUrl}`, e);
      continue; // Try next proxy
    }
  }
  throw new Error("Connection failed. Could not reach JustCall via any proxy. Please check your internet connection.");
};

/**
 * Fetches calls from JustCall API.
 * Automatically selects the working connection method.
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
  const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

  // Step 1: Determine Strategy
  let activeStrategy: 'LOCAL' | 'PROXY_1' | 'PROXY_2' = 'LOCAL';
  
  // Quick check to see what works
  try {
     await axios.get(getLocalUrl('?page=1&per_page=1'), { 
        headers: { 'Authorization': `${cleanKey}:${cleanSecret}` } 
     });
     activeStrategy = 'LOCAL';
  } catch (e: any) {
     // If local fails, try Proxy 1
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
      // Base Params
      const baseParams = `&from=${startUnix}&to=${endUnix}&page=${page}&per_page=50&fetch_transcription=true`;
      
      let response;
      
      if (activeStrategy === 'LOCAL') {
         response = await axios.get(getLocalUrl(`?${baseParams}`), {
            headers: { 'Authorization': `${cleanKey}:${cleanSecret}`, 'Accept': 'application/json' }
         });
      } else {
         // Fallback Strategy: Embed Auth in URL
         const authParams = `?api_key=${encodeURIComponent(cleanKey)}&api_secret=${encodeURIComponent(cleanSecret)}`;
         const fullTarget = `${DIRECT_API}${authParams}${baseParams}`;
         
         const proxyUrl = activeStrategy === 'PROXY_1' 
            ? getFallbackUrls(fullTarget)[0] 
            : getFallbackUrls(fullTarget)[1];
            
         response = await axios.get(proxyUrl);
      }

      const data = response.data;
      
      // Handle different proxy response structures (sometimes wrapped in contents)
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
        await sleep(500); 
      }
    }
  } catch (error: any) {
    console.error("Fetch Error:", error);
    throw new Error("Failed to retrieve transcripts. Network blocked or Rate Limit reached.");
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
