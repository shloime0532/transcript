
import React, { useState, useEffect } from 'react';
import { Settings, Key, Calendar, ArrowRight, Loader2, CheckCircle, Shield, RefreshCw, Lock, AlertCircle, HelpCircle } from 'lucide-react';
import { testConnection } from '../services/justcall';

interface ExtractorBuilderProps {
  onBuild: (config: { apiKey: string; apiSecret: string; startDate: string; endDate: string }) => void;
  isBuilding: boolean;
}

export const ExtractorBuilder: React.FC<ExtractorBuilderProps> = ({ onBuild, isBuilding }) => {
  const [apiKey, setApiKey] = useState('');
  const [apiSecret, setApiSecret] = useState('');
  const [startDate, setStartDate] = useState('2024-01-01');
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
  
  const [isConfigured, setIsConfigured] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [configError, setConfigError] = useState<string | null>(null);

  // Load saved credentials on mount
  useEffect(() => {
    const savedKey = localStorage.getItem('jc_api_key');
    const savedSecret = localStorage.getItem('jc_api_secret');
    
    if (savedKey && savedSecret) {
      setApiKey(savedKey);
      setApiSecret(savedSecret);
      setIsConfigured(true);
    }
  }, []);

  const handleTestAndSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setConfigError(null);
    setIsTesting(true);

    const cleanKey = apiKey.trim();
    const cleanSecret = apiSecret.trim();

    if (!cleanKey || !cleanSecret) {
        setConfigError("Please enter both API Key and Secret.");
        setIsTesting(false);
        return;
    }

    try {
        await testConnection(cleanKey, cleanSecret);
        // If we get here, it succeeded (testConnection throws if it fails)
        localStorage.setItem('jc_api_key', cleanKey);
        localStorage.setItem('jc_api_secret', cleanSecret);
        setApiKey(cleanKey); 
        setApiSecret(cleanSecret);
        setIsConfigured(true);
    } catch (err: any) {
        console.error(err);
        setConfigError(err.message || "Connection failed. Please check your keys.");
    } finally {
        setIsTesting(false);
    }
  };

  const handleRunExtraction = (e: React.FormEvent) => {
    e.preventDefault();
    onBuild({ apiKey, apiSecret, startDate, endDate });
  };

  const resetConfig = () => {
    if(window.confirm("Disconnect from backend? You will need to re-enter your keys.")) {
      localStorage.removeItem('jc_api_key');
      localStorage.removeItem('jc_api_secret');
      setApiKey('');
      setApiSecret('');
      setIsConfigured(false);
      setConfigError(null);
    }
  };

  // VIEW 1: Initial Setup ("Backend Config")
  if (!isConfigured) {
    return (
      <div className="bg-slate-800 rounded-xl border border-slate-700 shadow-xl overflow-hidden">
        <div className="p-5 border-b border-slate-700 bg-slate-900/50">
          <h3 className="font-semibold text-white flex items-center">
            <Shield className="w-4 h-4 mr-2 text-blue-400" />
            Backend Configuration
          </h3>
          <p className="text-xs text-slate-400 mt-1">
            Enter your JustCall API credentials. We will verify them before saving.
          </p>
        </div>
        
        <form onSubmit={handleTestAndSave} className="p-6 space-y-6">
          <div className="space-y-4">
            <div>
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-2">API Key</label>
              <div className="relative">
                <Key className="w-4 h-4 absolute left-3 top-3 text-slate-500" />
                <input 
                  type="text" 
                  required
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="e.g. 15829..."
                  className="w-full bg-slate-900 border border-slate-600 rounded-lg py-2.5 pl-10 pr-4 text-sm text-white focus:ring-2 focus:ring-blue-500 outline-none font-mono"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-2">API Secret</label>
              <div className="relative">
                <Lock className="w-4 h-4 absolute left-3 top-3 text-slate-500" />
                <input 
                  type="password" 
                  required
                  value={apiSecret}
                  onChange={(e) => setApiSecret(e.target.value)}
                  placeholder="••••••••••••••••"
                  className="w-full bg-slate-900 border border-slate-600 rounded-lg py-2.5 pl-10 pr-4 text-sm text-white focus:ring-2 focus:ring-blue-500 outline-none font-mono"
                />
              </div>
            </div>
          </div>

          {configError && (
              <div className="p-3 bg-red-900/30 border border-red-800/50 rounded flex flex-col gap-1">
                  <div className="flex items-start text-xs text-red-300">
                    <AlertCircle className="w-4 h-4 mr-2 flex-shrink-0 mt-0.5" />
                    <span className="font-bold">{configError}</span>
                  </div>
                  {configError.includes('Network Error') && (
                      <div className="ml-6 text-[10px] text-red-400/80">
                        Tip: "Network Error" often means a browser extension (AdBlocker, Privacy Badger) is blocking the connection to the proxy. Try disabling them for this page.
                      </div>
                  )}
                  {configError.includes('403') && (
                      <div className="ml-6 text-[10px] text-red-400/80">
                        Tip: If keys are correct, check if "IP Access Control" is enabled in JustCall settings.
                      </div>
                  )}
              </div>
          )}

          <button
            type="submit"
            disabled={isTesting}
            className={`w-full py-3 rounded-lg font-bold text-sm transition-all shadow-lg flex justify-center items-center ${
                isTesting 
                ? 'bg-slate-700 text-slate-400 cursor-not-allowed' 
                : 'bg-blue-600 hover:bg-blue-500 text-white'
            }`}
          >
            {isTesting ? (
                <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Verifying Credentials...
                </>
            ) : (
                "Save & Connect"
            )}
          </button>
        </form>
      </div>
    );
  }

  // VIEW 2: The Tool (Keys are hidden "in the back")
  return (
    <div className="bg-slate-800 rounded-xl border border-slate-700 shadow-xl overflow-hidden">
      <div className="p-5 border-b border-slate-700 bg-slate-800/50 flex justify-between items-center">
        <div>
          <h3 className="font-semibold text-white flex items-center">
            <Settings className="w-4 h-4 mr-2 text-green-400" />
            Extraction Parameters
          </h3>
        </div>
        <div className="flex items-center space-x-3">
          <div className="flex items-center px-2 py-1 bg-green-900/30 border border-green-800 rounded text-xs text-green-400 font-medium">
            <CheckCircle className="w-3 h-3 mr-1.5" />
            Backend Active
          </div>
          <button onClick={resetConfig} title="Reset Connection" className="text-slate-500 hover:text-slate-300">
            <RefreshCw className="w-3 h-3" />
          </button>
        </div>
      </div>
      
      <form onSubmit={handleRunExtraction} className="p-6 space-y-6">
        {/* Date Range Only - Keys are hidden */}
        <div className="space-y-4">
          <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block">Target Date Range</label>
          <div className="grid grid-cols-2 gap-4">
            <div className="relative">
                <Calendar className="w-4 h-4 absolute left-3 top-3 text-slate-500" />
                <input 
                    type="date" 
                    required
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-600 rounded-lg py-2.5 pl-10 pr-2 text-sm text-white focus:ring-2 focus:ring-blue-500 outline-none"
                />
            </div>
            <div className="relative">
                <Calendar className="w-4 h-4 absolute left-3 top-3 text-slate-500" />
                <input 
                    type="date" 
                    required
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-600 rounded-lg py-2.5 pl-10 pr-2 text-sm text-white focus:ring-2 focus:ring-blue-500 outline-none"
                />
            </div>
          </div>
        </div>

        <div className="pt-2">
          <button
            type="submit"
            disabled={isBuilding}
            className={`w-full flex items-center justify-center py-3 rounded-lg font-bold text-sm transition-all ${
              isBuilding
                ? 'bg-slate-700 text-slate-400 cursor-not-allowed'
                : 'bg-green-600 hover:bg-green-500 text-white shadow-lg hover:shadow-green-500/25'
            }`}
          >
            {isBuilding ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Fetching Data...
              </>
            ) : (
              <>
                Fetch Transcripts
                <ArrowRight className="w-4 h-4 ml-2" />
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
};
