import React from 'react';
import { MockTranscript } from '../types';
import { Clock, Search, History, Calendar, FileText } from 'lucide-react';

// Hardcoded mock data to simulate what the user would see after integration
const MOCK_DATA: MockTranscript[] = [
  {
    id: "call_987234",
    caller: "+1 (555) 123-4567",
    duration: "4m 32s",
    status: "Completed",
    timestamp: "2024-05-20 14:30:00",
    sentiment: "Positive",
    transcript: "Agent: Thank you for calling JustCall support. How can I help? \nCustomer: Hi, I'm trying to figure out how to export my call logs via API. \nAgent: I can certainly help with that. Have you checked our developer docs at docs.justcall.io? \nCustomer: Not yet, I was looking for a direct link. \nAgent: No problem, I'll email you the specific endpoint documentation right now."
  },
  {
    id: "call_987235",
    caller: "+1 (555) 987-6543",
    duration: "1m 15s",
    status: "Missed",
    timestamp: "2024-05-20 15:15:00",
    sentiment: "Neutral",
    transcript: "[No Transcript Available - Call Missed]"
  },
  {
    id: "call_987236",
    caller: "+1 (555) 234-5678",
    duration: "8m 45s",
    status: "Completed",
    timestamp: "2024-05-20 16:00:00",
    sentiment: "Negative",
    transcript: "Agent: Hello. \nCustomer: This is the third time I'm calling about the billing issue. It's still not resolved. \nAgent: I apologize for the inconvenience. Let me pull up your account immediately. \nCustomer: Please do, I'm very frustrated."
  }
];

export const MockDashboard: React.FC = () => {
  const [selectedCall, setSelectedCall] = React.useState<MockTranscript>(MOCK_DATA[0]);

  return (
    <div className="h-full flex flex-col space-y-6">
      <div className="bg-slate-800 p-6 rounded-xl border border-slate-700">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h2 className="text-xl font-semibold text-slate-100 flex items-center">
              <History className="w-5 h-5 mr-2 text-purple-400" />
              Historical Data Viewer
            </h2>
            <p className="text-xs text-slate-400 mt-1">Preview of retrieved past transcripts</p>
          </div>
          <span className="text-xs bg-purple-900/30 text-purple-300 px-3 py-1.5 rounded-full border border-purple-700/50 font-medium">
            Read-Only Preview
          </span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-[600px]">
          
          {/* List of calls */}
          <div className="lg:col-span-1 bg-slate-900/50 rounded-lg border border-slate-700 overflow-hidden flex flex-col">
            <div className="p-3 border-b border-slate-700 bg-slate-900 flex flex-col gap-2">
               <div className="flex items-center text-xs text-slate-400 bg-slate-800 p-2 rounded">
                 <Calendar className="w-3 h-3 mr-2" />
                 <span>Range: Last 30 Days</span>
               </div>
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-500" />
                <input 
                  type="text" 
                  placeholder="Search past logs..." 
                  className="w-full bg-slate-800 border-none rounded-md py-2 pl-9 pr-4 text-sm text-slate-200 placeholder-slate-500 focus:ring-1 focus:ring-purple-500"
                />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto">
              {MOCK_DATA.map((call) => (
                <div 
                  key={call.id}
                  onClick={() => setSelectedCall(call)}
                  className={`p-4 border-b border-slate-700/50 cursor-pointer hover:bg-slate-800 transition-colors ${selectedCall.id === call.id ? 'bg-purple-900/20 border-l-2 border-l-purple-500' : 'border-l-2 border-l-transparent'}`}
                >
                  <div className="flex justify-between items-start mb-1">
                    <span className="font-medium text-slate-200 text-sm">{call.caller}</span>
                    <span className={`text-xs px-1.5 py-0.5 rounded ${
                      call.sentiment === 'Positive' ? 'bg-green-900/30 text-green-400' :
                      call.sentiment === 'Negative' ? 'bg-red-900/30 text-red-400' : 'bg-slate-700 text-slate-400'
                    }`}>
                      {call.sentiment}
                    </span>
                  </div>
                  <div className="flex items-center text-xs text-slate-500 space-x-3">
                    <span className="flex items-center"><Clock className="w-3 h-3 mr-1" /> {call.duration}</span>
                    <span>{call.timestamp.split(' ')[1]}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Transcript View */}
          <div className="lg:col-span-2 bg-slate-900 rounded-lg border border-slate-700 flex flex-col overflow-hidden">
            <div className="p-4 border-b border-slate-700 flex justify-between items-center bg-slate-800/30">
              <div>
                <h3 className="font-semibold text-slate-200 flex items-center">
                    <FileText className="w-4 h-4 mr-2 text-slate-400" />
                    Transcript Content
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">ID: {selectedCall.id} • {selectedCall.timestamp}</p>
              </div>
              <div className="flex space-x-2">
                 <button className="text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 px-3 py-1.5 rounded border border-slate-600 transition-colors">
                   Download JSON
                 </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {selectedCall.transcript.split('\n').map((line, idx) => {
                const isAgent = line.startsWith('Agent:');
                return (
                  <div key={idx} className={`flex ${isAgent ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[80%] rounded-2xl px-5 py-3 text-sm leading-relaxed ${
                      isAgent 
                        ? 'bg-purple-600 text-white rounded-br-none' 
                        : 'bg-slate-800 text-slate-300 rounded-bl-none border border-slate-700'
                    }`}>
                      <span className="block text-xs opacity-70 mb-1 font-bold uppercase tracking-wider">
                        {isAgent ? 'Agent' : 'Customer'}
                      </span>
                      {line.replace(/^(Agent:|Customer:)\s*/, '')}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
};