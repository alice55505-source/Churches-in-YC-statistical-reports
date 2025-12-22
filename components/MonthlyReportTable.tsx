
import React, { useState, useMemo, useEffect } from 'react';
import { DataRow } from '../types';
import { processMonthlyReport, MonthlyMetricRow } from '../utils/monthlyHelpers';
import { Download, Filter, Info, FileText, Trash2, Edit3 } from 'lucide-react';
import { utils, writeFile } from 'xlsx';

interface MonthlyReportTableProps {
  data: DataRow[];
  onRemoveFile?: (fileName: string) => void;
  onUpdate?: (churchName: string, field: string, value: number) => void;
}

interface FileMetadata {
    fileName: string;
    church: string;
}

// Simple Editable Cell (similar to ConsolidatedTable but localized)
const MonthlyEditableCell: React.FC<{
    value: number;
    onChange: (val: number) => void;
    isSubtotal?: boolean;
}> = ({ value, onChange, isSubtotal }) => {
    const [isEditing, setIsEditing] = useState(false);
    const [inputValue, setInputValue] = useState(String(value));

    useEffect(() => {
        setInputValue(String(value));
    }, [value]);

    if (isSubtotal) {
        return <span>{value}</span>;
    }

    const handleBlur = () => {
        setIsEditing(false);
        const num = parseFloat(inputValue);
        if (!isNaN(num) && num !== value) {
            onChange(num);
        } else {
            setInputValue(String(value));
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            e.currentTarget.blur();
        }
    };

    return (
        <div 
            className={`w-full h-full min-h-[1.5rem] flex items-center justify-center cursor-pointer px-1 rounded transition-colors ${isEditing ? 'bg-white ring-2 ring-blue-400' : 'hover:bg-blue-50/50 hover:text-blue-800'}`}
            onClick={() => setIsEditing(true)}
        >
            {isEditing ? (
                <input
                    type="number"
                    className="w-full h-full text-center bg-transparent outline-none p-0 m-0 font-bold"
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onBlur={handleBlur}
                    onKeyDown={handleKeyDown}
                    autoFocus
                    onClick={(e) => e.stopPropagation()}
                />
            ) : (
                <span>{value || '-'}</span>
            )}
        </div>
    );
};

const MonthlyReportTable: React.FC<MonthlyReportTableProps> = ({ data, onRemoveFile, onUpdate }) => {
  const [title, setTitle] = useState('各項統計數據月報表');
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [selectedChurch, setSelectedChurch] = useState<string>('all');
  const [showSourceInfo, setShowSourceInfo] = useState<boolean>(true);

  const processedData = useMemo(() => {
    return processMonthlyReport(data);
  }, [data]);

  // Extract Metadata: Group Files by Church
  const sourceMetadata = useMemo<Record<string, FileMetadata[]>>(() => {
    const meta: Record<string, FileMetadata[]> = {};
    const processedFiles = new Set<string>();

    data.forEach(row => {
        const fileName = String(row['來源報表'] || '');
        if (!fileName || processedFiles.has(fileName)) return;
        
        // Simple extraction of church name (heuristic)
        let church = '其他';
        const possibleChurches = processedData.filter(r => !r.isSubtotal).map(r => r.name);
        
        // Find which church this row/file likely belongs to
        // Prioritize finding church name in filename
        const foundInName = possibleChurches.find(c => fileName.includes(c));
        if (foundInName) {
            church = foundInName;
        } else {
            // Fallback to checking content
            const foundInContent = possibleChurches.find(c => Object.values(row).some(v => String(v).includes(c)));
            if (foundInContent) church = foundInContent;
        }

        if (!meta[church]) meta[church] = [];
        meta[church].push({ fileName, church });
        processedFiles.add(fileName);
    });

    return meta;
  }, [data, processedData]);

  const displayedData = useMemo(() => {
    if (selectedChurch === 'all') return processedData;
    return processedData.filter(r => r.name === selectedChurch || r.isGrandTotal);
  }, [processedData, selectedChurch]);

  const churchOptions = useMemo(() => {
    return processedData
      .filter(r => !r.isSubtotal && !r.isGrandTotal)
      .map(r => r.name);
  }, [processedData]);

  const handleExport = () => {
    // 1. 定義表頭結構 (Array of Arrays)
    const header1 = [
        "召會",
        "一、受浸人數", null,
        "二、主日 (平均)", null, null, null, null,
        "三、福音出訪", null,
        "四、家聚會", null,
        "五、生命讀經", null, null, null,
        "六、小排", null, null, null // [Modified] Added one more null for colspan 4
    ];

    const header2 = [
        null, // 召會 placeholder
        "點名系統", "線上表單",
        "兒童", "青少年", "大專", "青職", "全召會",
        "青職", "全召會",
        "青職", "全召會",
        "青少年", "大專", "青職", "全召會",
        "兒童", "青少年", "大專", "青職" // [Modified] Added 大專
    ];

    // 2. 轉換資料列
    const rows = processedData.map(row => [
        row.name,
        row.bap_roll_call, row.bap_online,
        row.sun_child, row.sun_teen, row.sun_uni, row.sun_ya, row.sun_total,
        row.gospel_ya, row.gospel_total,
        row.home_ya, row.home_total,
        row.life_teen, row.life_uni, row.life_ya, row.life_total,
        row.group_child, row.group_teen, row.group_uni, row.group_ya // [Modified] Added group_uni
    ]);

    // 3. 建立 Worksheet
    const ws = utils.aoa_to_sheet([header1, header2, ...rows]);

    // 4. 設定合併儲存格 (!merges)
    ws['!merges'] = [
        { s: {r:0, c:0}, e: {r:1, c:0} }, // 召會 (Row 0-1)
        { s: {r:0, c:1}, e: {r:0, c:2} }, // 受浸 (Col 1-2)
        { s: {r:0, c:3}, e: {r:0, c:7} }, // 主日 (Col 3-7)
        { s: {r:0, c:8}, e: {r:0, c:9} }, // 福音 (Col 8-9)
        { s: {r:0, c:10}, e: {r:0, c:11} }, // 家聚會 (Col 10-11)
        { s: {r:0, c:12}, e: {r:0, c:15} }, // 生命讀經 (Col 12-15)
        { s: {r:0, c:16}, e: {r:0, c:19} }, // 小排 (Col 16-19) [Modified] Expanded range
    ];

    // 5. 設定欄寬 (!cols)
    ws['!cols'] = [
        { wch: 12 }, // Name
        { wch: 10 }, { wch: 10 }, // Baptism
        { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 10 }, // Sunday
        { wch: 8 }, { wch: 8 }, // Gospel
        { wch: 8 }, { wch: 8 }, // Home
        { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 8 }, // Life
        { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 8 } // Group [Modified] Added one col
    ];

    // 6. 設定凍結窗格 (前2列，前1欄)
    ws['!freeze'] = { xSplit: 1, ySplit: 2 };

    const wb = utils.book_new();
    utils.book_append_sheet(wb, ws, "月報表");
    writeFile(wb, `${title}.xlsx`);
  };

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Toolbar */}
      <div className="px-6 py-3 border-b-2 border-dashed border-stone-200 flex flex-col gap-3 bg-[#fcfbf9] sticky left-0 top-0 z-30 shadow-sm">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-4 w-full md:w-auto">
                {/* Editable Title */}
                <div className="flex items-center gap-2">
                    {isEditingTitle ? (
                        <input
                            autoFocus
                            type="text"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            onBlur={() => setIsEditingTitle(false)}
                            onKeyDown={(e) => e.key === 'Enter' && setIsEditingTitle(false)}
                            className="text-lg font-black text-stone-800 bg-transparent border-b-2 border-stone-800 outline-none serif-font w-full sm:w-64"
                        />
                    ) : (
                        <div className="flex items-center gap-2 group cursor-pointer" onClick={() => setIsEditingTitle(true)}>
                            <h2 className="text-lg font-black text-stone-800 serif-font whitespace-nowrap">{title}</h2>
                            <Edit3 size={16} className="text-stone-300 group-hover:text-stone-500 transition-colors shrink-0" />
                        </div>
                    )}
                </div>

                <div className="flex items-center gap-2 bg-white border border-stone-300 rounded-lg px-3 py-1.5 shadow-sm w-full sm:w-auto">
                    <Filter size={16} className="text-stone-400 shrink-0" />
                    <span className="text-sm font-bold text-stone-600 whitespace-nowrap">召會篩選:</span>
                    <select 
                    value={selectedChurch} 
                    onChange={(e) => setSelectedChurch(e.target.value)}
                    className="bg-transparent font-bold text-stone-800 outline-none cursor-pointer w-full"
                    >
                    <option value="all">顯示全部 (All)</option>
                    {churchOptions.map(c => (
                        <option key={c} value={c}>{c}</option>
                    ))}
                    </select>
                </div>
            </div>

            <div className="flex items-center gap-2 w-full md:w-auto overflow-x-auto no-scrollbar">
                <button 
                    onClick={() => setShowSourceInfo(!showSourceInfo)}
                    className={`flex items-center gap-2 px-3 py-2 text-xs font-bold rounded border transition-all whitespace-nowrap ${showSourceInfo ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-white text-stone-500 border-stone-200'}`}
                >
                    <Info size={14} />
                    資料來源概況
                </button>
                <button
                onClick={handleExport}
                className="flex items-center gap-2 px-4 py-2 bg-stone-700 hover:bg-stone-800 text-white text-sm font-bold rounded shadow-md transition-all active:translate-y-0.5 whitespace-nowrap"
                >
                <Download size={16} />
                匯出 Excel
                </button>
            </div>
        </div>

        {/* Source Metadata Summary Panel */}
        {showSourceInfo && (
            <div className="text-xs bg-white border border-stone-200 rounded-lg p-3 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 animate-fade-in max-h-[200px] overflow-y-auto custom-scrollbar">
                {Object.entries(sourceMetadata).map(([church, files]) => {
                    const fileList = files as FileMetadata[];
                    if (fileList.length === 0 || (church === '其他' && fileList.length === 0)) return null;
                    return (
                        <div key={church} className="flex flex-col gap-1 border border-stone-100 rounded p-2 bg-stone-50">
                             <div className="font-bold text-stone-800 border-b border-stone-200 pb-1 mb-1">{church}</div>
                             <div className="flex flex-col gap-1">
                                {fileList.map((file) => (
                                    <div key={file.fileName} className="flex items-center justify-between gap-2 bg-white px-2 py-1 rounded border border-stone-100 group min-h-[36px] hover:border-blue-200 hover:shadow-sm transition-all relative">
                                        <div className="flex items-center gap-2 overflow-hidden flex-1 min-w-0">
                                            <FileText size={14} className="text-stone-400 shrink-0" />
                                            <span className="text-stone-600 truncate font-medium" title={file.fileName}>{file.fileName}</span>
                                        </div>
                                        {onRemoveFile && (
                                            <button 
                                                type="button"
                                                onClick={(e) => {
                                                    e.preventDefault();
                                                    e.stopPropagation();
                                                    onRemoveFile(file.fileName);
                                                }}
                                                className="relative z-50 shrink-0 text-stone-400 hover:text-red-600 hover:bg-red-100 p-2 rounded-lg transition-colors cursor-pointer active:scale-95 bg-transparent border-none"
                                                title="刪除此檔案"
                                            >
                                                <Trash2 size={16} className="pointer-events-none" />
                                            </button>
                                        )}
                                    </div>
                                ))}
                             </div>
                        </div>
                    );
                })}
                {Object.keys(sourceMetadata).length === 0 && <div className="text-stone-400 italic">尚無來源資料</div>}
            </div>
        )}
      </div>

      {/* Table */}
      <div className="overflow-auto flex-1 custom-scrollbar p-2">
        <table className="w-full text-xs border-separate border-spacing-0 text-center font-sans min-w-[1300px]">
          <thead className="sticky top-0 z-20 text-stone-800 tracking-wide shadow-sm">
            {/* Level 1 Header */}
            <tr>
              <th rowSpan={2} className="border-r-2 border-b-2 border-stone-200 bg-stone-100 w-24 sticky left-0 z-30 font-black text-sm serif-font text-stone-700">召會</th>
              
              <th colSpan={2} className="border-l-2 border-b border-[#fcd34d] bg-[#fef3c7] py-2 font-bold text-[#92400e]">一、受浸人數</th>
              <th colSpan={5} className="border-l-2 border-b border-[#fda4af] bg-[#ffe4e6] py-2 font-bold text-[#9f1239]">二、主日 (平均)</th>
              <th colSpan={2} className="border-l-2 border-b border-[#bae6fd] bg-[#f0f9ff] py-2 font-bold text-[#0369a1]">三、福音出訪</th>
              <th colSpan={2} className="border-l-2 border-b border-[#bae6fd] bg-[#f0f9ff] py-2 font-bold text-[#0369a1]">四、家聚會</th>
              <th colSpan={4} className="border-l-2 border-b border-[#7dd3fc] bg-[#e0f2fe] py-2 font-bold text-[#075985]">五、生命讀經</th>
              <th colSpan={4} className="border-l-2 border-b border-[#86efac] bg-[#dcfce7] py-2 font-bold text-[#166534]">六、小排</th>
            </tr>
            
            {/* Level 2 Header */}
            <tr className="text-[11px] text-stone-600 font-bold">
              {/* Baptism */}
              <th className="border-r border-b border-[#fcd34d] bg-[#fffbeb] py-2" title="今年受浸小計">點名系統</th>
              <th className="border-r border-b border-[#fcd34d] bg-[#fffbeb] py-2">線上表單</th>

              {/* Sunday */}
              <th className="border-r border-b border-[#fda4af] bg-[#fff1f2] py-2" title="兒童主日小計">兒童</th>
              <th className="border-r border-b border-[#fda4af] bg-[#fff1f2] py-2">青少年</th>
              <th className="border-r border-b border-[#fda4af] bg-[#fff1f2] py-2">大專</th>
              <th className="border-r border-b border-[#fda4af] bg-[#fff1f2] py-2">青職</th>
              <th className="border-r border-b border-[#fda4af] bg-[#fff1f2] py-2 font-black text-[#9f1239]" title="主日小計">全召會</th>

              {/* Gospel */}
              <th className="border-r border-b border-[#bae6fd] bg-[#f0f9ff] py-2">青職</th>
              <th className="border-r border-b border-[#bae6fd] bg-[#f0f9ff] py-2">全召會</th>

              {/* Home Meeting */}
              <th className="border-r border-b border-[#bae6fd] bg-[#f0f9ff] py-2">青職</th>
              <th className="border-r border-b border-[#bae6fd] bg-[#f0f9ff] py-2">全召會</th>

              {/* Life Study */}
              <th className="border-r border-b border-[#7dd3fc] bg-[#f0f9ff] py-2">青少年</th>
              <th className="border-r border-b border-[#7dd3fc] bg-[#f0f9ff] py-2">大專</th>
              <th className="border-r border-b border-[#7dd3fc] bg-[#f0f9ff] py-2">青職</th>
              <th className="border-r border-b border-[#7dd3fc] bg-[#f0f9ff] py-2">全召會</th>

              {/* Group */}
              <th className="border-r border-b border-[#86efac] bg-[#f0fdf4] py-2">兒童</th>
              <th className="border-r border-b border-[#86efac] bg-[#f0fdf4] py-2">青少年</th>
              <th className="border-r border-b border-[#86efac] bg-[#f0fdf4] py-2">大專</th>
              <th className="border-r border-b border-[#86efac] bg-[#f0fdf4] py-2">青職</th>
            </tr>
          </thead>

          <tbody className="bg-white">
            {displayedData.map((row, idx) => {
              let rowClass = "hover:bg-yellow-50 transition-colors";
              let stickyClass = "bg-white group-hover:bg-yellow-50";

              if (row.isGrandTotal) {
                 rowClass = "bg-stone-800 text-white font-bold hover:bg-stone-700";
                 stickyClass = "bg-stone-800 text-white";
              } else if (row.isSubtotal) {
                 rowClass = "bg-stone-50 font-bold text-stone-900 border-t-2 border-stone-200";
                 stickyClass = "bg-stone-50";
              }

              const cell = (bg: string = "") => `border-r border-b border-stone-100 px-1 py-2 ${row.isGrandTotal ? 'border-stone-600' : ''} ${bg}`;

              return (
                <tr key={idx} className={`${rowClass} group`}>
                   <td className={`border-r-2 border-b border-stone-200 px-2 py-2 text-left sticky left-0 z-10 font-bold serif-font ${stickyClass}`}>
                     {row.name}
                   </td>
                   
                   {/* Baptism */}
                   <td className={cell("bg-yellow-50/50 font-bold text-[#b45309]")} title={row.details?.['bap_roll_call']}>{row.bap_roll_call}</td>
                   {/* Online Baptism - Editable */}
                   <td className={cell("bg-yellow-50/20 text-stone-600 font-bold")} title={row.details?.['bap_online']}>
                        {onUpdate && !row.isSubtotal && !row.isGrandTotal ? (
                            <MonthlyEditableCell 
                                value={row.bap_online} 
                                onChange={(val) => onUpdate(row.name, 'bap_online', val)} 
                            />
                        ) : (
                            <span>{row.bap_online || '-'}</span>
                        )}
                   </td>

                   {/* Sunday */}
                   <td className={cell()} title={row.details?.['sun_child']}>{row.sun_child}</td>
                   <td className={cell()} title={row.details?.['sun_teen']}>{row.sun_teen}</td>
                   <td className={cell()} title={row.details?.['sun_uni']}>{row.sun_uni}</td>
                   <td className={cell("font-semibold")} title={row.details?.['sun_ya']}>{row.sun_ya}</td>
                   <td className={cell("bg-[#ffe4e6]/50 font-black text-[#9f1239]")} title={row.details?.['sun_total']}>{row.sun_total}</td>

                   {/* Gospel */}
                   <td className={cell()} title={row.details?.['gospel_ya']}>{row.gospel_ya}</td>
                   <td className={cell()} title={row.details?.['gospel_total']}>{row.gospel_total}</td>

                   {/* Home Meeting */}
                   <td className={cell()} title={row.details?.['home_ya']}>{row.home_ya}</td>
                   <td className={cell()} title={row.details?.['home_total']}>{row.home_total}</td>

                   {/* Life Study */}
                   <td className={cell()} title={row.details?.['life_teen']}>{row.life_teen}</td>
                   <td className={cell()} title={row.details?.['life_uni']}>{row.life_uni}</td>
                   <td className={cell()} title={row.details?.['life_ya']}>{row.life_ya}</td>
                   <td className={cell()} title={row.details?.['life_total']}>{row.life_total}</td>

                   {/* Group */}
                   <td className={cell()} title={row.details?.['group_child']}>{row.group_child}</td>
                   <td className={cell()} title={row.details?.['group_teen']}>{row.group_teen}</td>
                   <td className={cell()} title={row.details?.['group_uni']}>{row.group_uni}</td>
                   <td className={cell()} title={row.details?.['group_ya']}>{row.group_ya}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default MonthlyReportTable;
