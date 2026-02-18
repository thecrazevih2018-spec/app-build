
import React, { useState, useRef, useEffect } from 'react';
import { GradeLevel, Message, AppState, ChatSession, AppMode } from './types';
import { CameraIcon, SendIcon, UploadIcon, BrainIcon, TrashIcon, XIcon, MicIcon, StopIcon, SunIcon, MoonIcon, DownloadIcon, HistoryIcon, PlusIcon, CrownIcon, SparklesIcon, BookOpenIcon, CreditCardIcon, CheckCircleIcon, LockIcon, ShieldCheckIcon, SmartphoneIcon, QrCodeIcon } from './components/Icons';
import { solveProblem, generateVisualAid } from './services/gemini';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';

const App: React.FC = () => {
  const [state, setState] = useState<AppState>(() => {
    const savedUsage = localStorage.getItem('snapsolve_usage');
    const today = new Date().toDateString();
    let initialUsage = 0;
    let initialLastDate = today;

    if (savedUsage) {
      const parsed = JSON.parse(savedUsage);
      if (parsed.lastUsageDate === today) {
        initialUsage = parsed.dailyUsageCount;
      }
    }

    return {
      gradeLevel: GradeLevel.HIGH_SCHOOL,
      messages: [],
      isLoading: false,
      error: null,
      currentSessionId: null,
      isPro: localStorage.getItem('snapsolve_pro') === 'true',
      dailyUsageCount: initialUsage,
      lastUsageDate: initialLastDate,
      currentMode: AppMode.NORMAL
    };
  });

  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [inputText, setInputText] = useState('');
  const [selectedMedia, setSelectedMedia] = useState<{ data: string; mimeType: string } | null>(null);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [showPaymentGateway, setShowPaymentGateway] = useState(false);
  const [paymentStep, setPaymentStep] = useState<'details' | 'processing' | 'success'>('details');
  const [paymentMethod, setPaymentMethod] = useState<'card' | 'upi'>('card');
  const [isDarkMode, setIsDarkMode] = useState(() => {
    const saved = localStorage.getItem('theme');
    if (saved) return saved === 'dark';
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  });
  const [isExporting, setIsExporting] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    const savedSessions = localStorage.getItem('snapsolve_sessions');
    if (savedSessions) {
      try {
        const parsed = JSON.parse(savedSessions);
        const cleaned = parsed.map((s: any) => ({
          ...s,
          lastUpdated: new Date(s.lastUpdated),
          messages: s.messages.map((m: any) => ({ ...m, timestamp: new Date(m.timestamp) }))
        }));
        setSessions(cleaned);
      } catch (err) {
        console.error("Failed to load sessions", err);
      }
    }
    startNewChat();
  }, []);

  useEffect(() => {
    localStorage.setItem('snapsolve_sessions', JSON.stringify(sessions));
  }, [sessions]);

  useEffect(() => {
    localStorage.setItem('snapsolve_pro', String(state.isPro));
    localStorage.setItem('snapsolve_usage', JSON.stringify({
      dailyUsageCount: state.dailyUsageCount,
      lastUsageDate: state.lastUsageDate
    }));
  }, [state.isPro, state.dailyUsageCount, state.lastUsageDate]);

  useEffect(() => {
    if (!state.currentSessionId || state.messages.length === 0) return;

    setSessions(prev => {
      const idx = prev.findIndex(s => s.id === state.currentSessionId);
      const userMsg = state.messages.find(m => m.role === 'user');
      const titleSnippet = userMsg?.content.slice(0, 30) || "New Conversation";
      
      const updatedSession: ChatSession = {
        id: state.currentSessionId!,
        title: titleSnippet.length > 29 ? titleSnippet + '...' : titleSnippet,
        gradeLevel: state.gradeLevel,
        messages: state.messages,
        lastUpdated: new Date()
      };

      if (idx > -1) {
        const next = [...prev];
        next[idx] = updatedSession;
        return next.sort((a, b) => b.lastUpdated.getTime() - a.lastUpdated.getTime());
      } else {
        return [updatedSession, ...prev].sort((a, b) => b.lastUpdated.getTime() - a.lastUpdated.getTime());
      }
    });
  }, [state.messages, state.currentSessionId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [state.messages]);

  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  }, [isDarkMode]);

  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = false;
      recognitionRef.current.onresult = (event: any) => {
        setInputText(prev => prev + (prev ? ' ' : '') + event.results[0][0].transcript);
        setIsListening(false);
      };
      recognitionRef.current.onend = () => setIsListening(false);
    }
  }, []);

  const startNewChat = () => {
    const newId = Date.now().toString();
    setState(prev => ({
      ...prev,
      messages: [],
      currentSessionId: newId,
      error: null,
      isLoading: false
    }));
    setIsSidebarOpen(false);
  };

  const loadSession = (session: ChatSession) => {
    setState(prev => ({
      ...prev,
      gradeLevel: session.gradeLevel,
      messages: session.messages,
      isLoading: false,
      error: null,
      currentSessionId: session.id
    }));
    setIsSidebarOpen(false);
  };

  const deleteSession = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setSessions(prev => prev.filter(s => s.id !== id));
    if (state.currentSessionId === id) {
      startNewChat();
    }
  };

  const handleUpgradeClick = () => {
    setShowUpgradeModal(false);
    setShowPaymentGateway(true);
    setPaymentStep('details');
  };

  const handleProcessPayment = () => {
    setPaymentStep('processing');
    setTimeout(() => {
      setPaymentStep('success');
      setState(prev => ({ ...prev, isPro: true }));
    }, 2500);
  };

  const handleClosePayment = () => {
    setShowPaymentGateway(false);
    setPaymentStep('details');
  };

  const closeCurrentChat = () => {
    setState(prev => ({ ...prev, messages: [], currentSessionId: Date.now().toString() }));
  };

  const handleSendMessage = async () => {
    if (!inputText.trim() && !selectedMedia) return;

    const today = new Date().toDateString();
    if (!state.isPro && state.dailyUsageCount >= 3) {
      setShowUpgradeModal(true);
      return;
    }

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: inputText || "Analyze this document.",
      image: selectedMedia?.mimeType.startsWith('image/') ? selectedMedia.data : undefined,
      timestamp: new Date(),
    };

    setState(prev => ({ 
      ...prev, 
      messages: [...prev.messages, userMessage], 
      isLoading: true, 
      error: null,
      dailyUsageCount: prev.lastUsageDate === today ? prev.dailyUsageCount + 1 : 1,
      lastUsageDate: today
    }));

    const currentInput = inputText;
    const currentMedia = selectedMedia;
    const currentMode = state.currentMode;
    const isPro = state.isPro;
    
    setInputText('');
    setSelectedMedia(null);

    try {
      const response = await solveProblem(currentInput, state.gradeLevel, state.messages, currentMode, isPro, currentMedia || undefined);
      
      const visualAidPrompts: string[] = [];
      const vaMatch = response.match(/=== VISUAL AID PROMPTS ===([\s\S]*?)===/);
      if (vaMatch) {
        const promptsText = vaMatch[1];
        const lines = promptsText.split('\n');
        lines.forEach(line => {
          const match = line.match(/PROMPT:\s*(.*)/i);
          if (match) visualAidPrompts.push(match[1].trim());
        });
      }

      const aiMessage: Message = { 
        id: (Date.now() + 1).toString(), 
        role: 'assistant', 
        content: response, 
        timestamp: new Date(),
        visualAids: []
      };

      setState(prev => ({ ...prev, messages: [...prev.messages, aiMessage], isLoading: false }));

      if (visualAidPrompts.length > 0 && visualAidPrompts[0].toLowerCase() !== 'none') {
        const aidsPromises = visualAidPrompts.slice(0, 4).map(p => generateVisualAid(p));
        const aids = await Promise.all(aidsPromises);
        const validAids = aids.filter(a => a !== null) as string[];
        
        setState(prev => ({
          ...prev,
          messages: prev.messages.map(m => m.id === aiMessage.id ? { ...m, visualAids: validAids } : m)
        }));
      }

    } catch (err) {
      setState(prev => ({ ...prev, isLoading: false, error: "Failed to connect to solver." }));
    }
  };

  const renderMessageContent = (content: string, role: string, message: Message) => {
    const lines = content.split('\n');
    const sections: { title: string; content: string[] }[] = [];
    let currentSection: { title: string; content: string[] } | null = null;
    const rawLines: string[] = [];

    lines.forEach(line => {
      const headerMatch = line.match(/^===\s*(.*?)\s*===$/);
      if (headerMatch) {
        if (currentSection) sections.push(currentSection);
        currentSection = { title: headerMatch[1], content: [] };
      } else if (currentSection) {
        currentSection.content.push(line);
      } else {
        rawLines.push(line);
      }
    });
    if (currentSection) sections.push(currentSection);

    const visibleSections = sections.filter(s => s.title.toLowerCase() !== 'visual aid prompts');

    return (
      <div className="space-y-6">
        {visibleSections.length === 0 ? (
           <div className="space-y-2">{rawLines.map((l, i) => <p key={i} className="text-sm opacity-95">{l}</p>)}</div>
        ) : visibleSections.map((section, idx) => {
          const isSubject = section.title.toLowerCase() === 'subject';
          const isPractice = section.title.toLowerCase().includes('practice');
          
          return (
            <div key={idx} className={`animate-fade-in delay-${idx * 100}`}>
              <h4 className={`text-[10px] font-black uppercase tracking-[0.2em] mb-2 px-1 ${role === 'user' ? 'text-white/70' : 'text-indigo-500/80 dark:text-indigo-400/80'}`}>{section.title}</h4>
              <div className={`p-4 rounded-2xl ${role === 'user' ? 'bg-white/10' : isSubject ? 'bg-indigo-50/50 dark:bg-indigo-900/20 border border-indigo-100 dark:border-indigo-800' : isPractice ? 'bg-amber-50/30 dark:bg-amber-900/10 border border-amber-100/50 dark:border-amber-900/50' : 'bg-slate-50/80 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800'}`}>
                {section.content.map((line, i) => {
                  if (line.includes(' | ')) {
                    return (
                      <div key={i} className="flex flex-wrap gap-2 mb-1">
                        {line.split(' | ').map((part, pidx) => {
                          const isConfidence = part.toLowerCase().includes('confidence');
                          let badgeColor = 'bg-white/50 dark:bg-slate-700/50 text-slate-700 dark:text-slate-300';
                          if (isConfidence) {
                            const val = parseInt(part.match(/\d+/)?.[0] || '0');
                            if (val >= 90) badgeColor = 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300';
                            else if (val >= 70) badgeColor = 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300';
                            else badgeColor = 'bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-300';
                          }
                          return <span key={pidx} className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${badgeColor}`}>{part}</span>;
                        })}
                      </div>
                    );
                  }
                  if (line.includes('$$')) return <div key={i} className="bg-white dark:bg-slate-900 p-2 rounded-lg font-mono text-xs text-center my-2 border border-slate-100 dark:border-slate-800 shadow-sm">{line}</div>;
                  if (/^\d+\./.test(line)) return <div key={i} className="pl-4 border-l-2 border-indigo-100 dark:border-indigo-900 mb-2 italic text-sm py-0.5 leading-relaxed">{line}</div>;
                  return line.trim() ? <p key={i} className="text-sm leading-relaxed opacity-95 mb-1">{line}</p> : null;
                })}
              </div>
            </div>
          );
        })}
        
        {message.visualAids && message.visualAids.length > 0 && (
          <div className="space-y-3 animate-fade-in">
             <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-500/80 px-1">Visual Aids & Diagrams</h4>
             <div className="grid grid-cols-2 gap-3">
               {message.visualAids.map((url, i) => (
                 <img key={i} src={url} className="w-full h-auto rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm hover:scale-[1.02] transition-transform cursor-pointer" alt="Visual aid" onClick={() => window.open(url, '_blank')} />
               ))}
             </div>
          </div>
        )}
      </div>
    );
  };

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach(track => track.stop());
    setIsCameraOpen(false);
  };

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
      setIsCameraOpen(true);
    } catch (err) { setState(prev => ({ ...prev, error: "Camera access denied." })); }
  };

  const capturePhoto = () => {
    if (videoRef.current && canvasRef.current) {
      const canvas = canvasRef.current;
      canvas.width = videoRef.current.videoWidth;
      canvas.height = videoRef.current.videoHeight;
      canvas.getContext('2d')?.drawImage(videoRef.current, 0, 0);
      setSelectedMedia({ data: canvas.toDataURL('image/jpeg'), mimeType: 'image/jpeg' });
      stopCamera();
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => setSelectedMedia({ data: reader.result as string, mimeType: file.type });
      reader.readAsDataURL(file);
    }
  };

  const downloadAsPDF = async (message: Message) => {
    if (isExporting) return;
    setIsExporting(true);
    const zone = document.getElementById('pdf-capture-zone');
    if (!zone) { setIsExporting(false); return; }

    const lines = message.content.split('\n');
    const sections: { title: string; content: string[] }[] = [];
    let currentSection: { title: string; content: string[] } | null = null;
    lines.forEach(line => {
      const headerMatch = line.match(/^===\s*(.*?)\s*===$/);
      if (headerMatch) {
        if (currentSection) sections.push(currentSection);
        currentSection = { title: headerMatch[1], content: [] };
      } else if (currentSection) {
        currentSection.content.push(line);
      }
    });
    if (currentSection) sections.push(currentSection);
    const filteredSections = sections.filter(s => s.title.toLowerCase() !== 'visual aid prompts');

    zone.innerHTML = `
      <div id="pdf-container-inner" style="font-family: 'Inter', sans-serif; background: white; padding: 40px; color: #1e293b; width: 800px;">
        <div style="display: flex; align-items: center; justify-content: space-between; border-bottom: 2px solid #4f46e5; padding-bottom: 20px; margin-bottom: 30px;">
          <div style="display: flex; align-items: center; gap: 15px;">
            <div style="background: #4f46e5; width: 40px; height: 40px; border-radius: 12px; display: flex; align-items: center; justify-content: center; color: white;">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96.44 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 4.44-2.04z"/><path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96.44 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-4.44-2.04z"/></svg>
            </div>
            <div>
              <h1 style="font-size: 24px; font-weight: 800; margin: 0; color: #1e293b;">SnapSolve AI</h1>
              <span style="font-size: 10px; font-weight: bold; color: #10b981; text-transform: uppercase; letter-spacing: 2px;">Solution Report</span>
            </div>
          </div>
          <div style="text-align: right; color: #64748b; font-size: 12px;">
            <div>Report ID: ${message.id}</div>
            <div>Date: ${new Date().toLocaleDateString()}</div>
          </div>
        </div>
        ${message.image ? `
          <div style="text-align: center; margin-bottom: 30px;">
            <p style="font-size: 10px; color: #94a3b8; margin-bottom: 8px; text-transform: uppercase;">Original Input</p>
            <img src="${message.image}" style="max-width: 100%; max-height: 300px; border-radius: 12px; border: 1px solid #e2e8f0;" />
          </div>
        ` : ''}
        <div style="display: flex; flex-direction: column; gap: 20px;">
          ${filteredSections.map(section => `
            <div>
              <h2 style="font-size: 10px; font-weight: 900; color: #6366f1; text-transform: uppercase; letter-spacing: 2px; margin-bottom: 8px;">${section.title}</h2>
              <div style="background: #f8fafc; border: 1px solid #f1f5f9; border-radius: 12px; padding: 15px;">
                ${section.content.map(line => {
                  if (line.includes(' | ')) return `<div style="display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 8px;">${line.split(' | ').map(p => `<span style="background: #eef2ff; color: #4f46e5; padding: 3px 10px; border-radius: 9999px; font-size: 10px; font-weight: 700;">${p}</span>`).join('')}</div>`;
                  if (line.includes('$$')) return `<div style="background: white; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; text-align: center; font-family: monospace; font-size: 13px; margin: 10px 0; color: #1e293b;">${line}</div>`;
                  if (/^\d+\./.test(line)) return `<div style="border-left: 3px solid #cbd5e1; padding-left: 12px; margin-bottom: 8px; color: #475569; font-size: 13px; line-height: 1.5;">${line}</div>`;
                  return line.trim() ? `<p style="font-size: 13px; line-height: 1.5; color: #334155; margin-bottom: 8px;">${line}</p>` : '';
                }).join('')}
              </div>
            </div>
          `).join('')}
        </div>
        ${message.visualAids && message.visualAids.length > 0 ? `
          <div style="margin-top: 30px;">
            <h2 style="font-size: 10px; font-weight: 900; color: #10b981; text-transform: uppercase; letter-spacing: 2px; margin-bottom: 12px;">Visual Aids & Diagrams</h2>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
              ${message.visualAids.map(url => `<img src="${url}" style="width: 100%; border-radius: 12px; border: 1px solid #e2e8f0; background: #f8fafc;" />`).join('')}
            </div>
          </div>
        ` : ''}
        <div style="margin-top: 40px; border-top: 1px solid #f1f5f9; padding-top: 20px; text-align: center; color: #94a3b8; font-size: 9px;">Generated by SnapSolve AI • Solutions are AI-generated for reference only.</div>
      </div>
    `;

    try {
      const imgs = zone.querySelectorAll('img');
      await Promise.all(Array.from(imgs).map(img => img.complete ? Promise.resolve() : new Promise(resolve => { img.onload = resolve; img.onerror = resolve; })));
      await new Promise(r => setTimeout(r, 200));
      const captureInner = document.getElementById('pdf-container-inner');
      if (!captureInner) throw new Error("Capture target not found");
      const canvas = await html2canvas(captureInner, { scale: 2, useCORS: true, logging: false, backgroundColor: '#ffffff' });
      const imgData = canvas.toDataURL('image/png');
      const pdfWidth = canvas.width / 2;
      const pdfHeight = canvas.height / 2;
      const pdf = new jsPDF({ orientation: pdfWidth > pdfHeight ? 'l' : 'p', unit: 'px', format: [pdfWidth, pdfHeight] });
      pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
      pdf.save(`SnapSolve_Solution_${message.id}.pdf`);
    } catch (err) {
      console.error("PDF Export failed:", err);
      alert("Failed to export PDF. Please try again.");
    } finally {
      zone.innerHTML = '';
      setIsExporting(false);
    }
  };

  return (
    <div className="flex h-screen max-w-6xl mx-auto overflow-hidden sm:p-4 bg-slate-50 dark:bg-slate-950 transition-colors duration-300">
      
      {/* Payment Gateway Modal */}
      {showPaymentGateway && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/70 backdrop-blur-xl">
          <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-[40px] overflow-hidden shadow-2xl border border-slate-200 dark:border-slate-800 animate-fade-in">
             {paymentStep === 'details' && (
               <div className="p-8">
                  <div className="flex items-center justify-between mb-8">
                    <h2 className="text-2xl font-black dark:text-white">Secure Checkout</h2>
                    <button onClick={handleClosePayment} className="p-2 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-all"><XIcon className="w-5 h-5" /></button>
                  </div>
                  
                  <div className="bg-indigo-50 dark:bg-indigo-900/20 p-5 rounded-3xl border border-indigo-100 dark:border-indigo-900/50 mb-8">
                    <div className="flex justify-between items-center mb-2">
                       <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-widest">SnapSolve Pro Monthly</span>
                       <span className="text-xl font-black dark:text-white">$12.00</span>
                    </div>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400">Cancel anytime. 24/7 unlimited access to all AI models.</p>
                  </div>

                  {/* Payment Method Selector */}
                  <div className="flex p-1 bg-slate-100 dark:bg-slate-800 rounded-2xl mb-6">
                    <button 
                      onClick={() => setPaymentMethod('card')}
                      className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-xs font-black transition-all ${paymentMethod === 'card' ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-indigo-600'}`}
                    >
                      <CreditCardIcon className="w-4 h-4" /> Card
                    </button>
                    <button 
                      onClick={() => setPaymentMethod('upi')}
                      className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-xs font-black transition-all ${paymentMethod === 'upi' ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-indigo-600'}`}
                    >
                      <SmartphoneIcon className="w-4 h-4" /> UPI
                    </button>
                  </div>

                  <div className="space-y-4">
                    {paymentMethod === 'card' ? (
                      <>
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Card Number</label>
                          <div className="flex items-center gap-3 bg-slate-50 dark:bg-slate-800 p-4 rounded-2xl border border-slate-200 dark:border-slate-700">
                            <CreditCardIcon className="w-5 h-5 text-slate-400" />
                            <input type="text" placeholder="XXXX XXXX XXXX XXXX" className="bg-transparent border-none focus:ring-0 text-sm w-full font-mono" defaultValue="4242 4242 4242 4242" />
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-1.5">
                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Expiry</label>
                            <input type="text" placeholder="MM/YY" className="bg-slate-50 dark:bg-slate-800 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 text-sm focus:ring-0 w-full font-mono" defaultValue="12/28" />
                          </div>
                          <div className="space-y-1.5">
                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">CVC</label>
                            <input type="text" placeholder="123" className="bg-slate-50 dark:bg-slate-800 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 text-sm focus:ring-0 w-full font-mono" defaultValue="999" />
                          </div>
                        </div>
                      </>
                    ) : (
                      <div className="space-y-4 animate-fade-in">
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">UPI ID</label>
                          <div className="flex items-center gap-3 bg-slate-50 dark:bg-slate-800 p-4 rounded-2xl border border-slate-200 dark:border-slate-700">
                            <SmartphoneIcon className="w-5 h-5 text-slate-400" />
                            <input type="text" placeholder="student@bank" className="bg-transparent border-none focus:ring-0 text-sm w-full font-bold" defaultValue="snapsolve@okaxis" />
                          </div>
                        </div>
                        <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-700 flex flex-col items-center justify-center gap-2 group cursor-pointer hover:border-indigo-400 transition-colors">
                          <QrCodeIcon className="w-12 h-12 text-slate-300 dark:text-slate-600 group-hover:text-indigo-400 transition-colors" />
                          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Scan QR Code</span>
                        </div>
                      </div>
                    )}
                  </div>

                  <button onClick={handleProcessPayment} className="w-full mt-8 py-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-3xl font-black shadow-lg shadow-indigo-600/30 transition-all flex items-center justify-center gap-3">
                    {paymentMethod === 'card' ? 'Confirm & Pay $12.00' : 'Proceed via UPI'}
                  </button>
                  <p className="text-center text-[9px] text-slate-400 mt-6 flex items-center justify-center gap-2 uppercase tracking-tighter font-black">
                    <ShieldCheckIcon className="w-3.5 h-3.5 text-emerald-500" />
                    Trusted & Secured Checkout
                  </p>
               </div>
             )}

             {paymentStep === 'processing' && (
               <div className="p-20 flex flex-col items-center justify-center text-center">
                  <div className="w-16 h-16 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mb-8" />
                  <h2 className="text-2xl font-black dark:text-white mb-2">Verifying Payment</h2>
                  <p className="text-slate-500 dark:text-slate-400 text-sm">{paymentMethod === 'card' ? 'Processing your card details...' : 'Waiting for UPI authorization...'}</p>
               </div>
             )}

             {paymentStep === 'success' && (
               <div className="p-12 flex flex-col items-center justify-center text-center">
                  <div className="w-24 h-24 bg-emerald-500 rounded-full flex items-center justify-center mb-8 shadow-xl shadow-emerald-500/30 animate-bounce">
                     <CheckCircleIcon className="w-12 h-12 text-white" />
                  </div>
                  <h2 className="text-3xl font-black dark:text-white mb-3">Upgrade Successful!</h2>
                  <p className="text-slate-500 dark:text-slate-400 text-sm mb-8 leading-relaxed font-medium">
                    Welcome to Pro. You now have unlimited questions and specialized modes active.
                  </p>
                  <button onClick={handleClosePayment} className="w-full py-4 bg-slate-900 dark:bg-white dark:text-slate-900 text-white rounded-3xl font-black shadow-xl transition-all">
                    Let's Solve
                  </button>
               </div>
             )}
          </div>
        </div>
      )}

      {/* Upgrade Modal */}
      {showUpgradeModal && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md">
          <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-[32px] overflow-hidden shadow-2xl animate-fade-in relative">
            <button onClick={() => setShowUpgradeModal(false)} className="absolute top-4 right-4 p-2 text-white/50 hover:text-white transition-colors z-10"><XIcon className="w-6 h-6" /></button>
            <div className="relative h-44 bg-gradient-to-br from-indigo-600 to-purple-700 flex items-center justify-center overflow-hidden">
               <CrownIcon className="w-32 h-32 text-white/10 absolute -right-4 -bottom-4 rotate-12" />
               <div className="bg-white/10 p-6 rounded-[32px] backdrop-blur-sm border border-white/20">
                  <CrownIcon className="w-14 h-14 text-white" />
               </div>
            </div>
            <div className="p-8">
              <h2 className="text-2xl font-black dark:text-white mb-2">Upgrade to Pro</h2>
              <p className="text-slate-500 dark:text-slate-400 text-sm mb-6 leading-relaxed">
                You've hit your daily limit. Unlock the full potential of SnapSolve AI today.
              </p>
              
              <div className="space-y-4 mb-8">
                {[
                  { icon: <PlusIcon className="w-4 h-4" />, text: "Unlimited Solving (No Limits)" },
                  { icon: <SparklesIcon className="w-4 h-4" />, text: "Practice Question Generation" },
                  { icon: <BrainIcon className="w-4 h-4" />, text: "Specialized Expert Modes" },
                  { icon: <DownloadIcon className="w-4 h-4" />, text: "Unlimited PDF Exports" }
                ].map((item, i) => (
                  <div key={i} className="flex items-center gap-3 text-sm font-bold text-slate-700 dark:text-slate-300">
                    <div className="bg-indigo-100 dark:bg-indigo-900/40 p-1.5 rounded-xl text-indigo-600 dark:text-indigo-400">
                      {item.icon}
                    </div>
                    {item.text}
                  </div>
                ))}
              </div>

              <div className="flex flex-col gap-3">
                <button onClick={handleUpgradeClick} className="w-full py-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-3xl font-black transition-all shadow-xl shadow-indigo-600/20">
                  Upgrade Now - $12/mo
                </button>
                <button onClick={() => setShowUpgradeModal(false)} className="w-full py-4 text-slate-500 font-bold hover:bg-slate-100 dark:hover:bg-slate-800 rounded-2xl transition-all">
                  Maybe Later
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Sidebar Backdrop for Mobile */}
      {isSidebarOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[80] lg:hidden transition-opacity" onClick={() => setIsSidebarOpen(false)} />
      )}

      {/* History Sidebar */}
      <aside className={`fixed inset-y-0 left-0 z-[90] w-80 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 transition-transform duration-300 ease-in-out transform ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'} lg:relative lg:translate-x-0`}>
        <div className="flex flex-col h-full">
          <div className="p-6 border-b border-slate-200 dark:border-slate-800 relative">
            <div className="flex items-center justify-between mb-6 lg:hidden">
              <span className="text-sm font-black text-slate-800 dark:text-slate-100 uppercase tracking-widest">History</span>
              <button onClick={() => setIsSidebarOpen(false)} className="p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg">
                <XIcon className="w-5 h-5" />
              </button>
            </div>
            <div className="relative group">
              <button onClick={startNewChat} className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-bold shadow-lg transition-all group">
                <PlusIcon className="w-5 h-5 group-hover:rotate-90 transition-transform" />
                New Conversation
              </button>
              {state.isPro && (
                <div className="absolute -top-2 -right-2 bg-amber-400 text-amber-900 text-[9px] font-black px-2 py-1 rounded-full shadow-lg flex items-center gap-1 border-2 border-white dark:border-slate-900 animate-pulse">
                  <CrownIcon className="w-3 h-3" /> PRO
                </div>
              )}
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-2">
            <h3 className="px-2 text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-4 flex justify-between items-center">
              <span>Saved Solutions</span>
              {state.isPro && <span className="bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 px-2 py-0.5 rounded-full text-[9px]">Unlimited</span>}
            </h3>
            {sessions.length === 0 ? (
              <p className="p-4 text-xs text-slate-400 text-center italic">No saved solutions yet.</p>
            ) : (
              sessions.map(s => (
                <div key={s.id} onClick={() => loadSession(s)} className={`group relative flex items-center gap-3 p-3 rounded-2xl cursor-pointer transition-all ${state.currentSessionId === s.id ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400' : 'hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400'}`}>
                  <div className={`p-2 rounded-xl ${state.currentSessionId === s.id ? 'bg-indigo-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-400'}`}>
                    <BrainIcon className="w-4 h-4" />
                  </div>
                  <div className="flex-1 overflow-hidden">
                    <p className="text-xs font-bold truncate">{s.title}</p>
                    <p className="text-[10px] opacity-60 truncate">{s.lastUpdated.toLocaleDateString()}</p>
                  </div>
                  <button onClick={(e) => deleteSession(e, s.id)} className="p-2 opacity-0 group-hover:opacity-100 hover:text-red-500 transition-all">
                    <TrashIcon className="w-4 h-4" />
                  </button>
                </div>
              ))
            )}
          </div>
          <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50">
             {!state.isPro ? (
               <div className="bg-gradient-to-br from-indigo-500 to-purple-600 p-5 rounded-[24px] text-white shadow-xl">
                  <h4 className="text-xs font-black mb-1 uppercase tracking-wider">SnapSolve Pro</h4>
                  <p className="text-[10px] opacity-90 mb-4 font-medium leading-relaxed">Unlock unlimited AI power and essay draft mode.</p>
                  <button onClick={() => setShowUpgradeModal(true)} className="w-full py-2.5 bg-white text-indigo-600 text-[10px] font-black rounded-xl uppercase tracking-widest hover:scale-[1.02] active:scale-95 transition-all">Upgrade Now</button>
               </div>
             ) : (
               <div className="bg-indigo-50 dark:bg-indigo-900/30 p-5 rounded-[24px] border border-indigo-100 dark:border-indigo-900/50">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="bg-indigo-600 p-2 rounded-xl text-white shadow-md">
                      <CrownIcon className="w-4 h-4" />
                    </div>
                    <div>
                      <span className="text-xs font-black dark:text-white uppercase tracking-wider">Pro Status</span>
                      <p className="text-[9px] text-emerald-500 font-black">ACTIVE</p>
                    </div>
                  </div>
                  <button onClick={() => setShowUpgradeModal(true)} className="text-[10px] text-indigo-600 dark:text-indigo-400 font-bold hover:underline">Manage Account</button>
               </div>
             )}
          </div>
        </div>
      </aside>

      {/* Main Container */}
      <div className="flex-1 flex flex-col relative bg-white dark:bg-slate-950 sm:rounded-[32px] shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden ml-0 lg:ml-4">
        {isCameraOpen && (
          <div className="absolute inset-0 z-[110] bg-black flex flex-col items-center justify-center p-4">
            <div className="w-full max-w-lg relative rounded-3xl overflow-hidden bg-slate-900 aspect-[4/5] shadow-2xl">
              <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover" />
              <button onClick={stopCamera} className="absolute top-6 right-6 p-4 bg-white/20 text-white rounded-full backdrop-blur-xl border border-white/20"><XIcon className="w-7 h-7" /></button>
              <div className="absolute bottom-10 left-0 right-0 flex justify-center">
                <button onClick={capturePhoto} className="w-24 h-24 bg-white rounded-full border-8 border-white/30 flex items-center justify-center active:scale-90 transition-transform shadow-2xl">
                  <div className="w-16 h-16 rounded-full border-4 border-slate-900" />
                </button>
              </div>
            </div>
          </div>
        )}

        <header className="px-6 py-5 glass-effect border-b border-slate-200/60 dark:border-slate-800 flex items-center justify-between sticky top-0 z-10 transition-colors">
          <div className="flex items-center gap-3">
            <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="p-2 lg:hidden text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-all">
              <HistoryIcon className="w-6 h-6" />
            </button>
            <div className="flex items-center gap-4">
              <div className="bg-indigo-600 p-2.5 rounded-2xl text-white shadow-lg"><BrainIcon className="w-5 h-5" /></div>
              <div>
                <h1 className="text-lg font-black dark:text-slate-100 flex items-center gap-2">
                  SnapSolve AI
                  {state.isPro && <CrownIcon className="w-4 h-4 text-amber-500" />}
                </h1>
                <div className="flex items-center gap-2">
                   <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
                   <p className="text-[10px] text-emerald-500 font-black tracking-widest uppercase">Expert System Active</p>
                </div>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {state.messages.length > 0 && (
              <button onClick={closeCurrentChat} className="p-2.5 text-slate-500 dark:text-slate-400 hover:bg-rose-50 dark:hover:bg-rose-900/20 hover:text-rose-500 rounded-xl transition-all border border-transparent hover:border-rose-100 dark:hover:border-rose-900/50" title="Close Session">
                <XIcon className="w-5 h-5" />
              </button>
            )}
            <button onClick={() => setIsDarkMode(!isDarkMode)} className="p-2.5 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-all">
              {isDarkMode ? <SunIcon className="w-5 h-5" /> : <MoonIcon className="w-5 h-5" />}
            </button>
            <div className="bg-slate-100 dark:bg-slate-800 p-1 rounded-xl flex shadow-inner">
              {[GradeLevel.HIGH_SCHOOL, GradeLevel.COLLEGE].map(level => (
                <button key={level} onClick={() => setState(prev => ({ ...prev, gradeLevel: level }))} className={`px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all ${state.gradeLevel === level ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-md' : 'text-slate-500 dark:text-slate-400'}`}>{level === GradeLevel.HIGH_SCHOOL ? 'HS' : 'COL'}</button>
              ))}
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-6 space-y-8 bg-slate-50/20 dark:bg-slate-950/20">
          {state.messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-center max-w-sm mx-auto">
              <div className="w-28 h-28 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 rounded-[40px] flex items-center justify-center mb-8 shadow-inner border border-indigo-100 dark:border-indigo-900/50"><CameraIcon className="w-12 h-12" /></div>
              <h2 className="text-3xl font-black dark:text-slate-100 mb-3 tracking-tight">Snap, Upload, Solve.</h2>
              <p className="text-slate-500 dark:text-slate-400 text-sm mb-8 font-medium">Upload assignments as photos or PDFs. We'll identify the subject and guide you step-by-step.</p>
              {!state.isPro && (
                <div className="bg-indigo-100/50 dark:bg-indigo-900/30 px-6 py-3 rounded-2xl border border-indigo-100 dark:border-indigo-900/50 animate-fade-in">
                  <p className="text-[11px] font-black text-indigo-600 dark:text-indigo-400 uppercase tracking-widest mb-1">Daily Limit Tracker</p>
                  <div className="flex items-center gap-3">
                    <div className="flex-1 h-2 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
                       <div className="h-full bg-indigo-600 transition-all duration-1000" style={{ width: `${(state.dailyUsageCount / 3) * 100}%` }} />
                    </div>
                    <span className="text-xs font-bold text-slate-700 dark:text-slate-300">{3 - state.dailyUsageCount} free left</span>
                  </div>
                </div>
              )}
            </div>
          )}
          {state.messages.map(msg => (
            <div key={msg.id} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'} animate-fade-in`}>
              <div className={`max-w-[95%] md:max-w-[85%] rounded-[32px] p-6 shadow-xl relative transition-all duration-300 ${msg.role === 'user' ? 'bg-indigo-600 text-white rounded-tr-none' : 'bg-white dark:bg-slate-900 dark:text-slate-200 border border-slate-200/50 dark:border-slate-800 rounded-tl-none'}`}>
                {msg.role === 'assistant' && (
                  <button onClick={() => downloadAsPDF(msg)} disabled={isExporting} className="absolute top-5 right-5 p-2.5 bg-indigo-50 dark:bg-indigo-950 hover:bg-indigo-100 dark:hover:bg-indigo-900 text-indigo-600 dark:text-indigo-400 rounded-2xl transition-all shadow-sm border border-indigo-100 dark:border-indigo-800 disabled:opacity-50" title="Export to PDF"><DownloadIcon className={`w-4 h-4 ${isExporting ? 'animate-bounce' : ''}`} /></button>
                )}
                {msg.image && <img src={msg.image} className="mb-6 rounded-2xl border border-white/20 dark:border-slate-800 shadow-2xl max-h-[400px] object-contain w-full" />}
                {renderMessageContent(msg.content, msg.role, msg)}
                <div className="text-[9px] mt-6 opacity-30 font-black text-right uppercase tracking-widest">{msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
              </div>
            </div>
          ))}
          {state.isLoading && (
            <div className="flex items-center gap-4 p-7 bg-white dark:bg-slate-900 rounded-[32px] border border-indigo-100 dark:border-indigo-900/50 shadow-xl w-fit animate-pulse">
              <div className="flex gap-1.5">
                <div className="w-2.5 h-2.5 bg-indigo-600 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
                <div className="w-2.5 h-2.5 bg-indigo-600 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                <div className="w-2.5 h-2.5 bg-indigo-600 rounded-full animate-bounce"></div>
              </div>
              <span className="text-xs font-black text-indigo-600 dark:text-indigo-400 uppercase tracking-widest">{state.currentMode} in progress...</span>
            </div>
          )}
          <div ref={messagesEndRef} />
        </main>

        <footer className="p-6 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800">
          <div className="max-w-3xl mx-auto space-y-6">
            {/* Pro Mode Selector */}
            <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide -mx-1 px-1">
               {Object.values(AppMode).map(mode => {
                 const isModePro = mode !== AppMode.NORMAL;
                 const isDisabled = isModePro && !state.isPro;
                 return (
                   <button 
                    key={mode} 
                    onClick={() => isDisabled ? setShowUpgradeModal(true) : setState(prev => ({ ...prev, currentMode: mode }))}
                    className={`flex-shrink-0 px-5 py-2.5 rounded-2xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2.5 transition-all border-2 ${state.currentMode === mode ? 'bg-indigo-600 text-white border-indigo-600 shadow-lg shadow-indigo-600/20' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-transparent hover:border-slate-200 dark:hover:border-slate-700'}`}
                   >
                     {isDisabled && <CrownIcon className="w-3.5 h-3.5 text-amber-500" />}
                     {mode}
                   </button>
                 );
               })}
            </div>

            {selectedMedia && (
              <div className="flex items-center gap-4 bg-indigo-50 dark:bg-indigo-900/20 p-3 rounded-2xl border border-indigo-100 dark:border-indigo-900/50 animate-fade-in shadow-inner">
                {selectedMedia.mimeType.startsWith('image/') ? <img src={selectedMedia.data} className="w-12 h-12 object-cover rounded-xl shadow-md" /> : <div className="w-12 h-12 bg-indigo-600 flex items-center justify-center rounded-xl text-[10px] font-black text-white shadow-md uppercase">PDF</div>}
                <div className="flex-1"><p className="text-[10px] font-black text-indigo-600 dark:text-indigo-400 uppercase tracking-widest">Selected Document</p><p className="text-[10px] text-slate-500 dark:text-slate-400 font-bold">{selectedMedia.mimeType.split('/')[1].toUpperCase()}</p></div>
                <button onClick={() => setSelectedMedia(null)} className="p-2.5 hover:bg-white dark:hover:bg-slate-800 rounded-xl text-slate-400 transition-colors"><XIcon className="w-5 h-5" /></button>
              </div>
            )}
            
            <div className="flex items-end gap-3 bg-slate-100 dark:bg-slate-800 rounded-[32px] p-2.5 focus-within:bg-white dark:focus-within:bg-slate-900 border-2 border-transparent focus-within:border-indigo-200 dark:focus-within:border-indigo-900/50 transition-all shadow-inner">
              <div className="flex items-center">
                <button onClick={startCamera} className="p-4 text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"><CameraIcon className="w-5.5 h-5.5" /></button>
                <button onClick={() => fileInputRef.current?.click()} className="p-4 text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 border-l border-slate-200 dark:border-slate-700 transition-colors"><UploadIcon className="w-5.5 h-5.5" /></button>
                <input type="file" ref={fileInputRef} onChange={handleFileUpload} accept="image/*,application/pdf" className="hidden" />
              </div>
              <textarea rows={1} value={inputText} onChange={e => setInputText(e.target.value)} onKeyDown={e => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), handleSendMessage())} placeholder={state.isPro ? "Ask anything..." : `Free question (${3 - state.dailyUsageCount} left)...`} className="flex-1 bg-transparent border-none focus:ring-0 py-4 px-3 text-sm text-slate-800 dark:text-slate-100 font-bold placeholder:text-slate-400 dark:placeholder:text-slate-600 resize-none min-h-[56px] max-h-40" />
              <button onClick={handleSendMessage} disabled={(!inputText.trim() && !selectedMedia) || state.isLoading} className={`p-4 rounded-[24px] shadow-2xl transition-all active:scale-95 ${(!inputText.trim() && !selectedMedia) || state.isLoading ? 'bg-slate-200 dark:bg-slate-800 text-slate-400' : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-indigo-600/30'}`}><SendIcon className="w-6 h-6" /></button>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
};

export default App;
