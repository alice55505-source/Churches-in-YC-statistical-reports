
import { read, utils } from 'xlsx';
import { DataRow, ColumnInfo } from '../types';

export const parseFile = async (file: File): Promise<DataRow[]> => {
  const isExcel = file.name.endsWith('.xls') || file.name.endsWith('.xlsx');

  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      const result = e.target?.result;
      if (!result) {
        resolve([]);
        return;
      }

      let parsedRows: DataRow[] = [];
      let isProjectFile = false;

      try {
        // Handle Excel Files
        if (isExcel) {
          const workbook = read(result, { type: 'array', cellDates: true, dateNF: 'yyyy-mm-dd' });
          
          workbook.SheetNames.forEach(sheetName => {
            const worksheet = workbook.Sheets[sheetName];
            
            // Convert to array of arrays to handle multi-level headers manually
            const rawData = utils.sheet_to_json<any[]>(worksheet, { header: 1, blankrows: false, defval: '' });
            
            if (rawData.length > 0) {
                // Step 1: Detect ALL Header Blocks (Tables) in this sheet
                const tableAnchors: { rowIdx: number, colIdx: number }[] = [];
                const keywords = ['召會', '召喚會', '單位', '名稱', 'church', 'name', '會所'];

                for(let i=0; i < rawData.length; i++) {
                   const row = rawData[i];
                   if (!row || !Array.isArray(row)) continue;
                   
                   const nonEmptyCount = row.filter(c => c !== undefined && c !== '' && c !== null).length;
                   if (nonEmptyCount < 2) continue;

                   const limit = Math.min(row.length, 15);
                   let foundCol = -1;
                   
                   for(let c=0; c<limit; c++) {
                       const cell = String(row[c]).trim().toLowerCase();
                       if (keywords.some(k => cell === k || (cell.length > 1 && cell.includes(k)))) {
                           if (cell.length > 20 && !cell.includes('name')) continue;
                           foundCol = c;
                           break;
                       }
                   }

                   if (foundCol !== -1) {
                       const prevAnchor = tableAnchors[tableAnchors.length - 1];
                       if (!prevAnchor || (i - prevAnchor.rowIdx > 5)) {
                           tableAnchors.push({ rowIdx: i, colIdx: foundCol });
                       }
                   }
                }
                
                if (tableAnchors.length === 0) {
                    let bestGuessRow = 0;
                    for(let i=0; i<Math.min(rawData.length, 10); i++) {
                        const strCount = rawData[i]?.filter(c => typeof c === 'string' && c.trim().length > 0).length || 0;
                        if (strCount > 1) {
                            bestGuessRow = i;
                            break;
                        }
                    }
                    tableAnchors.push({ rowIdx: bestGuessRow, colIdx: 0 });
                }

                // Step 2: Process each detected table independently
                tableAnchors.forEach((anchor, tableIndex) => {
                    const headerTopIdx = anchor.rowIdx;
                    const churchColIdx = anchor.colIdx;
                    
                    const nextAnchor = tableAnchors[tableIndex + 1];
                    const tableEndIdx = nextAnchor ? Math.max(headerTopIdx, nextAnchor.rowIdx - 2) : rawData.length;

                    // Find Data Start
                    let dataStartIdx = headerTopIdx;
                    for(let i = headerTopIdx + 1; i < tableEndIdx; i++) {
                        const row = rawData[i];
                        if (!row) continue;
                        
                        const val = row[churchColIdx];
                        const rowHasContent = row.some(c => c !== undefined && c !== '' && c !== null);
                        
                        if (rowHasContent && val && String(val).trim().length > 0) {
                             const strVal = String(val).trim();
                             if (!keywords.some(k => strVal.includes(k))) {
                                 dataStartIdx = i - 1; 
                                 break;
                             }
                        }
                        
                        if (i > headerTopIdx + 10) { 
                            dataStartIdx = i;
                            break;
                        }
                    }

                    // Process Headers
                    const levels = Math.max(1, Math.min(5, dataStartIdx - headerTopIdx + 1));
                    const headers = processHeaders(rawData, dataStartIdx, levels);

                    // Construct objects for this table
                    const tableRows: DataRow[] = [];
                    
                    for(let i = dataStartIdx + 1; i < tableEndIdx; i++) {
                        const rowArray = rawData[i];
                        if (!rowArray || rowArray.length === 0) continue;
                        
                        if (!rowArray.some(c => c !== undefined && c !== '' && c !== null)) continue;
                        
                        const rowObj: DataRow = {};
                        let hasContent = false;
                        headers.forEach((h, idx) => {
                            if (rowArray[idx] !== undefined) {
                                let val = rowArray[idx];
                                if (typeof val === 'string') {
                                    val = val.trim();
                                }
                                rowObj[h] = val;
                                if (val !== '' && val !== null) hasContent = true;
                            }
                        });
                        
                        rowObj["來源報表"] = file.name;
                        rowObj["工作表名稱"] = tableAnchors.length > 1 ? `${sheetName}_Part${tableIndex+1}` : sheetName;
                        
                        if (hasContent) {
                            tableRows.push(rowObj);
                        }
                    }
                    parsedRows.push(...tableRows);
                });
            }
          });

        } 
        // Handle JSON
        else if (file.name.endsWith('.json')) {
          const text = result as string;
          try {
            const json = JSON.parse(text);
            if (Array.isArray(json)) {
              parsedRows = json;
            } else if (typeof json === 'object' && json !== null && Array.isArray(json.rows)) {
              parsedRows = json.rows;
              isProjectFile = true;
            } else {
              throw new Error('JSON 格式不正確');
            }
          } catch (jsonErr) {
             throw new Error('JSON 解析失敗');
          }
        } 
        // Handle CSV
        else if (file.name.endsWith('.csv')) {
          const rows = parseCSV(result as string, file.name);
          parsedRows = rows;
        } else {
          throw new Error('不支援的檔案格式');
        }

        const cleanedRows = isProjectFile ? parsedRows : normalizeDataSet(parsedRows);
        resolve(cleanedRows);

      } catch (err: any) {
        console.error(err);
        reject(new Error(err.message || '檔案解析失敗'));
      }
    };

    reader.onerror = () => reject(new Error('讀取檔案錯誤'));

    if (isExcel) {
      reader.readAsArrayBuffer(file);
    } else {
      reader.readAsText(file);
    }
  });
};

// Helper: Standardize Column Names to Fix Missing Data Issues
const standardizeHeader = (original: string): string => {
    let h = original.replace(/\s+/g, ''); // Remove whitespace
    
    // [Fix]: Don't rename "申言人數", "新人人數" to "主日_小計" even if they match keywords partially
    if (h.includes('申言') || h.includes('新人')) {
        return h;
    }

    // 1. Sunday Total Mapping
    // Maps: 主日_合計, 主日_總計, 主日_總數, 主日_全召會, 主日_人數, 主日 (alone) -> 主日_小計
    if (h === '主日') return '主日_小計';
    
    if (h.includes('主日') && (h.includes('小計') || h.includes('合計') || h.includes('總計') || h.includes('總數') || h.includes('全召會') || h.includes('人數'))) {
        // Exception: Don't rename sub-groups like "主日_青職_人數"
        if (!['青職', '大專', '大學', '中學', '青少', '兒童', '幼兒'].some(k => h.includes(k))) {
            return '主日_小計';
        }
    }
    
    // 2. Baptism Total Mapping
    if (h === '受浸' || h === '今年受浸') return '今年受浸_小計';

    if ((h.includes('受浸') || h.includes('受點')) && (h.includes('小計') || h.includes('合計') || h.includes('總計') || h.includes('總數') || h.includes('全召會'))) {
         if (!['青職', '大專', '大學', '中學', '青少', '兒童', '小學', '線上'].some(k => h.includes(k))) {
            return '今年受浸_小計';
        }
    }

    return h;
};

// Helper to process headers with Merge Logic and Cleaning
const processHeaders = (data: any[][], anchorIdx: number, levels: number = 3): string[] => {
    if (data.length === 0 || anchorIdx < 0 || anchorIdx >= data.length) return [];
    
    const rowsToMerge: any[][] = [];
    for (let i = 0; i < levels; i++) {
        const idx = anchorIdx - i;
        if (idx >= 0) {
            rowsToMerge.unshift(data[idx]);
        }
    }
    
    if (rowsToMerge.length === 0) return [];
    const colCount = rowsToMerge[rowsToMerge.length - 1].length;
    const lastValues: string[] = new Array(rowsToMerge.length).fill('');
    
    // 1. Collect raw parts
    const rawColumnParts: string[][] = [];
    const partFrequency = new Map<string, number>();

    for (let c = 0; c < colCount; c++) {
        const parts: string[] = [];
        for (let r = 0; r < rowsToMerge.length; r++) {
            let val = rowsToMerge[r][c] ? String(rowsToMerge[r][c]).trim() : '';
            
            // Fill Forward Logic
            if (val) {
                lastValues[r] = val;
            } else {
                val = lastValues[r];
            }
            
            if (val && val !== '報表') {
                if (/^\d{1,3}$/.test(val)) {
                    const num = parseInt(val);
                    if (num < 100) continue; 
                }
                parts.push(val);
            }
        }
        
        const uniqueParts = parts.filter((item, pos, arr) => {
             return pos === 0 || item !== arr[pos - 1];
        });
        
        uniqueParts.forEach(p => {
             partFrequency.set(p, (partFrequency.get(p) || 0) + 1);
        });

        rawColumnParts.push(uniqueParts);
    }

    // 2. Identify Global Titles
    const globalTitles = new Set<string>();
    const protectedKeywords = ['主日', '受浸', '小排', '福音', '家聚會', '生命讀經', '人數', '召會', '全召會', '小計', '合計', '總計', 'Total', 'Sum'];

    if (colCount > 3) {
        const threshold = colCount * 0.7; 
        partFrequency.forEach((count, key) => {
             const lowerKey = key.toLowerCase();
             if (protectedKeywords.some(pk => lowerKey.includes(pk))) return;
             if (count > threshold) globalTitles.add(key);
        });
    }

    // 3. Construct Final Headers
    const combinedHeaders: string[] = [];
    for (let c = 0; c < colCount; c++) {
        let finalParts = rawColumnParts[c].filter(p => !globalTitles.has(p));
        
        if (finalParts.length === 0 && rawColumnParts[c].length > 0) {
            finalParts = rawColumnParts[c];
        }
        
        let rawHeader = finalParts.join('_') || `Column_${c}`;

        // [Positional Fix] Column G (Index 6) is Sunday Total
        // If c === 6 (G column) contains generic total keywords, force it to '主日_小計'
        // [FIX] Relax positional check slightly, or skip it if header looks like prophesying
        if (c === 6 && !rawHeader.includes('申言') && !rawHeader.includes('新人')) {
             const cleanH = rawHeader.replace(/\s+/g, '');
             // Removed '人數' from commonTotalKeywords to prevent misclassification of generic "Count" columns (like Prophesying Count)
             const commonTotalKeywords = ['小計', '合計', '總計', '總數', '全召會', 'Total', 'Sum', 'Column_6'];
             if (commonTotalKeywords.some(k => cleanH.toLowerCase() === k.toLowerCase()) || cleanH === '') {
                 rawHeader = '主日_小計';
             }
        }

        // [Contextual Fix] If current is "Total" and previous was "Sunday...", infer "Sunday Total"
        // This handles cases where column position might shift but relative position is correct
        if (c > 0) {
             const prevHeader = combinedHeaders[c-1];
             const cleanH = rawHeader.replace(/\s+/g, '');
             if (/^(小計|合計|總計|Total|Sum)$/i.test(cleanH)) {
                 if (prevHeader.includes('主日')) {
                      rawHeader = '主日_小計';
                 }
             }
        }
        
        // Apply Standardization
        combinedHeaders.push(standardizeHeader(rawHeader));
    }

    return combinedHeaders;
};

const normalizeDataSet = (rows: DataRow[]): DataRow[] => {
  if (rows.length === 0) return rows;

  return rows.map(row => {
    const newRow = { ...row };
    
    Object.keys(newRow).forEach(k => {
        let val = newRow[k];
        
        // Fix for "0" or "0.0" appearing as Church Name due to parsing error or empty cell
        if (['召會', 'Name', '名稱'].includes(k)) {
            if (val === 0 || val === '0' || val === '0.0') {
                newRow[k] = ''; // Reset to empty string
                val = '';
            }
        }

        if ((val as any) instanceof Date) {
            newRow[k] = (val as any).toISOString().split('T')[0];
            return;
        }

        if (typeof val === 'string') {
             const trimmed = val.trim();
             if (trimmed.endsWith('%')) {
                 const num = parseFloat(trimmed.replace('%', ''));
                 if (!isNaN(num)) newRow[k] = num;
             } 
             else {
                 if (!trimmed.includes('-') && !trimmed.includes('/')) {
                     const cleanNumStr = trimmed.replace(/,/g, '');
                     if (cleanNumStr !== '' && !isNaN(Number(cleanNumStr))) {
                          newRow[k] = Number(cleanNumStr);
                     }
                 }
             }
        }
    });

    return newRow;
  });
};

const parseCSV = (text: string, filename: string): DataRow[] => {
  const lines = text.split(/\r?\n/).filter(line => line.trim() !== '');
  if (lines.length < 2) return [];

  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
  const uniqueHeaders = headers.map((h, i) => h || `Column_${i}`);

  const result: DataRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const currentLine = lines[i].split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/);
    if (currentLine.length > 0) {
      const obj: DataRow = {};
      uniqueHeaders.forEach((header, index) => {
        const val = currentLine[index] ? currentLine[index].trim().replace(/^"|"$/g, '') : '';
        const cleanVal = val.replace(/,/g, '');
        obj[header] = !isNaN(Number(cleanVal)) && cleanVal !== '' ? Number(cleanVal) : val;
      });
      obj["來源報表"] = filename;
      obj["工作表名稱"] = filename.replace('.csv', '');
      result.push(obj);
    }
  }
  return result;
};

export const detectColumns = (data: DataRow[]): ColumnInfo[] => {
  if (data.length === 0) return [];
  const allKeys = new Set<string>();
  data.slice(0, 10).forEach(row => Object.keys(row).forEach(k => allKeys.add(k)));
  return Array.from(allKeys).map(key => {
      const sampleVal = data.find(r => r[key] !== null && r[key] !== undefined && r[key] !== '')?.[key];
      const type = typeof sampleVal === 'number' ? 'number' : 'string';
      return { name: key, type };
  });
};
