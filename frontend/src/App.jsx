import { useState, useEffect } from 'react';
import axios from 'axios';
import { SignInButton, UserButton, useAuth } from "@clerk/react";

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';
const AVAILABLE_AGENTS = ["DataExtractor", "Analyst", "Reviewer"];

function App() {
  const [prompt, setPrompt] = useState('Generate Q3 Financial Report');
  const [selectedAgents, setSelectedAgents] = useState(AVAILABLE_AGENTS);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [history, setHistory] = useState([]);
  const [copied, setCopied] = useState(false);
  const [systemHealth, setSystemHealth] = useState({
    gateway: 'CHECKING',
    secureCore: 'CHECKING',
    aiEngine: 'CHECKING'
  });

  const { isLoaded, isSignedIn, getToken } = useAuth();

  const fetchHistory = async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/api/v1/enterprise/history`);
      setHistory(response.data);
    } catch (error) {
      console.error("Failed to fetch history:", error);
    }
  };

  useEffect(() => {
    if (!isSignedIn) return;
    let active = true;

    const loadInitialData = async () => {
      try {
        const [historyRes, healthRes] = await Promise.allSettled([
          axios.get(`${API_BASE_URL}/api/v1/enterprise/history`),
          axios.get(`${API_BASE_URL}/api/v1/system/health`)
        ]);

        if (!active) return;

        if (historyRes.status === 'fulfilled') {
          setHistory(historyRes.value.data);
        }
        if (healthRes.status === 'fulfilled') {
          setSystemHealth(healthRes.value.data);
        } else {
          setSystemHealth({ gateway: 'DOWN', secureCore: 'DOWN', aiEngine: 'DOWN' });
        }
      } catch (error) {
        console.error("Initialization error:", error);
      }
    };

    loadInitialData();

    const interval = setInterval(async () => {
      try {
        const res = await axios.get(`${API_BASE_URL}/api/v1/system/health`);
        if (active) setSystemHealth(res.data);
      } catch {
        if (active) setSystemHealth({ gateway: 'DOWN', secureCore: 'DOWN', aiEngine: 'DOWN' });
      }
    }, 30000);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [isSignedIn]);

  const toggleAgent = (agent) => {
    setSelectedAgents((prev) => {
      if (prev.includes(agent)) {
        return prev.length > 1 ? prev.filter((a) => a !== agent) : prev;
      }
      return [...prev, agent];
    });
  };

  const executeWorkflow = async () => {
    setLoading(true);
    setResult(null);
    const clientStart = performance.now();

    try {
      const token = await getToken();
      const response = await axios.post(`${API_BASE_URL}/api/v1/enterprise/process`, {
        task_id: `TASK-${Math.floor(Math.random() * 10000)}`,
        prompt: prompt,
        agents_involved: selectedAgents
      }, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      const fallbackTime = ((performance.now() - clientStart) / 1000).toFixed(2);
      setResult({
        ...response.data,
        execution_time_sec: response.data.execution_time_sec || fallbackTime
      });
      fetchHistory();
    } catch (error) {
      console.error("Pipeline Error:", error);
      setResult({ error: "Microservice Pipeline Failed. Security Token or Backend is down." });
    }
    setLoading(false);
  };

  const loadHistoryItem = (item) => {
    setPrompt(item.prompt);
    setResult({
      security_audit: {
        status: item.auditStatus,
        message: `Loaded from Neon DB (Task ID: ${item.taskId})`
      },
      ai_execution: item.aiOutput
    });
  };

  const deleteHistoryItem = async (e, id) => {
    e.stopPropagation();
    try {
      await axios.delete(`${API_BASE_URL}/api/v1/enterprise/history/${id}`);
      setHistory((prev) => prev.filter((item) => item.id !== id));
    } catch (error) {
      console.error("Failed to delete item:", error);
    }
  };

  const clearAllHistory = async () => {
    try {
      await axios.delete(`${API_BASE_URL}/api/v1/enterprise/history`);
      setHistory([]);
    } catch (error) {
      console.error("Failed to clear history:", error);
    }
  };

  const formatOutput = (output) => {
    if (!output) return "No output generated.";
    let text = output;

    if (typeof output === 'string') {
      try {
        const parsed = JSON.parse(output);
        if (Array.isArray(parsed)) {
          const textNode = parsed.find((item) => item.type === 'text');
          text = textNode ? textNode.text : JSON.stringify(parsed);
        } else if (typeof parsed === 'object' && parsed.text) {
          text = parsed.text;
        }
      } catch {
        text = output;
      }
    } else if (Array.isArray(output)) {
      const textNode = output.find((item) => item.type === 'text');
      text = textNode ? textNode.text : JSON.stringify(output);
    } else if (typeof output === 'object' && output.text) {
      text = output.text;
    }

    return String(text).replace(/\*\*/g, '').replace(/##+\s?/g, '');
  };

  const buildReportText = () => {
    if (!result?.ai_execution?.pipeline_trace) return "";
    const header =
      `ENTERPRISE AI WORKFORCE REPORT\n` +
      `Mission Objective: ${prompt}\n` +
      `Audit Status: ${result.security_audit?.status || 'SECURE_VERIFIED'}\n` +
      `Generated: ${new Date().toLocaleString()}\n` +
      `${'='.repeat(50)}\n\n`;

    const body = result.ai_execution.pipeline_trace
      .map((t) => `[${t.agent} - ${t.status}]\n${formatOutput(t.output)}\n`)
      .join('\n');

    return header + body;
  };

  const handleCopyReport = () => {
    navigator.clipboard.writeText(buildReportText());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadReport = () => {
    const blob = new Blob([buildReportText()], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `AI-Workforce-Report-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const renderStatusDot = (status) => {
    if (status === 'UP') return 'bg-emerald-400 shadow-[0_0_8px_#34d399]';
    if (status === 'DOWN') return 'bg-red-500 shadow-[0_0_8px_#ef4444]';
    return 'bg-amber-400 animate-pulse';
  };

  if (!isLoaded) {
    return (
      <div className="min-h-screen bg-gray-950 text-gray-400 flex items-center justify-center font-mono">
        Initializing Security Layer...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-6 md:p-8 font-sans selection:bg-indigo-500 selection:text-white">
      {!isSignedIn ? (
        <div className="flex flex-col items-center justify-center min-h-[80vh]">
          <h1 className="text-5xl font-extrabold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-cyan-400 mb-4 text-center">
            Enterprise AI Workforce
          </h1>
          <p className="text-gray-400 text-lg mb-8">Secure Access Required. Please authenticate.</p>
          <div className="bg-indigo-600 hover:bg-indigo-500 transition-colors px-6 py-3 rounded-lg font-bold cursor-pointer">
            <SignInButton mode="modal" />
          </div>
        </div>
      ) : (
        <div className="max-w-6xl mx-auto">
          <header className="mb-8 border-b border-gray-800 pb-6 flex flex-col md:flex-row md:justify-between md:items-center gap-4">
            <div>
              <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-cyan-400">
                Enterprise AI Workforce
              </h1>
              <p className="text-gray-500 mt-1.5 text-xs font-mono">NODE GATEWAY ➔ SPRING SECURE CORE ➔ PYTHON AI ENGINE</p>
            </div>

            <div className="flex items-center gap-4 flex-wrap">
              {/* Live Microservice Health Bar */}
              <div className="flex items-center gap-3 bg-gray-900 border border-gray-800 px-3.5 py-2 rounded-lg text-[11px] font-mono">
                <span className="flex items-center gap-1.5 text-gray-300">
                  <span className={`w-2 h-2 rounded-full ${renderStatusDot(systemHealth.gateway)}`}></span>
                  Gateway
                </span>
                <span className="text-gray-700">|</span>
                <span className="flex items-center gap-1.5 text-gray-300">
                  <span className={`w-2 h-2 rounded-full ${renderStatusDot(systemHealth.secureCore)}`}></span>
                  Spring Core
                </span>
                <span className="text-gray-700">|</span>
                <span className="flex items-center gap-1.5 text-gray-300">
                  <span className={`w-2 h-2 rounded-full ${renderStatusDot(systemHealth.aiEngine)}`}></span>
                  AI Engine
                </span>
              </div>
              <UserButton />
            </div>
          </header>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-1 space-y-6">
              {/* Task Deployment Box */}
              <div className="bg-gray-900 p-6 rounded-xl border border-gray-800 shadow-2xl h-fit">
                <h2 className="text-lg font-semibold mb-4 text-gray-200">Task Deployment</h2>
                <label className="block text-xs font-bold mb-2 text-gray-500 uppercase tracking-wider">Mission Objective</label>
                <textarea 
                  className="w-full bg-gray-950 border border-gray-800 rounded-lg p-4 text-gray-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 mb-4 transition-all resize-none text-sm"
                  rows="4"
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                />

                {/* Selectable Agents */}
                <label className="block text-xs font-bold mb-2 text-gray-500 uppercase tracking-wider">Active Agents</label>
                <div className="flex flex-wrap gap-2 mb-6">
                  {AVAILABLE_AGENTS.map((agent) => {
                    const active = selectedAgents.includes(agent);
                    return (
                      <button
                        key={agent}
                        type="button"
                        onClick={() => toggleAgent(agent)}
                        className={`px-2.5 py-1 rounded-md text-xs font-mono border transition-all cursor-pointer ${
                          active
                            ? 'bg-indigo-600/20 text-indigo-300 border-indigo-500/60'
                            : 'bg-gray-950 text-gray-500 border-gray-800 hover:border-gray-700'
                        }`}
                      >
                        {active ? '✓ ' : '+ '}{agent}
                      </button>
                    );
                  })}
                </div>

                <button 
                  onClick={executeWorkflow}
                  disabled={loading}
                  className={`w-full py-3 rounded-lg text-sm font-bold uppercase tracking-wider transition-all cursor-pointer ${loading ? 'bg-indigo-900 cursor-not-allowed opacity-50' : 'bg-indigo-600 hover:bg-indigo-500 hover:shadow-lg hover:shadow-indigo-500/20'}`}
                >
                  {loading ? 'Executing Pipeline...' : 'Deploy AI Agents'}
                </button>
              </div>

              {/* Neon DB History Box */}
              <div className="bg-gray-900 p-6 rounded-xl border border-gray-800 shadow-2xl">
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-sm font-semibold text-gray-200 uppercase tracking-wider">Mission History</h2>
                  <div className="flex items-center gap-2">
                    {history.length > 0 && (
                      <button
                        onClick={clearAllHistory}
                        className="text-[10px] font-mono text-red-400 hover:text-red-300 bg-red-950/50 hover:bg-red-900/50 px-2 py-0.5 rounded border border-red-800/50 transition-colors cursor-pointer"
                      >
                        CLEAR ALL
                      </button>
                    )}
                    <span className="text-[10px] font-mono text-cyan-400 bg-cyan-950 px-2 py-0.5 rounded border border-cyan-800">
                      NEON DB
                    </span>
                  </div>
                </div>
                {history.length === 0 ? (
                  <p className="text-xs text-gray-500 font-mono">No past missions logged yet.</p>
                ) : (
                  <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                    {history.map((item) => (
                      <div
                        key={item.id}
                        onClick={() => loadHistoryItem(item)}
                        className="w-full text-left bg-gray-950 hover:bg-gray-800 border border-gray-800 p-3 rounded-lg transition-colors cursor-pointer group flex justify-between items-start gap-2"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-xs text-gray-200 font-medium truncate">{item.prompt}</p>
                          <div className="flex justify-between items-center mt-1.5">
                            <span className="text-[10px] font-mono text-gray-500">{item.taskId}</span>
                            <span className="text-[10px] font-mono text-emerald-400">{item.auditStatus}</span>
                          </div>
                        </div>
                        <button
                          onClick={(e) => deleteHistoryItem(e, item.id)}
                          title="Delete task"
                          className="text-gray-600 hover:text-red-400 text-xs font-bold px-1.5 py-0.5 rounded hover:bg-red-950/40 transition-colors shrink-0 cursor-pointer"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="lg:col-span-2 space-y-6">
              {result?.error && (
                <div className="bg-red-900/20 border border-red-500/50 text-red-400 p-4 rounded-xl text-sm">
                  {result.error}
                </div>
              )}

              {loading && (
                <div className="space-y-6 animate-pulse">
                  <div className="bg-gray-900 p-6 rounded-xl border border-gray-800 shadow-xl flex items-center justify-between">
                    <div className="space-y-3">
                      <div className="h-4 w-40 bg-gray-800 rounded"></div>
                      <div className="h-3 w-64 bg-gray-800 rounded"></div>
                    </div>
                    <div className="h-6 w-24 bg-gray-800 rounded-full"></div>
                  </div>

                  <div className="bg-gray-900 p-6 rounded-xl border border-gray-800 shadow-xl">
                    <div className="h-4 w-48 bg-gray-800 rounded mb-6"></div>
                    <div className="space-y-4">
                      {selectedAgents.map((skeleton) => (
                        <div key={skeleton} className="bg-gray-950 border border-gray-800 p-4 rounded-lg flex items-start justify-between">
                          <div className="w-full mr-4">
                            <div className="h-4 w-32 bg-gray-800 rounded mb-3"></div>
                            <div className="space-y-2">
                              <div className="h-2 w-full bg-gray-800 rounded"></div>
                              <div className="h-2 w-5/6 bg-gray-800 rounded"></div>
                            </div>
                          </div>
                          <div className="h-5 w-16 bg-gray-800 rounded mt-1"></div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {!loading && result && !result.error && (
                <>
                  <div className="bg-gray-900 p-6 rounded-xl border border-gray-800 shadow-xl flex items-center justify-between flex-wrap gap-3">
                    <div>
                      <h3 className="text-gray-400 text-sm">Security Audit (Spring Boot)</h3>
                      <p className="text-emerald-400 font-mono text-xs mt-1">
                        {result.security_audit?.message || "Task audited and verified by Spring Boot Core"}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {result.execution_time_sec && (
                        <span className="bg-gray-950 text-cyan-400 border border-gray-800 px-3 py-1 rounded-full text-xs font-mono">
                          ⚡ {result.execution_time_sec}s
                        </span>
                      )}
                      <span className="bg-emerald-900/30 text-emerald-400 border border-emerald-500/30 px-3 py-1 rounded-full text-xs font-bold tracking-wider">
                        {result.security_audit?.status || "SECURE_VERIFIED"}
                      </span>
                    </div>
                  </div>

                  <div className="bg-gray-900 p-6 rounded-xl border border-gray-800 shadow-xl">
                    <div className="flex justify-between items-center mb-4">
                      <h3 className="text-gray-400 text-sm">AI Engine Trace (Python)</h3>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={handleCopyReport}
                          className="text-xs font-mono bg-gray-950 hover:bg-gray-800 text-gray-300 border border-gray-700 px-3 py-1 rounded-md transition-colors cursor-pointer"
                        >
                          {copied ? '✓ Copied' : 'Copy'}
                        </button>
                        <button
                          onClick={handleDownloadReport}
                          className="text-xs font-mono bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/40 px-3 py-1 rounded-md transition-colors cursor-pointer"
                        >
                          ↓ Export .TXT
                        </button>
                      </div>
                    </div>

                    <div className="space-y-4">
                      {result.ai_execution?.pipeline_trace?.map((trace, index) => (
                        <div key={index} className="bg-gray-950 border border-gray-800 p-4 rounded-lg flex items-start justify-between gap-4">
                          <div>
                            <p className="text-indigo-400 font-bold text-sm">{trace.agent}</p>
                            <p className="text-gray-300 text-xs mt-2 leading-relaxed">{formatOutput(trace.output)}</p>
                          </div>
                          <span className={`px-2 py-1 rounded text-[10px] font-bold tracking-wider shrink-0 mt-1 border ${
                            trace.status === 'COMPLETED'
                              ? 'bg-emerald-900/30 text-emerald-400 border-emerald-500/30'
                              : 'bg-red-900/30 text-red-400 border-red-500/30'
                          }`}>
                            {trace.status}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;