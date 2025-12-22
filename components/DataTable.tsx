
import React, { useState, useEffect, useMemo } from 'react';
import { DataRow, ColumnInfo } from '../types';
import { ChevronLeft, ChevronRight, Filter, FileText } from 'lucide-react';

interface DataTableProps {
  data: DataRow[];
  columns: ColumnInfo[];
  onDataUpdate: (rowIndex: number, column: string, value: string | number) => void;
}

interface RawEditableCellProps {
  value: string | number | null;
  type: 'string' | 'number' | 'date';
  onChange: (value: string | number) => void;
}

const RawEditableCell: React.FC<RawEditableCellProps> = ({ value, type, onChange }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [inputValue, setInputValue] = useState(value === null ? '' : String(value));

  useEffect(() => {
    setInputValue(value === null ? '' : String(value));
  }, [value]);

  const handleBlur = () => {
    setIsEditing(false);
    
    if (type === 'number') {
      const num = parseFloat(inputValue);
      if (!isNaN(num)) {
        onChange(num);
      } else if (inputValue === '') {
        // Handle empty input for number field as 0 or keep empty depending on requirement, here we keep string if invalid or revert
        onChange(0); 
      } else {
        setInputValue(String(value)); // Revert if invalid number
      }
    } else {
      onChange(inputValue);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleBlur();
    }
  };

  return (
    <div 
      className={`w-full min-h-[1.5rem] px-1 cursor-pointer transition-colors rounded ${
        isEditing ? 'bg-white ring-2 ring-indigo-400 z-10' : 'hover:bg-indigo-50 hover:text-indigo-700'
      }`}
      onClick={() => setIsEditing(true)}
      title="點擊編輯"
    >
      {isEditing ? (
        <input
          type={type === 'number' ? 'number' : 'text'}
          className="w-full h-full bg-transparent outline-none p-0 m-0 border-none text-inherit"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          autoFocus
          onClick={(e) => e.stopPropagation()}
        />
      ) : (
        <span className="block truncate max-w-[200px]">{value !== null && value !== undefined ? value : '-'}</span>
      )}
    </div>
  );
};

const DataTable: React.FC<DataTableProps> = ({ data, columns, onDataUpdate }) => {
  const [page, setPage] = useState(1);
  const [selectedFile, setSelectedFile] = useState<string>('all');
  const rowsPerPage = 15; 
  
  // Extract unique file names for the dropdown
  const fileOptions = useMemo(() => {
    const files = new Set<string>();
    data.forEach(row => {
      const fileName = String(row['來源報表'] || '');
      if (fileName) files.add(fileName);
    });
    
    return Array.from(files).sort((a, b) => {
      // Helper to extract date from filename for chronological sorting
      // Supports YYYYMMDD, YYYY-MM-DD, YYYY.MM.DD
      const getDate = (name: string): number => {
          const match = name.match(/(?:^|[^\d])(\d{4})[-/._]?(\d{2})[-/._]?(\d{2})(?:$|[^\d])/);
          if (match) {
              const y = parseInt(match[1], 10);
              const m = parseInt(match[2], 10);
              const d = parseInt(match[3], 10);
              if (y >= 1900 && y <= 2100 && m >= 1 && m <= 12 && d >= 1 && d <= 31) {
                  return y * 10000 + m * 100 + d;
              }
          }
          // Fallback for simple numeric patterns if needed, but risky.
          return 0;
      };

      const dateA = getDate(a);
      const dateB = getDate(b);

      if (dateA !== 0 && dateB !== 0) {
          return dateA - dateB;
      }

      // Fallback to natural sort (handles Week 1 vs Week 10 correctly)
      return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
    });
  }, [data]);

  // Filter data and preserve original index for editing
  const filteredRowsWithIndex = useMemo(() => {
    // Map data to include original index first
    const indexedData = data.map((row, idx) => ({ row, originalIndex: idx }));
    
    if (selectedFile === 'all') {
      return indexedData;
    }
    return indexedData.filter(item => String(item.row['來源報表']) === selectedFile);
  }, [data, selectedFile]);

  // Reset page when filter changes
  useEffect(() => {
    setPage(1);
  }, [selectedFile]);

  const totalPages = Math.ceil(filteredRowsWithIndex.length / rowsPerPage);
  const startIndex = (page - 1) * rowsPerPage;
  const currentData = filteredRowsWithIndex.slice(startIndex, startIndex + rowsPerPage);

  const handlePrev = () => setPage(p => Math.max(1, p - 1));
  const handleNext = () => setPage(p => Math.min(totalPages, p + 1));

  return (
    <div className="bg-white rounded-xl border border-gray-300 shadow-sm overflow-hidden flex flex-col h-full">
      <div className="px-4 py-3 border-b border-gray-300 flex flex-col sm:flex-row justify-between items-start sm:items-center bg-gray-50 gap-3">
        <div className="flex items-center gap-3">
          <h3 className="font-bold text-gray-800 text-sm whitespace-nowrap">詳細數據表 (可編輯)</h3>
          <span className="text-xs text-gray-500 bg-gray-200 px-2 py-0.5 rounded-full">
            {filteredRowsWithIndex.length} 筆
          </span>
        </div>

        {/* File Filter Dropdown */}
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <div className="relative w-full sm:w-auto min-w-[200px] max-w-md">
            <div className="absolute inset-y-0 left-0 pl-2 flex items-center pointer-events-none">
              <Filter size={14} className="text-gray-400" />
            </div>
            <select
              value={selectedFile}
              onChange={(e) => setSelectedFile(e.target.value)}
              className="w-full pl-8 pr-4 py-1.5 text-xs font-bold text-gray-700 bg-white border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-200 cursor-pointer shadow-sm truncate appearance-none"
            >
              <option value="all">顯示所有來源檔案 ({data.length} 筆)</option>
              {fileOptions.map(fileName => (
                <option key={fileName} value={fileName}>
                  📄 {fileName}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>
      
      <div className="overflow-auto flex-1 custom-scrollbar">
        <table className="w-full text-xs text-left border-collapse">
          <thead className="bg-gray-100 text-gray-700 font-semibold uppercase sticky top-0 z-20 shadow-sm">
            <tr>
              <th className="px-3 py-2 border border-gray-300 w-12 text-center bg-gray-200">#</th>
              {columns.map((col) => (
                <th key={col.name} className="px-3 py-2 border border-gray-300 whitespace-nowrap min-w-[80px]">
                  {col.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {currentData.map((item, idx) => {
              // item contains { row, originalIndex }
              const { row, originalIndex } = item;
              const displayIndex = startIndex + idx + 1;

              return (
                <tr key={originalIndex} className="hover:bg-blue-50 transition-colors group">
                  <td className="px-2 py-2 border border-gray-300 text-gray-400 text-center select-none bg-gray-50 font-mono">
                    {displayIndex}
                  </td>
                  {columns.map((col) => {
                    const val = row[col.name];
                    // Convert boolean to string to ensure type safety for RawEditableCell
                    const safeVal = typeof val === 'boolean' ? String(val) : val;
                    const isNumber = col.type === 'number';
                    
                    // Highlight '來源報表' column slightly if needed, or keep uniform
                    const isSourceCol = col.name === '來源報表';

                    return (
                      <td 
                        key={`${originalIndex}-${col.name}`} 
                        className={`border border-gray-300 text-gray-800 whitespace-nowrap ${isNumber ? 'text-right font-mono' : ''} ${isSourceCol ? 'text-gray-500' : ''}`}
                      >
                         <RawEditableCell 
                           value={safeVal} 
                           type={col.type} 
                           // Use originalIndex so updates target the correct row in the main data array
                           onChange={(newValue) => onDataUpdate(originalIndex, col.name, newValue)} 
                         />
                      </td>
                    );
                  })}
                </tr>
              );
            })}
            {currentData.length === 0 && (
               <tr>
                 <td colSpan={columns.length + 1} className="p-8 text-center text-gray-400 italic">
                   無符合條件的數據
                 </td>
               </tr>
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="px-4 py-2 border-t border-gray-300 flex items-center justify-between bg-gray-50 shrink-0">
          <button 
            onClick={handlePrev} 
            disabled={page === 1}
            className="p-1 rounded hover:bg-gray-200 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
          >
            <ChevronLeft size={18} className="text-gray-600" />
          </button>
          <span className="text-xs text-gray-600 font-medium">
            頁次 {page} / {totalPages}
          </span>
          <button 
            onClick={handleNext} 
            disabled={page === totalPages}
            className="p-1 rounded hover:bg-gray-200 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
          >
            <ChevronRight size={18} className="text-gray-600" />
          </button>
        </div>
      )}
    </div>
  );
};

export default DataTable;
