
import React, { useState, useRef } from 'react';
import { LayoutDashboard, FileSpreadsheet, AlertCircle, Table, Users, PlusCircle, LogIn, UploadCloud, ArrowRight, Image as ImageIcon, PenTool, X, Database, Menu, Trash2, ShieldAlert } from 'lucide-react';
import FileUpload from './components/FileUpload';
import DataTable from './components/DataTable';
import ConsolidatedTable from './components/ConsolidatedTable';
import MonthlyReportTable from './components/MonthlyReportTable';
import { parseFile, detectColumns } from './services/fileParser';
import { DataRow, ColumnInfo, AppStatus } from './types';
import { ProcessedRow, processConsolidatedData, recalculateSubtotals } from './utils/reportHelpers';

// Logo: Hand-drawn style circle
const ChurchLogo = () => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [logoSrc, setLogoSrc] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('church_logo_custom') || '/logo.png';
    }
    return '/logo.png';
  });
  const [imgError, setImgError] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const result = event.target?.result as string;
        setLogoSrc(result);
        setImgError(false);
        localStorage.setItem('church_logo_custom', result);
      };
      reader.readAsDataURL(file);
    }
  };

  return (
    <div 
      className="w-16 h-16 relative group cursor-pointer" 
      onClick={() => fileInputRef.current?.click()}
      title="更換圖片"
    >
      <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleFileChange} />
      
      {/* Hand-drawn circle effect using irregular border radius */}
      <div className={`w-full h-full overflow-hidden transition-all duration-300 border-2 border-stone-600 bg-white
         ${imgError ? 'flex items-center justify-center bg-stone-100' : ''}`}
         style={{ borderRadius: '40% 60% 70% 30% / 40% 50% 60% 50%' }}
      >
        {!imgError ? (
          <img src={logoSrc} alt="Logo" className="w-full h-full object-contain p-1" onError={() => setImgError(true)} />
        ) : (
          <ImageIcon size={20} className="text-stone-400" />
        )}
      </div>
      
      {/* Pencil Sketch Shadow */}
      <div className="absolute -bottom-1 -right-1 w-full h-full bg-stone-300 -z-10"
           style={{ borderRadius: '40% 60% 70% 30% / 40% 50% 60% 50%' }} />
    </div>
  );
};

// Pencil Scribble Decoration Component
const PencilScribble = ({ className, color = "#fbbf24" }: { className?: string, color?: string }) => (
  <svg className={className} viewBox="0 0 200 20" preserveAspectRatio="none">
    <path d="M5,15 Q50,5 90,12 T190,8" fill="none" stroke={color} strokeWidth="4" strokeLinecap="round" strokeDasharray="5, 10" opacity="0.4" />
    <path d="M8,12 Q60,18 110,8 T195,14" fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" opacity="0.6" />
  </svg>
);

const App: React.FC = () => {
  const [data, setData] = useState<DataRow[]>([]);
  // State for the Master Table (Processed Rows) lifted up to persist across tab switches
  const [masterData, setMasterData] = useState<ProcessedRow[]>([]);
  
  const [columns, setColumns] = useState<ColumnInfo[]>([]);
  const [status, setStatus] = useState<AppStatus>(AppStatus.IDLE);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [loadedFiles, setLoadedFiles] = useState<string[]>([]);
  
  // Force Remount Key
  const [resetKey, setResetKey] = useState(0);
  
  // Navigation Tabs: 'master', 'monthly', 'raw'
  const [activeTab, setActiveTab] = useState<'master' | 'monthly' | 'raw'>('master');
  
  // Mobile Sidebar State
  const [isSidebarOpen, setSidebarOpen] = useState(false);
  
  const headerFileInputRef = useRef<HTMLInputElement>(null);

  const processFiles = async (files: File[]): Promise<{ parsed: DataRow[], names: string[] }> => {
    const allData: DataRow[] = [];
    const fileNames: string[] = [];
    for (const file of files) {
      const fileData = await parseFile(file);
      allData.push(...fileData);
      fileNames.push(file.name);
    }
    return { parsed: allData, names: fileNames };
  };

  const handleStartProject = async (initialFiles: File[] = []) => {
    setStatus(AppStatus.PROCESSING);
    setErrorMsg(null);
    setData([]);
    setMasterData([]); // Reset master data
    setLoadedFiles([]);

    try {
      let initialData: DataRow[] = [];
      let initialNames: string[] = [];

      if (initialFiles.length > 0) {
         const result = await processFiles(initialFiles);
         initialData = result.parsed;
         initialNames = result.names;
         if (initialData.length > 0) {
            setData(initialData);
            setColumns(detectColumns(initialData));
            
            // Generate Master Data Immediately
            const newMaster = processConsolidatedData(initialData);
            setMasterData(newMaster);
         }
      } else {
         // Empty Project - Initialize placeholder master data
         const newMaster = processConsolidatedData([]);
         setMasterData(newMaster);
      }

      setLoadedFiles(initialNames);
      setStatus(AppStatus.READY);
      setActiveTab('master'); 
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || "建立專案失敗");
      setStatus(AppStatus.ERROR);
    }
  };

  const handleRoomFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      try {
        setErrorMsg(null);
        const { parsed, names } = await processFiles(Array.from(e.target.files));
        if (parsed.length > 0) {
           // 1. Update Raw Data
           const nextData = [...data, ...parsed];
           setData(nextData);
           setColumns(detectColumns(nextData));
           setLoadedFiles(prev => [...prev, ...names]);

           // 2. Sync Master Data (Merge fresh data with existing edits)
           // This ensures the Consolidated Table sees the new data immediately
           const nextMasterData = processConsolidatedData(nextData, masterData);
           setMasterData(nextMasterData);
        }
      } catch (err: any) {
        console.error(err);
        setErrorMsg(err.message || "檔案處理失敗");
      }
      // Reset input
      if (headerFileInputRef.current) headerFileInputRef.current.value = '';
    }
  };

  const handleRawDataUpdate = (rowIndex: number, column: string, value: string | number) => {
    const newData = [...data];
    newData[rowIndex] = { ...newData[rowIndex], [column]: value };
    setData(newData);

    // Sync Master Data
    const nextMasterData = processConsolidatedData(newData, masterData);
    setMasterData(nextMasterData);
  };
  
  // New handler for monthly report editing
  const handleMonthlyDataUpdate = (churchName: string, field: string, value: number) => {
      const newData = [...data];
      // Find the first row that matches this church (heuristic update)
      const targetIndex = newData.findIndex(row => {
          const nameInContent = Object.values(row).some(v => String(v).includes(churchName));
          return String(row['來源報表']).includes(churchName) || nameInContent;
      });

      if (targetIndex !== -1) {
          newData[targetIndex] = {
              ...newData[targetIndex],
              [field === 'bap_online' ? 'bap_online_manual' : field]: value
          };
          setData(newData);

          // Sync Master Data
          const nextMasterData = processConsolidatedData(newData, masterData);
          setMasterData(nextMasterData);
      } else {
          console.warn(`Could not find raw data row for ${churchName} to update ${field}`);
      }
  };

  // 允許 ConsolidatedTable 回寫數據到 App state (匯入專案時)
  const handleDataOverride = (newData: DataRow[]) => {
    setData(newData);
    // [FIX] Update columns as well so raw data view works
    setColumns(detectColumns(newData));
    
    // 專案檔通常是彙整過的數據，不包含原始檔案名稱，所以我們可以給一個標記或保持原樣
    if (loadedFiles.length === 0 && newData.length > 0) {
        setLoadedFiles(['匯入的專案數據']);
    }

    // 注意：handleImportProject 內部已經呼叫了 setMasterData，這裡不需要再呼叫 processConsolidatedData
    // 否則可能會覆蓋掉從專案檔載入的 masterData (如果有包含 manual edits 且 rawData 不完整的話)
  };

  const handleRemoveFile = (fileName: string) => {
    if (!fileName) return;
    
    const target = String(fileName).trim();
    
    // Update Data
    const nextData = data.filter(r => String(r['來源報表'] || '').trim() !== target);
    setData(nextData);
    setLoadedFiles(prev => prev.filter(f => String(f).trim() !== target));

    // Update Master Data (Recalculate from remaining data)
    // We pass masterData as legacy to preserve targets, but metrics will be re-derived from reduced data
    const nextMasterData = processConsolidatedData(nextData, masterData);
    setMasterData(nextMasterData);
  };

  const handleClearAll = () => {
    // 直接清空數據，移除 window.confirm 以避免某些環境下對話框被阻擋
    setData([]);
    setMasterData([]); // Clear master table
    setColumns([]);
    setLoadedFiles([]);
    setErrorMsg(null);
    setResetKey(prev => prev + 1);
    
    if (headerFileInputRef.current) {
        headerFileInputRef.current.value = '';
    }

    setStatus(AppStatus.IDLE);
    setActiveTab('master');
  };

  const handleTabChange = (tab: 'master' | 'monthly' | 'raw') => {
      setActiveTab(tab);
      setSidebarOpen(false); // Mobile: close sidebar on selection
  };

  if (status === AppStatus.IDLE || status === AppStatus.PROCESSING) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center p-4 relative overflow-y-auto bg-[#fcfbf9]">
        {/* Background Sketch Effect */}
        <div className="absolute inset-0 z-0 opacity-10 pointer-events-none fixed" 
             style={{ 
               backgroundImage: 'radial-gradient(circle at 20% 20%, #a8a29e 1px, transparent 1px), radial-gradient(circle at 80% 80%, #fbbf24 1px, transparent 1px)', 
               backgroundSize: '40px 40px' 
             }}>
        </div>

        <div className="max-w-4xl w-full bg-white rounded-3xl shadow-2xl overflow-hidden relative z-10 grid grid-cols-1 md:grid-cols-2 paper-card border-2 border-stone-200 my-auto">
           {/* Left Side - Hero */}
           <div className="bg-[#fcfbf9] p-8 md:p-10 flex flex-col justify-between relative border-b-2 md:border-b-0 md:border-r-2 border-dashed border-stone-200">
              <div>
                <div className="flex items-center gap-3 mb-6">
                   <ChurchLogo />
                   <h1 className="text-2xl md:text-3xl font-black text-stone-800 tracking-tight serif-font">雲嘉眾召會<br/><span className="text-[#b45309]">數據統整平台</span></h1>
                </div>
                <p className="text-stone-500 leading-relaxed mb-8 font-medium text-sm md:text-base">
                  專為召會設計的數據處理系統。匯入 CSV/JSON 報表或專案檔，自動同步數據並生成分析報告。(單機版)
                </p>
                <PencilScribble className="w-full max-w-[200px] mb-8" />
              </div>
              
              <div className="space-y-4">
                 <div className="flex items-center gap-3 text-stone-600">
                    <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center border border-blue-200">
                      <FileSpreadsheet size={16} className="text-blue-700" />
                    </div>
                    <span className="text-sm font-medium">自動合併各會所報表</span>
                 </div>
                 <div className="flex items-center gap-3 text-stone-600">
                    <div className="w-8 h-8 rounded-full bg-yellow-100 flex items-center justify-center border border-yellow-200">
                      <Table size={16} className="text-yellow-700" />
                    </div>
                    <span className="text-sm font-medium">即時預覽與編輯數據</span>
                 </div>
              </div>
           </div>

           {/* Right Side - Action */}
           <div className="p-8 md:p-10 bg-white flex flex-col justify-center">
                <div className="space-y-6 animate-fade-in">
                  <div>
                    <h3 className="text-lg font-bold text-stone-800 mb-2 flex items-center gap-2">
                       <PlusCircle size={20} className="text-yellow-500" />
                       開始新統計
                    </h3>
                    <p className="text-xs text-stone-400 mb-4">您可以直接開始，或先上傳既有的 Excel/CSV 檔案。</p>
                  </div>
                  
                  <FileUpload onFilesSelected={handleStartProject} isLoading={status === AppStatus.PROCESSING} />
                  
                  <button 
                    onClick={() => handleStartProject([])}
                    className="w-full py-3 bg-stone-800 hover:bg-black text-white rounded-xl font-bold transition-all shadow-lg hover:shadow-xl flex items-center justify-center gap-2 group"
                  >
                    直接建立空白專案
                    <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
                  </button>
                </div>
           </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen flex overflow-hidden bg-[#fcfbf9] relative">
      {/* Mobile Sidebar Overlay */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/30 z-30 md:hidden backdrop-blur-sm transition-opacity" 
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar Navigation */}
      <div className={`
        fixed md:relative top-0 left-0 h-full w-64 bg-stone-50 border-r border-stone-200 
        flex flex-col shrink-0 z-40 shadow-xl md:shadow-sm transform transition-transform duration-300 ease-in-out
        ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
      `}>
        <div className="p-6 border-b border-stone-200 border-dashed bg-white flex justify-between items-center">
          <div className="flex items-center gap-3">
             <div className="w-10 h-10 rounded-full bg-stone-800 flex items-center justify-center text-white font-black shadow-md">
               <FileSpreadsheet size={20} />
             </div>
             <div>
               <h2 className="text-sm font-bold text-stone-500 uppercase tracking-wider">Statistical Report</h2>
               <div className="text-xl font-black text-stone-800 tracking-tight font-mono">統計報表</div>
             </div>
          </div>
          {/* Close button for mobile */}
          <button onClick={() => setSidebarOpen(false)} className="md:hidden text-stone-400 hover:text-stone-600">
             <X size={20} />
          </button>
        </div>

        <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
          <div className="mb-4 px-2">
            <h3 className="text-xs font-bold text-stone-400 uppercase tracking-wider mb-3">報表檢視</h3>
            
            <button
              onClick={() => handleTabChange('master')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 text-left group
                ${activeTab === 'master' 
                  ? 'bg-white shadow-md text-stone-800 border border-stone-100' 
                  : 'text-stone-500 hover:bg-stone-100 hover:text-stone-700'}`}
            >
              <div className={`p-2 rounded-lg ${activeTab === 'master' ? 'bg-yellow-100 text-yellow-700' : 'bg-stone-100 text-stone-400 group-hover:bg-stone-200'}`}>
                <LayoutDashboard size={18} />
              </div>
              <span className="font-bold text-sm">總表<br/><span className="text-[10px] font-normal">(各項人數統計)</span></span>
            </button>

            <button
              onClick={() => handleTabChange('monthly')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 text-left mt-2 group
                ${activeTab === 'monthly' 
                  ? 'bg-white shadow-md text-stone-800 border border-stone-100' 
                  : 'text-stone-500 hover:bg-stone-100 hover:text-stone-700'}`}
            >
              <div className={`p-2 rounded-lg ${activeTab === 'monthly' ? 'bg-blue-100 text-blue-700' : 'bg-stone-100 text-stone-400 group-hover:bg-stone-200'}`}>
                <FileSpreadsheet size={18} />
              </div>
              <span className="font-bold text-sm">月報表<br/><span className="text-[10px] font-normal">(單週的數據合併)</span></span>
            </button>
          </div>

          <div className="mb-4 px-2">
            <h3 className="text-xs font-bold text-stone-400 uppercase tracking-wider mb-3">數據來源</h3>
            <button
              onClick={() => handleTabChange('raw')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 text-left group
                ${activeTab === 'raw' 
                  ? 'bg-white shadow-md text-stone-800 border border-stone-100' 
                  : 'text-stone-500 hover:bg-stone-100 hover:text-stone-700'}`}
            >
               <div className={`p-2 rounded-lg ${activeTab === 'raw' ? 'bg-purple-100 text-purple-700' : 'bg-stone-100 text-stone-400 group-hover:bg-stone-200'}`}>
                <Database size={18} />
              </div>
              <div className="flex-1 min-w-0">
                <span className="font-bold block">原始數據</span>
                <span className="text-[10px] text-stone-400 truncate block">{data.length} 筆資料</span>
              </div>
            </button>
          </div>

          <div className="mt-8 px-2">
            <h3 className="text-xs font-bold text-stone-400 uppercase tracking-wider mb-3">檔案管理</h3>
            <div className="bg-stone-100 rounded-xl p-3 border border-stone-200">
               <div className="text-xs font-medium text-stone-500 mb-3 flex justify-between items-center">
                 <span>已載入數量</span>
                 <span className="bg-stone-200 text-stone-700 px-2 py-0.5 rounded-full text-[10px] font-bold">{loadedFiles.length} 份</span>
               </div>
               
               {(loadedFiles.length > 0 || data.length > 0) && (
                 <button 
                   type="button"
                   onClick={handleClearAll}
                   className="w-full mb-2 py-2 bg-white border border-stone-200 hover:border-red-300 hover:bg-red-50 hover:text-red-600 text-stone-500 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-2 shadow-sm cursor-pointer"
                 >
                   <Trash2 size={14} />
                   清空所有數據
                 </button>
               )}
               
               <button 
                 type="button"
                 onClick={(e) => {
                     e.currentTarget.blur();
                     headerFileInputRef.current?.click();
                 }}
                 className="w-full py-2 bg-white border border-stone-300 hover:border-blue-400 hover:text-blue-600 text-stone-600 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-2 shadow-sm cursor-pointer"
               >
                 <UploadCloud size={14} />
                 上傳更多月報表
               </button>
               <input 
                  type="file" 
                  multiple 
                  accept=".csv,.json,.xls,.xlsx" 
                  style={{ display: 'none' }}
                  ref={headerFileInputRef} 
                  onChange={handleRoomFileUpload} 
               />
            </div>
          </div>
        </nav>

        <div className="p-4 border-t border-stone-200 text-[10px] text-stone-400 text-center">
           系統狀態: {status === AppStatus.READY ? '就緒' : '處理中...'}
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 h-full bg-stone-50/50 w-full relative">
        {errorMsg && (
          <div className="absolute top-16 left-1/2 -translate-x-1/2 z-50 bg-red-50 border-l-4 border-red-500 text-red-700 p-4 rounded shadow-lg flex items-center gap-3 animate-fade-in mx-4 max-w-[90%]">
            <AlertCircle size={20} />
            <span className="font-medium">{errorMsg}</span>
            <button onClick={() => setErrorMsg(null)} className="ml-2 hover:bg-red-100 p-1 rounded"><X size={16}/></button>
          </div>
        )}

        {/* Mobile Header Bar */}
        <div className="md:hidden flex items-center justify-between p-4 bg-white border-b border-stone-200 sticky top-0 z-20 shadow-sm">
           <div className="flex items-center gap-3">
              <button 
                onClick={() => setSidebarOpen(true)}
                className="p-2 -ml-2 text-stone-600 hover:bg-stone-100 rounded-lg"
              >
                 <Menu size={24} />
              </button>
              <h1 className="font-bold text-stone-800 text-lg serif-font">雲嘉眾召會數據統整</h1>
           </div>
        </div>

        <div className="flex-1 overflow-hidden relative flex flex-col">
          {activeTab === 'master' && (
            <ConsolidatedTable 
              key={resetKey}
              data={data} // Master table needs raw data to initialize if empty
              masterData={masterData} // Pass the lifted state
              setMasterData={setMasterData} // Pass the updater
              newDataToMerge={null}
              onDataOverride={handleDataOverride}
            />
          )}

          {activeTab === 'monthly' && (
            <div className="h-full flex flex-col">
              {/* Monthly Report View - Uses dedicated MonthlyReportTable */}
              {data.length > 0 ? (
                <MonthlyReportTable 
                   key={resetKey}
                   data={data} 
                   onRemoveFile={handleRemoveFile}
                   onUpdate={handleMonthlyDataUpdate}
                />
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-stone-400 p-8 text-center">
                  <FileSpreadsheet size={48} className="mb-4 text-stone-300" />
                  <p className="text-lg font-bold mb-2">尚未產生月報表</p>
                  <p className="text-sm max-w-xs">請從左側側邊欄「上傳更多月報表」匯入 Excel 檔案，系統將自動彙整。</p>
                </div>
              )}
            </div>
          )}

          {activeTab === 'raw' && (
             <div className="h-full p-4 md:p-6 overflow-hidden flex flex-col">
               <h2 className="text-xl font-bold text-stone-800 mb-4 flex items-center gap-2 serif-font">
                 <Database size={24} className="text-purple-600" />
                 原始數據檢視
               </h2>
               {data.length > 0 ? (
                 <DataTable key={resetKey} data={data} columns={columns} onDataUpdate={handleRawDataUpdate} />
               ) : (
                 <div className="flex-1 flex items-center justify-center border-2 border-dashed border-stone-200 rounded-xl bg-stone-50">
                   <p className="text-stone-400 font-bold">無數據資料</p>
                 </div>
               )}
             </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default App;
