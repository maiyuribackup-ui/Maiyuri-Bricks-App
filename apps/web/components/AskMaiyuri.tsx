'use client';

import { useState, useRef, useEffect } from 'react';

interface Message {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    timestamp: Date;
}

const STORAGE_KEY = 'ask-maiyuri-chat-history';

export function AskMaiyuri() {
    const [isOpen, setIsOpen] = useState(false);
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    // Load messages from localStorage on mount
    useEffect(() => {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
            try {
                const parsed = JSON.parse(saved);
                setMessages(parsed.map((m: any) => ({ ...m, timestamp: new Date(m.timestamp) })));
            } catch (e) {
                console.error('Failed to load chat history:', e);
            }
        }
    }, []);

    // Save messages to localStorage when they change
    useEffect(() => {
        if (messages.length > 0) {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
        }
    }, [messages]);

    // Auto-scroll to bottom
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const sendMessage = async () => {
        if (!input.trim() || isLoading) return;

        const userMessage: Message = {
            id: Date.now().toString(),
            role: 'user',
            content: input.trim(),
            timestamp: new Date()
        };

        setMessages(prev => [...prev, userMessage]);
        setInput('');
        setIsLoading(true);

        try {
            const response = await fetch('/api/knowledge/ask', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ question: userMessage.content })
            });

            const data = await response.json();

            const assistantMessage: Message = {
                id: (Date.now() + 1).toString(),
                role: 'assistant',
                content: data.data?.answer || 'Sorry, I couldn\'t find an answer.',
                timestamp: new Date()
            };

            setMessages(prev => [...prev, assistantMessage]);
        } catch (error) {
            setMessages(prev => [...prev, {
                id: (Date.now() + 1).toString(),
                role: 'assistant',
                content: 'Sorry, there was an error. Please try again.',
                timestamp: new Date()
            }]);
        } finally {
            setIsLoading(false);
        }
    };

    const clearHistory = () => {
        setMessages([]);
        localStorage.removeItem(STORAGE_KEY);
    };

    return (
        <>
            {/* Floating Button - Brick-colored pill with "Ask Maiyuri" text */}
            <button
                onClick={() => setIsOpen(!isOpen)}
                style={{
                    position: 'fixed',
                    bottom: '24px',
                    right: '24px',
                    zIndex: 9999,
                }}
                className={`group flex items-center gap-2 px-5 py-3 rounded-full shadow-2xl transition-all duration-300 hover:scale-105 ${isOpen
                    ? 'bg-slate-800 border-2 border-slate-600'
                    : 'bg-gradient-to-r from-amber-600 via-orange-500 to-red-500 hover:from-amber-500 hover:via-orange-400 hover:to-red-400'
                    }`}
            >
                {/* Brick Icon */}
                <span className="text-2xl">{isOpen ? '✕' : '🧱'}</span>

                {/* Text Label */}
                <span className={`font-semibold text-sm whitespace-nowrap ${isOpen ? 'text-slate-300' : 'text-white'
                    }`}>
                    {isOpen ? 'Close' : 'Ask Maiyuri'}
                </span>

                {/* Pulse Animation when closed */}
                {!isOpen && (
                    <span className="absolute inset-0 rounded-full bg-gradient-to-r from-amber-600 to-red-500 animate-ping opacity-20" />
                )}
            </button>

            {/* Chat Window - Speech Bubble Style with curved edges */}
            {isOpen && (
                <div
                    style={{
                        position: 'fixed',
                        bottom: '90px',
                        right: '24px',
                        zIndex: 9998,
                        maxWidth: 'calc(100vw - 48px)',
                        maxHeight: 'calc(100vh - 140px)'
                    }}
                    className="w-[400px] h-[550px] flex flex-col overflow-hidden"
                >
                    {/* Main Chat Container with organic shape */}
                    <div
                        className="flex-1 rounded-[32px] shadow-2xl border-2 border-amber-500/30 flex flex-col overflow-hidden relative"
                        style={{ backgroundColor: '#0f172a' }}
                    >

                        {/* Decorative glow effect */}
                        <div className="absolute -top-20 -right-20 w-40 h-40 bg-orange-500/10 rounded-full blur-3xl" />
                        <div className="absolute -bottom-20 -left-20 w-40 h-40 bg-amber-500/10 rounded-full blur-3xl" />

                        {/* Header with Brick Pattern Accent */}
                        <div className="relative px-5 py-4 border-b border-amber-500/20">
                            <div className="absolute inset-0 bg-gradient-to-r from-amber-600/20 via-orange-500/20 to-red-500/20" />
                            <div className="relative flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    {/* Brick Avatar */}
                                    <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-500 to-red-600 flex items-center justify-center shadow-lg shadow-orange-500/30">
                                        <span className="text-2xl">🧱</span>
                                    </div>
                                    <div>
                                        <h3 className="font-bold text-white text-lg">Maiyuri Assistant</h3>
                                        <div className="flex items-center gap-1.5">
                                            <span className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
                                            <span className="text-emerald-400 text-xs font-medium">Online • Ready to help</span>
                                        </div>
                                    </div>
                                </div>
                                <button
                                    onClick={clearHistory}
                                    className="p-2.5 hover:bg-white/10 rounded-xl transition-colors group"
                                    title="Clear chat history"
                                >
                                    <svg className="w-5 h-5 text-slate-400 group-hover:text-amber-400 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                    </svg>
                                </button>
                            </div>
                        </div>

                        {/* Messages Container */}
                        <div className="relative flex-1 overflow-y-auto p-5 space-y-4">
                            {messages.length === 0 && (
                                <div className="text-center py-8">
                                    {/* Welcome Animation */}
                                    <div className="w-24 h-24 mx-auto mb-5 relative">
                                        <div className="absolute inset-0 bg-gradient-to-br from-amber-500/30 to-red-500/30 rounded-3xl animate-pulse" />
                                        <div className="absolute inset-2 bg-gradient-to-br from-amber-500 to-red-600 rounded-2xl flex items-center justify-center shadow-xl">
                                            <span className="text-5xl">👋</span>
                                        </div>
                                    </div>
                                    <h4 className="text-white font-bold text-xl mb-2">Welcome to Maiyuri!</h4>
                                    <p className="text-slate-400 text-sm mb-6">Your AI-powered brick expert.<br />Ask me anything about our products!</p>

                                    {/* Colorful Quick Questions */}
                                    <div className="space-y-3">
                                        <button
                                            onClick={() => { setInput('What types of bricks do you offer?'); }}
                                            className="w-full px-4 py-3.5 bg-gradient-to-r from-violet-600/40 to-purple-600/40 hover:from-violet-500/60 hover:to-purple-500/60 rounded-2xl text-white text-sm font-medium transition-all duration-300 border border-violet-400/30 hover:border-violet-400/60 hover:scale-[1.02] hover:shadow-xl hover:shadow-violet-500/20 flex items-center gap-3"
                                        >
                                            <span className="text-xl">🧱</span>
                                            <span>What types of bricks do you offer?</span>
                                        </button>
                                        <button
                                            onClick={() => { setInput('Tell me about brick specifications'); }}
                                            className="w-full px-4 py-3.5 bg-gradient-to-r from-cyan-600/40 to-teal-600/40 hover:from-cyan-500/60 hover:to-teal-500/60 rounded-2xl text-white text-sm font-medium transition-all duration-300 border border-cyan-400/30 hover:border-cyan-400/60 hover:scale-[1.02] hover:shadow-xl hover:shadow-cyan-500/20 flex items-center gap-3"
                                        >
                                            <span className="text-xl">📐</span>
                                            <span>Tell me about brick specifications</span>
                                        </button>
                                        <button
                                            onClick={() => { setInput('What are your delivery options?'); }}
                                            className="w-full px-4 py-3.5 bg-gradient-to-r from-rose-600/40 to-pink-600/40 hover:from-rose-500/60 hover:to-pink-500/60 rounded-2xl text-white text-sm font-medium transition-all duration-300 border border-rose-400/30 hover:border-rose-400/60 hover:scale-[1.02] hover:shadow-xl hover:shadow-rose-500/20 flex items-center gap-3"
                                        >
                                            <span className="text-xl">🚚</span>
                                            <span>What are your delivery options?</span>
                                        </button>
                                    </div>
                                </div>
                            )}

                            {messages.map((msg) => (
                                <div
                                    key={msg.id}
                                    className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                                >
                                    <div
                                        className={`max-w-[85%] px-4 py-3 shadow-lg transition-all duration-200 ${msg.role === 'user'
                                            ? 'bg-gradient-to-r from-amber-500 to-orange-600 text-white rounded-2xl rounded-br-md shadow-orange-500/20'
                                            : 'bg-slate-700/80 text-white rounded-2xl rounded-bl-md border border-slate-600/50 shadow-slate-900/30'
                                            }`}
                                    >
                                        <p className="text-sm leading-relaxed whitespace-pre-wrap" style={{ color: 'white' }}>{msg.content}</p>
                                        <p className={`text-[10px] mt-2 ${msg.role === 'user' ? 'text-amber-100/70' : 'text-slate-400'}`}>
                                            {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                        </p>
                                    </div>
                                </div>
                            ))}

                            {isLoading && (
                                <div className="flex justify-start">
                                    <div className="bg-slate-700/80 rounded-2xl rounded-bl-md px-4 py-3 border border-slate-600/50">
                                        <div className="flex items-center gap-3">
                                            <div className="flex gap-1">
                                                <span className="w-2 h-2 bg-amber-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                                                <span className="w-2 h-2 bg-orange-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                                                <span className="w-2 h-2 bg-red-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                                            </div>
                                            <span className="text-slate-300 text-sm">Maiyuri is thinking...</span>
                                        </div>
                                    </div>
                                </div>
                            )}

                            <div ref={messagesEndRef} />
                        </div>

                        {/* Input Area - Sleek Design */}
                        <div className="relative p-4 border-t border-slate-700/50 bg-slate-800/80">
                            <div className="flex gap-3 items-center">
                                <input
                                    type="text"
                                    value={input}
                                    onChange={(e) => setInput(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && sendMessage()}
                                    placeholder="Ask about bricks, delivery, specs..."
                                    className="flex-1 px-4 py-3.5 bg-slate-900/70 border border-slate-600/50 rounded-2xl text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500/50 transition-all text-sm"
                                    disabled={isLoading}
                                />
                                <button
                                    onClick={sendMessage}
                                    disabled={isLoading || !input.trim()}
                                    className="w-12 h-12 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 disabled:from-slate-600 disabled:to-slate-600 text-white rounded-2xl flex items-center justify-center transition-all shadow-lg hover:shadow-amber-500/30 disabled:shadow-none"
                                >
                                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                                    </svg>
                                </button>
                            </div>

                            {/* Memory Indicator */}
                            {messages.length > 0 && (
                                <p className="text-center text-slate-500 text-[10px] mt-2.5 flex items-center justify-center gap-1.5">
                                    <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full" />
                                    {messages.length} messages saved • Memory persists
                                </p>
                            )}
                        </div>
                    </div>

                    {/* Speech Bubble Tail */}
                    <div
                        className="absolute -bottom-2 right-12 w-6 h-6 bg-slate-900 border-r-2 border-b-2 border-amber-500/30 transform rotate-45"
                        style={{ clipPath: 'polygon(100% 0, 100% 100%, 0 100%)' }}
                    />
                </div>
            )}
        </>
    );
}
