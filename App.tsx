
import React, { useState } from 'react';
import { ExtractorBuilder } from './components/ExtractorBuilder';
import { ResultsViewer } from './components/ResultsViewer';
import { fetchJustCallTranscripts, convertToCSV, TranscriptData } from './services/justcall';
import { AppState } from './types';
import { Database, ShieldCheck } from 'lucide-react';

const App: React.FC = () => {
  const [appState, setAppState] = useState<AppState>(AppState.IDLE);
  const [transcripts, setTranscripts] = useState<TranscriptData[]>([]);
  const [count, setCount] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const handleFetchRequest = async (config: { apiKey: string; apiSecret: string; startDate: string; endDate: string }) => {
    setAppState(AppState.RESEARCHING); // Using RESEARCHING as "Loading" state
    setTranscripts([]);
    setCount(0);
    setError(null);

    try {
      const data = await fetchJustCallTranscripts(config, (currentCount) => {
        setCount(currentCount);
      });
      
      setTranscripts(data);
      setAppState(AppState.COMPLETE);
      
      if (data.length === 0) {
        setError("Connection successful, but no transcripts were found in this date range. Try expanding your search dates.");
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Failed to fetch data. Please check your credentials.");
      setAppState(AppState.ERROR);
    }
  };

  const handleDownload = () => {
    if (transcripts.length === 0) return;
    const csvContent = convertToCSV(transcripts);
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `justcall_transcripts_${new Date().toISOString().slice(0,10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#0b1120] text-slate-100 font-sans">
      
      {/* Minimal Header */}
      <header className="border-b border-slate-800 bg-slate-900/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="bg-blue-600 p-2 rounded-lg shadow-lg shadow-blue-900/20">
              <Database className="w-5 h-5 text-white" />
            </div>
            <h1 className="font-bold text-lg tracking-tight text-white">JustCall <span className="text-blue-400">Transcript Exporter</span></h1>
          </div>
          <div className="flex items-center space-x-2 text-xs font-medium text-emerald-400 bg-emerald-900/20 px-3 py-1 rounded-full border border-emerald-800/50">
            <ShieldCheck className="w-3 h-3" />
            <span>Secure Environment</span>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-6 py-10">
        
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 h-full">
          
          {/* Left Column: Configuration */}
          <div className="lg:col-span-4 space-y-6">
            <div className="prose prose-invert">
                <h2 className="text-2xl font-bold mb-2">Fetch Data</h2>
                <p className="text-slate-400 text-sm">
                    Configure your backend connection once, then pull historical transcripts on demand.
                </p>
            </div>
            
            <ExtractorBuilder 
                onBuild={handleFetchRequest} 
                isBuilding={appState === AppState.RESEARCHING} 
            />

            {error && (
                <div className="p-4 bg-red-900/20 border border-red-800 text-red-200 rounded-lg text-sm shadow-sm">
                    <div className="flex items-center mb-2 font-bold">
                        <span className="mr-2">⚠️</span>
                        <span>Connection Error</span>
                    </div>
                    <p className="opacity-90 leading-relaxed">{error}</p>
                </div>
            )}
          </div>

          {/* Right Column: Results */}
          <div className="lg:col-span-8 flex flex-col h-[600px] lg:h-[700px]">
             <ResultsViewer 
                transcripts={transcripts} 
                loading={appState === AppState.RESEARCHING}
                count={count}
                onDownload={handleDownload}
             />
          </div>

        </div>
      </main>
    </div>
  );
};

export default App;
