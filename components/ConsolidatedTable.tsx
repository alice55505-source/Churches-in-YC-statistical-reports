
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Download, Edit3, Save, FileUp, Upload, Trash2, Target, Filter } from 'lucide-react';
import { DataRow } from '../types';
import { ProcessedRow, recalculateRow, recalculateSubtotals, mergeProcessedRows, processConsolidatedData } from '../utils/reportHelpers';
import { parseFile } from '../services/fileParser';
import { utils, writeFile } from 'xlsx';

interface ConsolidatedTableProps {
  data: DataRow[];
  masterData: ProcessedRow[];
  setMasterData: (rows: ProcessedRow[]) => void;
  newDataToMerge?: DataRow[] | null;
  onMergeComplete?: () => void;
  onDataOverride?: (newData: DataRow[]) => void;
}

interface EditableCellProps {
  value: number | string;
  onChange: (val: number) => void;
  isSubtotal: boolean;
  isPercentage?: boolean;
}

const EditableCell: React.FC<EditableCellProps> = ({ value, onChange, isSubtotal, isPercentage = false }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [inputValue, setInputValue] = useState(String(value).replace('%', ''));
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setInputValue(String(value).replace('%', ''));
  }, [value]);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  if (isSubtotal) {
    return <span className={`block w-full text-center ${isSubtotal ? 'font-black tracking-tight' : ''}`}>{value}</span>;
  }

  const handleBlur = () => {
    setIsEditing(false);
    const num = parseFloat(inputValue);
    if (!isNaN(num)) {
      onChange(num);
    } else {
      setInputValue(String(value).replace('%', ''));
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      e.currentTarget.blur();
    }
  };

  return (
    <div 
      className={`w-full h-full min-h-[2rem] flex items-center justify-center cursor-pointer transition-all px-1
        ${isEditing ? 'bg-white ring-2 ring-[#fbbf24] z-20 shadow-md' : 'hover:bg-stone-50 hover:text-stone-900'}`}
      onClick={() => !isPercentage && setIsEditing(true)}
      title={isPercentage ? "自動計算欄位" : "點擊編輯"}
    >
      {isEditing ? (
        <input
          ref={inputRef}
          type="number"
          step="any"
          className="w-full h-full text-center bg-transparent outline-none text-xs font-bold text-stone-800 p-0 m-0"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          onClick={(e) => e.stopPropagation()}
        />
      ) : (
        <span className="truncate w-full text-center block">{value}</span>
      )}
    </div>
  );
};

const ConsolidatedTable: React.FC<ConsolidatedTableProps> = ({ data, masterData, setMasterData, onDataOverride }) => {
  const [title, setTitle] = useState('總表');
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [selectedChurch, setSelectedChurch] = useState<string>('all');
  
  const projectFileInputRef = useRef<HTMLInputElement>(null);
  const baseFileInputRef = useRef<HTMLInputElement>(null);
  const targetFileInputRef = useRef<HTMLInputElement>(null);

  const churchOptions = useMemo(() => {
      return masterData
        .filter(r => !r.isSubtotal && !r.isGrandTotal && !r.isLastYear)
        .map(r => r.name);
  }, [masterData]);

  const displayedRows = useMemo(() => {
    return masterData.map((row, index) => ({ row, originalIndex: index })).filter(({ row }) => {
        if (selectedChurch === 'all') return true;
        return row.name === selectedChurch;
    });
  }, [masterData, selectedChurch]);

  const handleUpdate = (index: number, field: keyof ProcessedRow, newValue: number) => {
    const newData = [...masterData];
    const row = { ...newData[index] };
    
    // @ts-ignore
    row[field] = newValue;
    
    // Recalculate row (skip current field to preserve manual edit)
    newData[index] = recalculateRow(row, [field]);
    
    const finalData = recalculateSubtotals(newData);
    
    setMasterData(finalData);
  };

  const handleClearBase = () => {
    const newMasterData = masterData.map(row => {
        if (row.isSubtotal || row.isGrandTotal || row.isLastYear) return row;

        const newRow = { ...row };
        newRow.sun_ya_base = 0;
        newRow.sun_uni_base = 0;
        newRow.sun_teen_base = 0;
        newRow.sun_child_base = 0;
        newRow.sun_all_base = 0;
        newRow.bap_ya_target = 0;
        newRow.bap_uni_target = 0;
        newRow.bap_teen_target = 0;
        newRow.bap_youth_goal = 0;
        newRow.bap_all_goal = 0;
        newRow.cl_count = 0;
        
        return recalculateRow(newRow, ['bap_all_goal']);
    });

    const finalData = recalculateSubtotals(newMasterData);
    setMasterData(finalData);
    
    if (baseFileInputRef.current) baseFileInputRef.current.value = '';
    if (targetFileInputRef.current) targetFileInputRef.current.value = '';
  };

  const handleGenericImport = async (e: React.ChangeEvent<HTMLInputElement>, mode: 'BASE' | 'TARGET') => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    try {
        const rows = await parseFile(files[0]);
        if (rows.length === 0) {
            alert("檔案無資料");
            return;
        }

        const newMasterData = [...masterData];
        let updatedCount = 0;
        
        rows.forEach(sourceRow => {
            let churchNameRaw = String(sourceRow['召會'] || sourceRow['Name'] || sourceRow['名稱'] || sourceRow['召會名稱'] || '').trim();
            
            if (!churchNameRaw) {
                const keys = Object.keys(sourceRow);
                if (keys.length > 0) {
                   const firstVal = String(sourceRow[keys[0]]).trim();
                   if (firstVal.length > 0 && firstVal.length < 10) { 
                       churchNameRaw = firstVal;
                   }
                }
            }
            
            if (!churchNameRaw || ['召會', '總計', '合計', '小計', '統計'].some(k => churchNameRaw.includes(k)) || churchNameRaw.endsWith('區')) return;

            const targetIndex = newMasterData.findIndex(r => {
                 return r.name === churchNameRaw || r.name.includes(churchNameRaw) || churchNameRaw.includes(r.name);
            });

            if (targetIndex !== -1) {
                const row = { ...newMasterData[targetIndex] };
                let modified = false;

                const sheetName = String(sourceRow['工作表名稱'] || '');
                const fileName = String(sourceRow['來源報表'] || '');
                
                const isBaseSource = sheetName.includes('基數') || fileName.includes('基數');
                const isTargetSource = sheetName.includes('目標') || fileName.includes('目標');

                Object.keys(sourceRow).forEach(key => {
                    if (['來源報表', '工作表名稱', '召會', 'Name', '名稱'].includes(key)) return;

                    const rawVal = sourceRow[key];
                    if (rawVal === undefined || rawVal === null || rawVal === '') return;
                    
                    const numVal = typeof rawVal === 'string' 
                        ? parseFloat(rawVal.replace(/,/g, '').replace(/%/g, '')) 
                        : Number(rawVal);
                        
                    if (isNaN(numVal)) return;

                    const k = key.replace(/\s+/g, '').toLowerCase();

                    if (k.includes('%') || k.includes('率') || k.includes('rate') || k.includes('達成') || k.includes('比')) return;

                    const isExplicitActual = k.includes('實際') || k.includes('完成') || k.includes('actual') || k.includes('去年');
                    const isExplicitTarget = k.includes('目標') || k.includes('goal') || k.includes('target');
                    if (isExplicitActual && !isExplicitTarget) return;

                    let targetField: keyof ProcessedRow | null = null;

                    if (mode === 'BASE') {
                        const looksLikeBase = k.includes('基數') || k === 'base' || isBaseSource;
                        if (looksLikeBase && !isExplicitTarget) {
                            if (k.includes('青職')) targetField = 'sun_ya_base';
                            else if (k.includes('大學') || k.includes('大專')) targetField = 'sun_uni_base';
                            else if (k.includes('青少') || k.includes('中學') || k.includes('國高') || k.includes('國中') || k.includes('高中')) targetField = 'sun_teen_base';
                            else if (k.includes('含兒童') || k.includes('不含兒童')) targetField = 'sun_all_base';
                            else if (k.includes('兒童')) targetField = 'sun_child_base';
                            else if (k.includes('全召會') || k.includes('總計') || k.includes('合計') || k === '基數' || k === 'base') targetField = 'sun_all_base';
                        }
                    } else if (mode === 'TARGET') {
                        const isGenericKw = k.includes('受浸') || k.includes('人數') || k === 'target' || k === 'goal';
                        const hasGroupKw = k.includes('青職') || k.includes('大學') || k.includes('青少') || k.includes('兒童') || k.includes('青年') || k.includes('中學') || k.includes('國高') || k.includes('國中') || k.includes('高中');
                        const looksLikeTarget = isExplicitTarget || isTargetSource || (isGenericKw && !isBaseSource);

                        if (looksLikeTarget) {
                             if (k.includes('青職')) targetField = 'bap_ya_target';
                             else if (k.includes('大學') || k.includes('大專')) targetField = 'bap_uni_target';
                             else if (k.includes('青少') || k.includes('中學') || k.includes('國高') || k.includes('國中') || k.includes('高中')) targetField = 'bap_teen_target';
                             else if (k.includes('青年') && (k.includes('總') || k.includes('合'))) targetField = 'bap_youth_goal';
                             else if (k.includes('全召會')) targetField = 'bap_all_goal';
                             else if ((k.includes('總計') || k.includes('合計')) && !k.includes('青年')) targetField = 'bap_all_goal';
                             else if (isGenericKw && !hasGroupKw) targetField = 'bap_all_goal';
                        }
                    }

                    if (targetField) {
                        // @ts-ignore
                        row[targetField] = numVal;
                        modified = true;
                    }
                });

                if (modified) {
                    const fieldsToProtect: (keyof ProcessedRow)[] = [
                        'sun_ya_base', 'sun_uni_base', 'sun_teen_base', 'sun_child_base', 'sun_all_base',
                        'bap_ya_target', 'bap_uni_target', 'bap_teen_target', 'bap_all_goal'
                        // Removed 'bap_youth_goal' to allow auto-calculation from sub-targets
                    ];
                    newMasterData[targetIndex] = recalculateRow(row, fieldsToProtect);
                    updatedCount++;
                }
            }
        });

        if (updatedCount > 0) {
            const finalData = recalculateSubtotals(newMasterData);
            setMasterData(finalData);
            const typeText = mode === 'BASE' ? '基數' : '目標';
            alert(`匯入成功！已更新 ${updatedCount} 筆召會的${typeText}資料。`);
        } else {
            alert("未匹配到任何召會資料，請確認檔案內容格式。");
        }

    } catch (err) {
        console.error(err);
        alert("匯入失敗：檔案解析錯誤");
    } finally {
        if (e.target) e.target.value = '';
    }
  };

  const handleImportBase = (e: React.ChangeEvent<HTMLInputElement>) => handleGenericImport(e, 'BASE');
  const handleImportTarget = (e: React.ChangeEvent<HTMLInputElement>) => handleGenericImport(e, 'TARGET');

  const handleImportProject = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
        const reader = new FileReader();
        reader.onload = (evt) => {
            try {
                const content = evt.target?.result as string;
                const projectData = JSON.parse(content);
                
                if (!projectData.masterData || !Array.isArray(projectData.masterData)) {
                    throw new Error("Invalid project file format");
                }

                // Get Raw Data from Project
                const importedRaw = projectData.rawData || [];
                
                // Get Master Data from Project (Cleaned)
                // This contains targets and manually edited fields
                let importedMaster = projectData.masterData.map((row: ProcessedRow) => 
                    (row.isSubtotal || row.isGrandTotal || row.isLastYear) ? row : recalculateRow(row)
                );

                const isMerging = data.length > 0;
                let finalMaster: ProcessedRow[] = [];
                let finalRaw: DataRow[] = [];

                if (isMerging) {
                    // 合併 Raw Data
                    finalRaw = [...data, ...importedRaw];
                    
                    // 合併 Targets/Manuals
                    // 將當前的 masterData 與匯入的 masterData 合併，保留雙方的目標設定 (取最大值)
                    const mergedTargets = mergeProcessedRows(masterData, importedMaster);
                    
                    // 重新計算 Master Data
                    // 使用合併後的 Raw Data 重新計算統計值 (如主日平均、受浸實際人數)
                    // 並套用合併後的 Targets
                    finalMaster = processConsolidatedData(finalRaw, mergedTargets);
                    
                    alert("專案合併成功！資料已累加至現有報表。");
                } else {
                    finalRaw = importedRaw;
                    
                    // 覆蓋模式
                    // 使用匯入的 Raw Data 重新計算統計值
                    // 並套用匯入的 Targets
                    finalMaster = processConsolidatedData(finalRaw, importedMaster);
                    
                    setTitle(projectData.title || '總表');
                }

                // 同步更新 App 的 Raw Data State
                if (onDataOverride) {
                    onDataOverride(finalRaw);
                }

                // 更新 ConsolidatedTable 的 Master Data State
                setMasterData(finalMaster);
                
            } catch (err) {
                console.error("Failed to load project", err);
                alert("讀取專案檔失敗，請確認檔案格式");
            }
        };
        reader.readAsText(file);
    } catch (error) {
         console.error(error);
         alert("檔案讀取錯誤");
    }
    if (e.target) e.target.value = '';
  };

  const handleSaveProject = () => {
    const projectData = {
        title,
        masterData,
        rawData: data,
        timestamp: new Date().toISOString(),
        version: '2.0'
    };
    
    const blob = new Blob([JSON.stringify(projectData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    // 使用當前標題作為檔名
    a.download = `${title}_${new Date().toISOString().slice(0,10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleExport = () => {
    const header1 = [
      "召會名稱",
      "受浸人數 (Baptism)", null, null, null, null, null, null, null, null, null, null, null, null,
      "福家及生命讀經追求", null, null, null, null, null, null, null, null, null,
      "青年小排與弟兄姊妹之家", null, null, null, null, null, null,
      "主日聚會 (Sunday)", null, null, null, null, null, null, null, null, null, null, null,
      "召會生活人數"
    ];

    const header2 = [
      null, 
      "青少", null, "大學", null, "青職", null, "青年總計", null, null, "其他", "全召會", null, null,
      "福音出訪", null, null, null, "家聚會牧養", null, null, null, "生命讀經", null,
      "兒童", null, "青少", null, "大學", "青職", "大學入住",
      "兒童", null, "青少", null, "大學", null, "青職", null, null, "全召會", null, null,
      null
    ];

    const header3 = [
      null,
      "目標", "人數", "目標", "人數", "目標", "人數", "目標", "人數", "達成%", "人數", "目標", "人數", "達成%",
      "青職", "%", "全召會", "%", "青職", "%", "全召會", "%", "青職", "%",
      "排數", "人數", "排數", "人數", "人數", "人數", null,
      "基數", "人數", "基數", "人數", "基數", "人數", "基數", "人數", "佔比%", "基數", "人數", "年增%",
      null
    ];

    const parsePercent = (val: string | number) => {
        if (typeof val === 'number') return val;
        if (!val) return 0;
        const clean = String(val).replace('%', '');
        return parseFloat(clean) / 100;
    };

    const dataRows = masterData.map(row => [
      row.name,
      row.bap_teen_target, row.bap_teen_actual,
      row.bap_uni_target, row.bap_uni_actual,
      row.bap_ya_target, row.bap_ya_actual,
      row.bap_youth_goal, row.bap_youth_total, parsePercent(row.bap_youth_rate),
      row.bap_other_actual,
      row.bap_all_goal, row.bap_all_total, parsePercent(row.bap_all_rate),
      row.vis_ya_avg, parsePercent(row.vis_ya_rate),
      row.vis_all_avg, parsePercent(row.vis_all_rate),
      row.home_ya_avg, parsePercent(row.home_ya_rate),
      row.home_all_avg, parsePercent(row.home_all_rate),
      row.life_ya_avg, parsePercent(row.life_ya_rate),
      row.grp_child_cnt, row.grp_child_w_avg,
      row.grp_teen_cnt, row.grp_teen_avg,
      row.grp_uni_cnt,
      row.grp_ya_avg,
      row.uni_house_cnt,
      row.sun_child_base, row.sun_child_w_avg,
      row.sun_teen_base, row.sun_teen_avg,
      row.sun_uni_base, row.sun_uni_avg,
      row.sun_ya_base, row.sun_ya_avg, parsePercent(row.sun_ya_pct),
      row.sun_all_base, row.sun_all_avg, parsePercent(row.sun_all_yoy),
      row.cl_count
    ]);

    const ws = utils.aoa_to_sheet([header1, header2, header3, ...dataRows]);

    ws['!merges'] = [
      { s: { r: 0, c: 0 }, e: { r: 2, c: 0 } },
      { s: { r: 0, c: 1 }, e: { r: 0, c: 13 } },
      { s: { r: 1, c: 1 }, e: { r: 1, c: 2 } },
      { s: { r: 1, c: 3 }, e: { r: 1, c: 4 } },
      { s: { r: 1, c: 5 }, e: { r: 1, c: 6 } },
      { s: { r: 1, c: 7 }, e: { r: 1, c: 9 } },
      { s: { r: 1, c: 10 }, e: { r: 2, c: 10 } },
      { s: { r: 1, c: 11 }, e: { r: 1, c: 13 } },
      { s: { r: 0, c: 14 }, e: { r: 0, c: 23 } },
      { s: { r: 1, c: 14 }, e: { r: 1, c: 17 } },
      { s: { r: 1, c: 18 }, e: { r: 1, c: 21 } },
      { s: { r: 1, c: 22 }, e: { r: 1, c: 23 } },
      { s: { r: 0, c: 24 }, e: { r: 0, c: 30 } },
      { s: { r: 1, c: 24 }, e: { r: 1, c: 25 } },
      { s: { r: 1, c: 26 }, e: { r: 1, c: 27 } },
      { s: { r: 1, c: 30 }, e: { r: 2, c: 30 } },
      { s: { r: 0, c: 31 }, e: { r: 0, c: 42 } },
      { s: { r: 1, c: 31 }, e: { r: 1, c: 32 } },
      { s: { r: 1, c: 33 }, e: { r: 1, c: 34 } },
      { s: { r: 1, c: 35 }, e: { r: 1, c: 36 } },
      { s: { r: 1, c: 37 }, e: { r: 1, c: 39 } },
      { s: { r: 1, c: 40 }, e: { r: 1, c: 42 } },
      { s: { r: 0, c: 43 }, e: { r: 2, c: 43 } },
    ];
    ws['!cols'] = [
      { wch: 12 },
      { wch: 6 }, { wch: 6 }, { wch: 6 }, { wch: 6 }, { wch: 6 }, { wch: 6 }, { wch: 6 }, { wch: 6 }, { wch: 6 }, { wch: 6 }, { wch: 6 }, { wch: 6 }, { wch: 6 },
      { wch: 6 }, { wch: 6 }, { wch: 6 }, { wch: 6 }, { wch: 6 }, { wch: 6 }, { wch: 6 }, { wch: 6 }, { wch: 6 }, { wch: 6 },
      { wch: 5 }, { wch: 5 }, { wch: 5 }, { wch: 5 }, { wch: 6 }, { wch: 6 }, { wch: 8 },
      { wch: 6 }, { wch: 6 }, { wch: 6 }, { wch: 6 }, { wch: 6 }, { wch: 6 }, { wch: 6 }, { wch: 6 }, { wch: 6 }, { wch: 6 }, { wch: 6 }, { wch: 6 },
      { wch: 8 }
    ];
    ws['!freeze'] = { xSplit: 1, ySplit: 3 };

    const wb = utils.book_new();
    utils.book_append_sheet(wb, ws, "總表");
    // 使用自訂標題作為檔名
    writeFile(wb, `${title}_${new Date().toISOString().slice(0,10)}.xlsx`);
  };

  const renderCell = (row: ProcessedRow, index: number, key: keyof ProcessedRow, isPercent: boolean = false) => {
    const val = row[key];
    const isSub = !!row.isSubtotal || !!row.isGrandTotal || !!row.isLastYear;
    
    return (
      <EditableCell 
        value={val as string | number} 
        onChange={(v) => handleUpdate(index, key, v)}
        isSubtotal={isSub}
        isPercentage={isPercent}
      />
    );
  };

  const getRowClass = (row: ProcessedRow) => {
      if (row.isGrandTotal) return "bg-stone-800 text-white hover:bg-stone-700 font-bold";
      if (row.isSubtotal) return "bg-stone-100 font-bold text-stone-900 border-t-2 border-stone-200 hover:bg-stone-200";
      if (row.isLastYear) return "bg-gray-50 text-stone-500 italic border-t-4 border-double border-stone-200";
      return "hover:bg-yellow-50 transition-colors bg-white";
  };

  const getStickyClass = (row: ProcessedRow) => {
      if (row.isGrandTotal) return "bg-stone-800 text-white";
      if (row.isSubtotal) return "bg-stone-100";
      if (row.isLastYear) return "bg-gray-50";
      return "bg-white group-hover:bg-yellow-50";
  };

  return (
    <div className="flex flex-col h-full bg-white relative">
      <div className="px-6 py-3 border-b-2 border-dashed border-stone-200 flex flex-col md:flex-row justify-between items-center bg-[#fcfbf9] sticky left-0 top-0 z-30 shadow-sm gap-3">
         <div className="flex items-center gap-3 w-full md:w-auto">
            {isEditingTitle ? (
                <input 
                   autoFocus
                   type="text" 
                   value={title} 
                   onChange={(e) => setTitle(e.target.value)}
                   onBlur={() => setIsEditingTitle(false)}
                   onKeyDown={(e) => e.key === 'Enter' && setIsEditingTitle(false)}
                   className="text-xl md:text-2xl font-black text-stone-800 bg-transparent border-b-2 border-stone-800 outline-none serif-font w-full md:w-64"
                />
            ) : (
                <div className="flex items-center gap-2 group cursor-pointer" onClick={() => setIsEditingTitle(true)}>
                    <h2 className="text-xl md:text-2xl font-black text-stone-800 serif-font truncate">{title}</h2>
                    <Edit3 size={16} className="text-stone-300 group-hover:text-stone-500 transition-colors shrink-0" />
                </div>
            )}
            <span className="text-xs font-bold text-stone-400 bg-stone-100 px-2 py-1 rounded-full whitespace-nowrap hidden sm:inline-block">
               {masterData.filter(r => !r.isSubtotal && !r.isGrandTotal && !r.isLastYear).length} 處召會
            </span>
            
            <div className="flex items-center gap-2 bg-white border border-stone-300 rounded-lg px-2 py-1 shadow-sm ml-2">
                <Filter size={14} className="text-stone-400" />
                <select
                    value={selectedChurch}
                    onChange={(e) => setSelectedChurch(e.target.value)}
                    className="bg-transparent text-xs font-bold text-stone-700 outline-none cursor-pointer min-w-[100px]"
                >
                    <option value="all">顯示全部召會</option>
                    {churchOptions.map(c => (
                        <option key={c} value={c}>{c}</option>
                    ))}
                </select>
            </div>
         </div>

         <div className="flex items-center gap-2 w-full md:w-auto overflow-x-auto no-scrollbar">
            <input type="file" ref={baseFileInputRef} className="hidden" accept=".xlsx,.csv" onChange={handleImportBase} />
            <button 
               onClick={() => baseFileInputRef.current?.click()}
               className="flex items-center gap-2 px-3 py-2 bg-white border border-stone-300 text-stone-600 text-xs md:text-sm font-bold rounded-lg hover:bg-stone-50 hover:border-stone-400 transition-all shadow-sm whitespace-nowrap"
               title="匯入主日基數設定檔"
            >
               <Upload size={16} />
               <span className="hidden lg:inline">匯入基數</span>
            </button>

            <input type="file" ref={targetFileInputRef} className="hidden" accept=".xlsx,.csv" onChange={handleImportTarget} />
            <button 
               onClick={() => targetFileInputRef.current?.click()}
               className="flex items-center gap-2 px-3 py-2 bg-white border border-stone-300 text-stone-600 text-xs md:text-sm font-bold rounded-lg hover:bg-yellow-50 hover:border-yellow-400 hover:text-yellow-700 transition-all shadow-sm whitespace-nowrap"
               title="匯入受浸與其他目標設定檔"
            >
               <Target size={16} />
               <span className="hidden lg:inline">匯入目標</span>
            </button>
            
            <button 
               onClick={handleClearBase}
               className="flex items-center gap-2 px-3 py-2 bg-white border border-stone-300 text-stone-600 text-xs md:text-sm font-bold rounded-lg hover:bg-red-50 hover:border-red-300 hover:text-red-600 transition-all shadow-sm whitespace-nowrap"
               title="清除所有基數與目標"
            >
               <Trash2 size={16} />
               <span className="hidden lg:inline">清除設定</span>
            </button>

            <input type="file" ref={projectFileInputRef} className="hidden" accept=".json" onChange={handleImportProject} />
            <button 
               onClick={() => projectFileInputRef.current?.click()}
               className="flex items-center gap-2 px-3 py-2 bg-white border border-stone-300 text-stone-600 text-xs md:text-sm font-bold rounded-lg hover:bg-stone-50 hover:border-stone-400 transition-all shadow-sm whitespace-nowrap"
               title="匯入 .json 專案檔"
            >
               <FileUp size={16} />
               <span className="hidden lg:inline">匯入專案</span>
            </button>

            <button 
               onClick={handleSaveProject}
               className="flex items-center gap-2 px-3 py-2 bg-white border border-stone-300 text-stone-600 text-xs md:text-sm font-bold rounded-lg hover:bg-stone-50 hover:border-stone-400 transition-all shadow-sm whitespace-nowrap"
               title="儲存為 .json 專案檔"
            >
               <Save size={16} />
               <span className="hidden lg:inline">儲存專案</span>
            </button>

            <div className="h-6 w-px bg-stone-300 mx-1 shrink-0"></div>

            <button 
               onClick={handleExport}
               className="flex items-center gap-2 px-4 py-2 bg-stone-800 hover:bg-stone-900 text-white text-xs md:text-sm font-bold rounded-lg shadow-md transition-all active:translate-y-0.5 whitespace-nowrap"
            >
               <Download size={16} />
               匯出報表
            </button>
         </div>
      </div>

      <div className="flex-1 overflow-auto custom-scrollbar p-2 relative">
          <table className="w-full text-xs border-separate border-spacing-0 text-center font-sans min-w-[1600px]">
             <thead className="sticky top-0 z-20 text-stone-800 tracking-wide shadow-sm">
                 <tr>
                   <th rowSpan={3} className="border-r-2 border-b-2 border-stone-200 bg-stone-100 w-24 sticky left-0 z-30 font-black text-sm serif-font text-stone-700">召會</th>
                   <th colSpan={13} className="border-l-2 border-b border-[#fcd34d] bg-[#fef3c7] py-1 font-bold text-[#92400e]">一、受浸人數</th>
                   <th colSpan={10} className="border-l-2 border-b border-[#bae6fd] bg-[#f0f9ff] py-1 font-bold text-[#0369a1]">二、福家及生命讀經追求</th>
                   <th colSpan={7} className="border-l-2 border-b border-[#86efac] bg-[#dcfce7] py-1 font-bold text-[#166534]">三、青年小排與弟兄姊妹之家</th>
                   <th colSpan={12} className="border-l-2 border-b border-[#fda4af] bg-[#ffe4e6] py-1 font-bold text-[#9f1239]">四、主日聚會</th>
                   <th rowSpan={3} className="border-l-2 border-b-2 border-stone-200 bg-stone-100 py-1 font-bold text-stone-600 w-16">召會生活<br/>人數</th>
                 </tr>
                 
                 <tr className="text-[10px] font-bold">
                   {/* Bap: Teen -> Uni -> YA -> Totals */}
                   <th colSpan={2} className="border-r border-b border-[#fcd34d] bg-[#fffbeb]">青少</th>
                   <th colSpan={2} className="border-r border-b border-[#fcd34d] bg-[#fffbeb]">大學</th>
                   <th colSpan={2} className="border-r border-b border-[#fcd34d] bg-[#fffbeb]">青職</th>
                   <th colSpan={3} className="border-r border-b border-[#fcd34d] bg-[#fffbeb]">青年總計</th>
                   <th rowSpan={2} className="border-r border-b border-[#fcd34d] bg-[#fffbeb]">其他</th>
                   <th colSpan={3} className="border-r border-b border-[#fcd34d] bg-[#fffbeb] text-[#92400e]">全召會</th>

                   {/* Gospel */}
                   <th colSpan={4} className="border-r border-b border-[#bae6fd] bg-[#f0f9ff]">福音出訪</th>
                   <th colSpan={4} className="border-r border-b border-[#bae6fd] bg-[#f0f9ff]">家聚會牧養</th>
                   <th colSpan={2} className="border-r border-b border-[#bae6fd] bg-[#f0f9ff]">生命讀經</th>
                   
                   {/* Group: Child -> Teen -> Uni -> YA -> House */}
                   <th colSpan={2} className="border-r border-b border-[#86efac] bg-[#f0fdf4]">兒童</th>
                   <th colSpan={2} className="border-r border-b border-[#86efac] bg-[#f0fdf4]">青少</th>
                   <th rowSpan={2} className="border-r border-b border-[#86efac] bg-[#f0fdf4]">大學</th>
                   <th rowSpan={2} className="border-r border-b border-[#86efac] bg-[#f0fdf4]">青職</th>
                   <th rowSpan={2} className="border-r border-b border-[#86efac] bg-[#f0fdf4]">大學<br/>入住</th>

                   {/* Sunday: Child -> Teen -> Uni -> YA -> All */}
                   <th colSpan={2} className="border-r border-b border-[#fda4af] bg-[#fff1f2]">兒童</th>
                   <th colSpan={2} className="border-r border-b border-[#fda4af] bg-[#fff1f2]">青少</th>
                   <th colSpan={2} className="border-r border-b border-[#fda4af] bg-[#fff1f2]">大學</th>
                   <th colSpan={3} className="border-r border-b border-[#fda4af] bg-[#fff1f2]">青職</th>
                   <th colSpan={3} className="border-r border-b border-[#fda4af] bg-[#fff1f2] text-[#9f1239]">全召會</th>
                 </tr>

                 <tr className="text-[10px] text-stone-500 font-medium">
                    {/* Bap */}
                    <th className="bg-[#fffbeb] border-b border-r border-[#fcd34d]">目標</th><th className="bg-[#fffbeb] border-b border-r border-[#fcd34d]">人數</th>
                    <th className="bg-[#fffbeb] border-b border-r border-[#fcd34d]">目標</th><th className="bg-[#fffbeb] border-b border-r border-[#fcd34d]">人數</th>
                    <th className="bg-[#fffbeb] border-b border-r border-[#fcd34d]">目標</th><th className="bg-[#fffbeb] border-b border-r border-[#fcd34d]">人數</th>
                    <th className="bg-[#fffbeb] border-b border-r border-[#fcd34d]">目標</th><th className="bg-[#fffbeb] border-b border-r border-[#fcd34d]">人數</th><th className="bg-[#fffbeb] border-b border-r border-[#fcd34d]">%</th>
                    <th className="bg-[#fffbeb] border-b border-r border-[#fcd34d]">目標</th><th className="bg-[#fffbeb] border-b border-r border-[#fcd34d]">人數</th><th className="bg-[#fffbeb] border-b border-r border-[#fcd34d]">%</th>
                    
                    {/* Gospel/Home/Life */}
                    <th className="bg-[#f0f9ff] border-b border-r border-[#bae6fd]">青職</th><th className="bg-[#f0f9ff] border-b border-r border-[#bae6fd]">%</th>
                    <th className="bg-[#f0f9ff] border-b border-r border-[#bae6fd]">全召會</th><th className="bg-[#f0f9ff] border-b border-r border-[#bae6fd]">%</th>
                    <th className="bg-[#f0f9ff] border-b border-r border-[#bae6fd]">青職</th><th className="bg-[#f0f9ff] border-b border-r border-[#bae6fd]">%</th>
                    <th className="bg-[#f0f9ff] border-b border-r border-[#bae6fd]">全召會</th><th className="bg-[#f0f9ff] border-b border-r border-[#bae6fd]">%</th>
                    <th className="bg-[#f0f9ff] border-b border-r border-[#bae6fd]">青職</th><th className="bg-[#f0f9ff] border-b border-r border-[#bae6fd]">%</th>

                    {/* Group */}
                    <th className="bg-[#f0fdf4] border-b border-r border-[#86efac]">排數</th><th className="bg-[#f0fdf4] border-b border-r border-[#86efac]">人數</th>
                    <th className="bg-[#f0fdf4] border-b border-r border-[#86efac]">排數</th><th className="bg-[#f0fdf4] border-b border-r border-[#86efac]">人數</th>

                    {/* Sunday */}
                    <th className="bg-[#fff1f2] border-b border-r border-[#fda4af]">基數</th><th className="bg-[#fff1f2] border-b border-r border-[#fda4af]">人數</th>
                    <th className="bg-[#fff1f2] border-b border-r border-[#fda4af]">基數</th><th className="bg-[#fff1f2] border-b border-r border-[#fda4af]">人數</th>
                    <th className="bg-[#fff1f2] border-b border-r border-[#fda4af]">基數</th><th className="bg-[#fff1f2] border-b border-r border-[#fda4af]">人數</th>
                    <th className="bg-[#fff1f2] border-b border-r border-[#fda4af]">基數</th><th className="bg-[#fff1f2] border-b border-r border-[#fda4af]">人數</th><th className="bg-[#fff1f2] border-b border-r border-[#fda4af]">%</th>
                    <th className="bg-[#fff1f2] border-b border-r border-[#fda4af]">基數</th><th className="bg-[#fff1f2] border-b border-r border-[#fda4af]">人數</th><th className="bg-[#fff1f2] border-b border-r border-[#fda4af]">年增</th>
                 </tr>
             </thead>
             <tbody>
                {displayedRows.map(({ row, originalIndex }, idx) => {
                    const cellClass = (bg: string = "") => `border-r border-b border-stone-100 p-0 ${row.isGrandTotal ? 'border-stone-600' : ''} ${bg}`;
                    
                    return (
                        <tr key={originalIndex} className={`${getRowClass(row)} group`}>
                            <td className={`border-r-2 border-b border-stone-200 px-2 py-2 text-left sticky left-0 z-10 font-bold serif-font ${getStickyClass(row)}`}>
                                {row.name}
                            </td>
                            
                            {/* Bap: Teen -> Uni -> YA */}
                            <td className={cellClass("bg-yellow-50/20")}>{renderCell(row, originalIndex, 'bap_teen_target')}</td>
                            <td className={cellClass("bg-yellow-50/20")}>{renderCell(row, originalIndex, 'bap_teen_actual')}</td>
                            <td className={cellClass("bg-yellow-50/20")}>{renderCell(row, originalIndex, 'bap_uni_target')}</td>
                            <td className={cellClass("bg-yellow-50/20")}>{renderCell(row, originalIndex, 'bap_uni_actual')}</td>
                            <td className={cellClass("bg-yellow-50/20")}>{renderCell(row, originalIndex, 'bap_ya_target')}</td>
                            <td className={cellClass("bg-yellow-50/20")}>{renderCell(row, originalIndex, 'bap_ya_actual')}</td>
                            <td className={cellClass("bg-yellow-50/30 font-bold")}>{renderCell(row, originalIndex, 'bap_youth_goal')}</td>
                            <td className={cellClass("bg-yellow-50/30 font-bold")}>{renderCell(row, originalIndex, 'bap_youth_total')}</td>
                            <td className={cellClass("bg-yellow-50/30 text-stone-500")}>{renderCell(row, originalIndex, 'bap_youth_rate', true)}</td>
                            <td className={cellClass("bg-yellow-50/20")}>{renderCell(row, originalIndex, 'bap_other_actual')}</td>
                            <td className={cellClass("bg-yellow-100/50 font-black text-[#92400e]")}>{renderCell(row, originalIndex, 'bap_all_goal')}</td>
                            <td className={cellClass("bg-yellow-100/50 font-black text-[#92400e]")}>{renderCell(row, originalIndex, 'bap_all_total')}</td>
                            <td className={cellClass("bg-yellow-100/50 font-bold text-[#92400e]")}>{renderCell(row, originalIndex, 'bap_all_rate', true)}</td>

                            {/* Gospel */}
                            <td className={cellClass()}>{renderCell(row, originalIndex, 'vis_ya_avg')}</td>
                            <td className={cellClass("text-stone-400")}>{renderCell(row, originalIndex, 'vis_ya_rate', true)}</td>
                            <td className={cellClass()}>{renderCell(row, originalIndex, 'vis_all_avg')}</td>
                            <td className={cellClass("text-stone-400")}>{renderCell(row, originalIndex, 'vis_all_rate', true)}</td>

                            {/* Home */}
                            <td className={cellClass()}>{renderCell(row, originalIndex, 'home_ya_avg')}</td>
                            <td className={cellClass("text-stone-400")}>{renderCell(row, originalIndex, 'home_ya_rate', true)}</td>
                            <td className={cellClass()}>{renderCell(row, originalIndex, 'home_all_avg')}</td>
                            <td className={cellClass("text-stone-400")}>{renderCell(row, originalIndex, 'home_all_rate', true)}</td>

                            {/* Life */}
                            <td className={cellClass()}>{renderCell(row, originalIndex, 'life_ya_avg')}</td>
                            <td className={cellClass("text-stone-400")}>{renderCell(row, originalIndex, 'life_ya_rate', true)}</td>

                            {/* Group */}
                            <td className={cellClass()}>{renderCell(row, originalIndex, 'grp_child_cnt')}</td>
                            <td className={cellClass()}>{renderCell(row, originalIndex, 'grp_child_w_avg')}</td>
                            <td className={cellClass()}>{renderCell(row, originalIndex, 'grp_teen_cnt')}</td>
                            <td className={cellClass()}>{renderCell(row, originalIndex, 'grp_teen_avg')}</td>
                            <td className={cellClass()}>{renderCell(row, originalIndex, 'grp_uni_cnt')}</td>
                            <td className={cellClass()}>{renderCell(row, originalIndex, 'grp_ya_avg')}</td>
                            <td className={cellClass()}>{renderCell(row, originalIndex, 'uni_house_cnt')}</td>

                            {/* Sunday */}
                            <td className={cellClass()}>{renderCell(row, originalIndex, 'sun_child_base')}</td>
                            <td className={cellClass()}>{renderCell(row, originalIndex, 'sun_child_w_avg')}</td>
                            <td className={cellClass()}>{renderCell(row, originalIndex, 'sun_teen_base')}</td>
                            <td className={cellClass()}>{renderCell(row, originalIndex, 'sun_teen_avg')}</td>
                            <td className={cellClass()}>{renderCell(row, originalIndex, 'sun_uni_base')}</td>
                            <td className={cellClass()}>{renderCell(row, originalIndex, 'sun_uni_avg')}</td>
                            <td className={cellClass("bg-[#fff1f2]/30")}>{renderCell(row, originalIndex, 'sun_ya_base')}</td>
                            <td className={cellClass("bg-[#fff1f2]/30 font-semibold")}>{renderCell(row, originalIndex, 'sun_ya_avg')}</td>
                            <td className={cellClass("bg-[#fff1f2]/30 text-stone-500")}>{renderCell(row, originalIndex, 'sun_ya_pct', true)}</td>
                            <td className={cellClass("bg-[#fff1f2]/80 font-black text-[#9f1239]")}>{renderCell(row, originalIndex, 'sun_all_base')}</td>
                            <td className={cellClass("bg-[#fff1f2]/80 font-black text-[#9f1239]")}>{renderCell(row, originalIndex, 'sun_all_avg')}</td>
                            <td className={cellClass("bg-[#fff1f2]/80 font-bold text-[#9f1239]")}>{renderCell(row, originalIndex, 'sun_all_yoy', true)}</td>
                            
                            <td className={cellClass("border-l-2 border-stone-200")}>{renderCell(row, originalIndex, 'cl_count')}</td>
                        </tr>
                    );
                })}
             </tbody>
          </table>
      </div>
    </div>
  );
};

export default ConsolidatedTable;
