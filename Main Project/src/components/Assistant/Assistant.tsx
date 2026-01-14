import { useState, useRef, useEffect } from 'react';
import { Send, Bot, User, Sparkles } from 'lucide-react';
import { cn } from '../../utils/cn';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

export const Assistant = ({ }: any) => {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      role: 'assistant',
      content: 'Hello! I am your Data Science Assistant. I can help you analyze your data, suggest visualizations, or explain complex correlations. How can I help you today?',
      timestamp: new Date()
    }
  ]);
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = () => {
    if (!input.trim()) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMsg]);
    setInput('');

    // Mock response
    setTimeout(() => {
      const assistantMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: "That's an interesting question. Based on the dataset, we can observe a strong positive correlation between 'Revenue' and 'Active Users'. I recommend plotting a scatter plot to visualize this relationship.",
        timestamp: new Date()
      };
      setMessages(prev => [...prev, assistantMsg]);
    }, 1000);
  };

  return (
    <div className="flex flex-col h-full bg-black text-white">
      {/* Chat Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4" ref={scrollRef}>
        {messages.map((msg) => (
          <div 
            key={msg.id} 
            className={cn(
              "flex w-full max-w-[90%]",
              msg.role === 'user' ? "ml-auto justify-end" : "mr-auto justify-start"
            )}
          >
            <div className={cn(
              "flex flex-col space-y-1", 
              msg.role === 'user' ? "items-end" : "items-start"
            )}>
              <div className="flex items-center space-x-2 mb-1">
                 <div className={cn(
                   "w-6 h-6 rounded-full flex items-center justify-center",
                   msg.role === 'assistant' ? "bg-purple-600" : "bg-neutral-600"
                 )}>
                   {msg.role === 'assistant' ? <Bot size={14} /> : <User size={14} />}
                 </div>
                 <span className="text-xs text-neutral-500">
                   {msg.role === 'assistant' ? 'AI Assistant' : 'You'}
                 </span>
              </div>
              
              <div className={cn(
                "p-3 rounded-lg text-sm leading-relaxed",
                msg.role === 'user' 
                  ? "bg-neutral-800 text-white rounded-tr-none" 
                  : "bg-neutral-900 border border-neutral-800 text-neutral-200 rounded-tl-none"
              )}>
                {msg.content}
              </div>
              <span className="text-[10px] text-neutral-600">
                {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Input Area */}
      <div className="p-4 border-t border-neutral-800 bg-black">
        <div className="relative flex items-center bg-neutral-900 border border-neutral-800 rounded-lg focus-within:ring-1 focus-within:ring-neutral-700">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            placeholder="Ask about your data..."
            className="flex-1 bg-transparent border-none focus:ring-0 text-white p-3 text-sm placeholder-neutral-500"
          />
          <button 
            onClick={handleSend}
            className="p-2 mr-1 text-neutral-400 hover:text-white hover:bg-neutral-800 rounded-md transition-colors"
          >
            <Send size={18} />
          </button>
        </div>
        <div className="mt-2 flex items-center justify-center space-x-4">
           <button className="text-xs text-neutral-500 hover:text-neutral-300 flex items-center space-x-1">
             <Sparkles size={10} />
             <span>Suggest Analysis</span>
           </button>
           <button className="text-xs text-neutral-500 hover:text-neutral-300">
             Explain Correlation
           </button>
        </div>
      </div>
    </div>
  );
};
