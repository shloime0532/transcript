
import React from 'react';
import { Download, FileText, Table, AlertCircle } from 'lucide-react';
import { TranscriptData } from '../services/justcall';

interface ResultsViewerProps {
  transcripts: TranscriptData[];
  loading: boolean;
  count: number;
  onDownload: () => void;
}

export const ResultsViewer: React.FC<ResultsViewerProps> = ({ transcripts, loading, count, onDownload }) => {
  
  if (loading) {
    return (
      <div className="h-full flex flex-col items-center justify-center space-y-4 bg-slate-900 rounded-xl border border-slate-800">
        <div className="w-12 h-12 border-4 border-blue-500/30 border-t-blue-500 rounded-full animate-spin"></div>
        <div className="text-center">
            <p className="text-white font-medium text-lg">Extracting Data...</p>
            <p className="text-slate-400 text-sm mt-1">Transcripts found so far: <span className="text-blue-400 font-bold">{count}</span></p>
        </div>
      </div>
    );
  }

  if (transcripts.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-slate-600 space-y-4 bg-slate-900 rounded-xl border border-slate-800">
        <div className="p-4 bg-slate-800 rounded-full border border-slate-700">
            <Table className="w-8 h-8 opacity-50" />
        </div>
        <p className="text-sm">No data loaded. Configure credentials and date range to begin.</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-slate-900 rounded-xl border border-slate-800 overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-900">
        <div className="flex items-center space-x-2">
            <div className="bg-green-900/20 p-1.5 rounded text-green-400">
                <FileText className="w-4 h-4" />
            </div>
            <div>
                <h3 className="text-sm font-bold text-white">Extraction Results</h3>
                <p className="text-xs text-slate-500">{transcripts.length} records found</p>
            </div>
        </div>
        <button
            onClick={onDownload}
            className="flex items-center space-x-2 text-xs font-bold px-4 py-2 rounded-md bg-blue-600 hover:bg-blue-500 text-white transition-colors shadow-lg shadow-blue-900/20"
        >
            <Download className="w-3 h-3" />
            <span>Export CSV</span>
        </button>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto custom-scrollbar">
        <table className="w-full text-left text-sm text-slate-400">
            <thead className="bg-slate-800/50 text-xs uppercase font-medium text-slate-500 sticky top-0 backdrop-blur-sm">
                <tr>
                    <th className="px-4 py-3 w-32">Date</th>
                    <th className="px-4 py-3 w-32">From</th>
                    <th className="px-4 py-3 w-32">To</th>
                    <th className="px-4 py-3 w-24">Duration</th>
                    <th className="px-4 py-3">Transcript Preview</th>
                </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
                {transcripts.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-800/30 transition-colors">
                        <td className="px-4 py-3 whitespace-nowrap text-slate-300">{item.datetime.split(' ')[0]}</td>
                        <td className="px-4 py-3 whitespace-nowrap">{item.from}</td>
                        <td className="px-4 py-3 whitespace-nowrap">{item.to}</td>
                        <td className="px-4 py-3 whitespace-nowrap">{item.duration}s</td>
                        <td className="px-4 py-3">
                            <div className="line-clamp-2 text-xs text-slate-500 italic">
                                {item.transcript}
                            </div>
                        </td>
                    </tr>
                ))}
            </tbody>
        </table>
      </div>
      
      <div className="p-2 bg-slate-950 border-t border-slate-800 text-center">
        <p className="text-[10px] text-slate-600">
            Data is held in browser memory. Refreshing the page will clear the table.
        </p>
      </div>
    </div>
  );
};
