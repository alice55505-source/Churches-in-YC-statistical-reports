import React from 'react';
import { Sparkles } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface AnalysisReportProps {
  report: string;
  isAnalysing: boolean;
  onGenerate: () => void;
  hasData: boolean;
}

const AnalysisReport: React.FC<AnalysisReportProps> = ({ report, isAnalysing, onGenerate, hasData }) => {
  if (!hasData) return null;

  return (
    <div className="glass-card rounded-2xl shadow-lg shadow-indigo-500/5 p-8 relative overflow-hidden transition-all duration-500">
      {/* Decorative gradient */}
      <div className="absolute top-0 right-0 w-96 h-96 bg-gradient-to-br from-indigo-100/40 to-purple-100/40 rounded-full blur-[80px] -translate-y-1/2 translate-x-1/2 pointer-events-none"></div>

      <div className="flex items-center justify-between mb-8 relative z-10">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl text-white shadow-md shadow-indigo-500/20">
            <Sparkles size={22} />
          </div>
          <div>
            <h2 className="text-xl font-bold text-stone-800">AI 智能報表分析</h2>
            <p className="text-xs text-stone-500 mt-0.5">由 Google Gemini 提供深度洞察</p>
          </div>
        </div>
        
        {!report && !isAnalysing && (
          <button
            onClick={onGenerate}
            className="px-5 py-2.5 bg-stone-800 hover:bg-black text-white text-sm font-semibold rounded-xl transition-all shadow-md hover:shadow-lg flex items-center gap-2 transform active:scale-95"
          >
            <Sparkles size={16} />
            生成洞察報告
          </button>
        )}
      </div>

      {isAnalysing && (
        <div className="flex flex-col items-center justify-center py-16 space-y-6 animate-pulse">
          <div className="relative">
            <div className="w-16 h-16 border-4 border-indigo-100 rounded-full"></div>
            <div className="w-16 h-16 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin absolute top-0 left-0"></div>
          </div>
          <p className="text-stone-500 font-medium tracking-wide">Gemini 正在分析您的數據...</p>
        </div>
      )}

      {report && (
        <div className="prose prose-stone prose-sm max-w-none bg-white/50 backdrop-blur-sm p-6 rounded-xl border border-white/60 shadow-inner">
           <ReactMarkdown 
             remarkPlugins={[remarkGfm]}
             components={{
               h1: ({node, ...props}) => <h1 className="text-2xl font-bold text-stone-900 mb-6 pb-2 border-b border-stone-200" {...props} />,
               h2: ({node, ...props}) => <h2 className="text-lg font-bold text-indigo-900 mt-8 mb-4 flex items-center gap-2" {...props} />,
               h3: ({node, ...props}) => <h3 className="text-base font-bold text-stone-700 mt-6 mb-3" {...props} />,
               ul: ({node, ...props}) => <ul className="list-disc pl-5 space-y-2 mb-6 text-stone-600 marker:text-indigo-400" {...props} />,
               li: ({node, ...props}) => <li className="pl-1 leading-relaxed" {...props} />,
               p: ({node, ...props}) => <p className="mb-4 text-stone-600 leading-7" {...props} />,
               strong: ({node, ...props}) => <strong className="font-bold text-stone-900" {...props} />,
               table: ({node, ...props}) => (
                 <div className="overflow-x-auto my-8 border rounded-xl border-stone-200 shadow-sm bg-white">
                    <table className="min-w-full divide-y divide-stone-200" {...props} />
                 </div>
               ),
               thead: ({node, ...props}) => <thead className="bg-stone-50" {...props} />,
               th: ({node, ...props}) => <th className="px-4 py-3 text-left text-xs font-semibold text-stone-500 uppercase tracking-wider border-b border-stone-200" {...props} />,
               td: ({node, ...props}) => <td className="px-4 py-3 whitespace-nowrap text-sm text-stone-600 border-b border-stone-100" {...props} />,
             }}
           >
             {report}
           </ReactMarkdown>
           
           <div className="mt-8 pt-6 border-t border-stone-200/60 flex justify-end">
             <button 
               onClick={onGenerate} 
               className="text-xs text-indigo-600 hover:text-indigo-800 font-bold uppercase tracking-wider transition-colors flex items-center gap-1"
             >
               <span className="text-lg">↻</span> 重新生成分析
             </button>
           </div>
        </div>
      )}

      {!report && !isAnalysing && (
        <div className="text-center py-12 px-4 rounded-xl border-2 border-dashed border-stone-200 bg-stone-50/50">
          <p className="text-stone-400 text-sm">
            點擊上方按鈕，讓 AI 為您找出數據背後的故事。
          </p>
        </div>
      )}
    </div>
  );
};

export default AnalysisReport;