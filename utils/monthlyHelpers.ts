
import { DataRow, CHURCH_ORDER } from '../types';

// 定義月報表的資料結構
export interface MonthlyMetricRow {
  name: string;
  region: string;
  isSubtotal?: boolean;
  isGrandTotal?: boolean;
  
  // 用於除錯與詳細資訊顯示
  details?: Record<string, string>;

  // 一、受浸人數
  bap_roll_call: number; // 總計 (今年受浸_小計)
  bap_online: number;    // 線上表單
  // 細項
  bap_child: number;     // 今年受浸_小學
  bap_teen: number;      // 今年受浸_中學
  bap_uni: number;       // 今年受浸_大專
  bap_ya: number;        // 今年受浸_青職

  // 二、主日
  sun_child: number;
  sun_teen: number;
  sun_uni: number;
  sun_ya: number;
  sun_total: number;

  // 三、福音出訪
  gospel_ya: number;
  gospel_total: number;

  // 四、家聚會
  home_ya: number;
  home_total: number;

  // 五、生命讀經
  life_teen: number;
  life_uni: number;
  life_ya: number;
  life_total: number;

  // 六、小排
  group_child: number;
  group_teen: number;
  group_uni: number; // Added: 小排_大專
  group_ya: number;
}

// Helper: Check if a row is a "Total" row based on keywords
// Added '全召會' to capture rows labeled simply as "All Church"
const isTotalRow = (r: DataRow): boolean => {
    return Object.values(r).some(v => 
        typeof v === 'string' && ['小計', '合計', '總計', 'Total', '總數', '全召會'].some(kw => v.includes(kw))
    );
};

// 輔助：篩選出每個檔案的「總計/小計」列 (代表列)
// Enhanced to prioritize specific church rows if they exist
const getRepresentativeRows = (rows: DataRow[], churchName: string): DataRow[] => {
    const files: Record<string, DataRow[]> = {};
    rows.forEach(r => {
        const fname = String(r['來源報表'] || 'unknown') + '_' + String(r['工作表名稱'] || 'unknown');
        if (!files[fname]) files[fname] = [];
        files[fname].push(r);
    });

    const result: DataRow[] = [];
    Object.values(files).forEach(fileRows => {
        if (fileRows.length === 0) return;

        // Priority 1: Look for a row that explicitly mentions the church name AND is a Total row
        // e.g. "斗六小計", "嘉義合計"
        const explicitTotal = fileRows.find(r => {
             const rowStr = Object.values(r).join('');
             return rowStr.includes(churchName) && isTotalRow(r);
        });

        if (explicitTotal) {
            result.push(explicitTotal);
            return;
        }

        // Priority 2: Look for a generic Total row (if explicit one not found)
        // e.g. "小計", "Total" - useful if the file is pre-filtered for the church or only has one summary
        const genericTotal = fileRows.find(r => isTotalRow(r));
        if (genericTotal) {
             result.push(genericTotal);
             return;
        }

        // Priority 3: Fallback to specific rows (Non-Total)
        // e.g. "斗六" (single row), or "斗六一區" (districts)
        const specificRows = fileRows.filter(r => {
             const matchingValue = Object.values(r).find(v => typeof v === 'string' && v.includes(churchName));
             
             if (!matchingValue) return false;
             // Skip probable district rows if church name doesn't imply district
             if (typeof matchingValue === 'string' && matchingValue.includes('區') && !churchName.includes('區')) {
                 return false;
             }
             return !isTotalRow(r);
        });

        if (specificRows.length > 0) {
            // WARNING: If multiple rows are returned (e.g. districts), subsequent calculations (getVal) 
            // will AVERAGE them instead of SUMMING them. This is usually incorrect for totals but valid for some averages.
            // Ideally we should prefer Priority 1 & 2.
            result.push(...specificRows);
            return;
        }
        
        // Priority 4: Last resort - Last row
        result.push(fileRows[fileRows.length - 1]);
    });
    return result;
};

// Return type updated to include debug info
interface CalcResult {
    val: number;
    info: string;
}

// 輔助：從資料列中提取數值
const getVal = (rows: DataRow[], targetColumns: string[], mode: 'max' | 'avg' | 'sum' = 'avg'): CalcResult => {
    const values: number[] = [];

    // 1. 收集所有有效數值
    rows.forEach(r => {
         let rowSum = 0;
         let hasValue = false;
         targetColumns.forEach(target => {
             if (Object.prototype.hasOwnProperty.call(r, target)) {
                 const v = Number(r[target]);
                 if (!isNaN(v)) {
                     rowSum += v;
                     hasValue = true;
                 }
             }
         });
         if (hasValue) values.push(rowSum);
    });

    if (values.length === 0) return { val: 0, info: '無數據' };

    // 2. 根據模式計算
    if (mode === 'max') {
        const max = Math.max(...values);
        return { val: max, info: `最大值模式\n原始數據(${values.length}筆): ${values.join(', ')}` };
    }
    
    if (mode === 'sum') {
        const sum = values.reduce((acc, curr) => acc + curr, 0);
        return { val: sum, info: `加總模式\n原始數據(${values.length}筆): ${values.join(', ')}` };
    }

    // 平均模式：採用「去尾平均數 (Trimmed Mean)」
    if (mode === 'avg') {
        // 排序
        const sorted = [...values].sort((a, b) => a - b);
        
        let validValues = sorted;
        let infoPrefix = "一般平均";

        // 規則：若筆數 > 4，則扣除最高2筆與最低2筆
        // 解決 15 筆變 8 筆的問題：現在 parser 修復後，這裡應該能看到 15 筆，然後剔除 4 筆 = 11 筆
        if (values.length > 4) {
            const droppedLow = sorted.slice(0, 2);
            const droppedHigh = sorted.slice(sorted.length - 2);
            validValues = sorted.slice(2, sorted.length - 2);
            
            infoPrefix = "去尾平均(剔除高低各2)";
            
            const total = validValues.reduce((acc, curr) => acc + curr, 0);
            const avg = Math.round(total / validValues.length);
            
            return {
                val: avg,
                info: `【${infoPrefix}】\n原始筆數: ${values.length} (大於4筆，執行剔除)\n原始排序: ${sorted.join(', ')}\n❌ 剔除低值: ${droppedLow.join(', ')}\n❌ 剔除高值: ${droppedHigh.join(', ')}\n✅ 納入計算: ${validValues.join(', ')}\n平均: ${total} / ${validValues.length} = ${avg}`
            };
        }
        
        const total = values.reduce((acc, curr) => acc + curr, 0);
        const avg = Math.round(total / values.length);
        return {
            val: avg,
            info: `【${infoPrefix}】\n原始筆數: ${values.length} (未達5筆，不剔除)\n原始數據: ${values.join(', ')}\n平均: ${total} / ${values.length} = ${avg}`
        };
    }

    return { val: 0, info: '' };
};

// 主要處理函式
export const processMonthlyReport = (rawData: DataRow[]): MonthlyMetricRow[] => {
  const results: MonthlyMetricRow[] = [];

  // [Fix for legacy files]
  // Check if rawData is actually ProcessedRow[] (from an old project file that didn't save rawData).
  if (rawData.length > 0 && 'bap_ya_actual' in rawData[0] && 'sun_total' in rawData[0] === false) {
     rawData.forEach((r: any) => {
        if (r.isSubtotal || r.isGrandTotal || r.isLastYear) {
            results.push({
                name: r.name,
                region: r.region || '',
                isSubtotal: r.isSubtotal,
                isGrandTotal: r.isGrandTotal,
                bap_roll_call: r.bap_all_total || 0,
                bap_online: r.bap_online || 0, 
                bap_child: 0, bap_teen: r.bap_teen_actual || 0, bap_uni: r.bap_uni_actual || 0, bap_ya: r.bap_ya_actual || 0,
                sun_child: r.sun_child_w_avg || 0, sun_teen: r.sun_teen_avg || 0, sun_uni: r.sun_uni_avg || 0, sun_ya: r.sun_ya_avg || 0, sun_total: r.sun_all_avg || 0,
                gospel_ya: r.vis_ya_avg || 0, gospel_total: r.vis_all_avg || 0,
                home_ya: r.home_ya_avg || 0, home_total: r.home_all_avg || 0,
                life_teen: 0, life_uni: 0, life_ya: r.life_ya_avg || 0, life_total: r.life_all_avg || 0,
                group_child: r.grp_child_w_avg || 0, group_teen: r.grp_teen_avg || 0, group_uni: r.grp_uni_cnt || 0, group_ya: r.grp_ya_avg || 0,
                details: { info: "From Processed Data (Legacy Project File)" }
            });
        }
     });
     CHURCH_ORDER.forEach(group => {
        group.churches.forEach(churchName => {
             const found = rawData.find((r: any) => r.name === churchName);
             if (found) {
                const r: any = found;
                results.push({
                    name: r.name,
                    region: group.region,
                    isSubtotal: false,
                    bap_roll_call: r.bap_all_total || 0,
                    bap_online: 0, bap_child: 0, bap_teen: r.bap_teen_actual || 0, bap_uni: r.bap_uni_actual || 0, bap_ya: r.bap_ya_actual || 0,
                    sun_child: r.sun_child_w_avg || 0, sun_teen: r.sun_teen_avg || 0, sun_uni: r.sun_uni_avg || 0, sun_ya: r.sun_ya_avg || 0, sun_total: r.sun_all_avg || 0,
                    gospel_ya: r.vis_ya_avg || 0, gospel_total: r.vis_all_avg || 0,
                    home_ya: r.home_ya_avg || 0, home_total: r.home_all_avg || 0,
                    life_teen: 0, life_uni: 0, life_ya: r.life_ya_avg || 0, life_total: r.life_all_avg || 0,
                    group_child: r.grp_child_w_avg || 0, group_teen: r.grp_teen_avg || 0, group_uni: r.grp_uni_cnt || 0, group_ya: r.grp_ya_avg || 0,
                    details: { info: "From Processed Data (Legacy Project File)" }
                });
             }
        });
     });
     return results.sort((a,b) => 0);
  }

  CHURCH_ORDER.forEach(group => {
    const regionRows: MonthlyMetricRow[] = [];

    group.churches.forEach(churchName => {
      // 1. 篩選
      const churchRows = rawData.filter(row => {
        const filename = String(row['來源報表'] || '');
        const sheetname = String(row['工作表名稱'] || '');
        const nameInContent = Object.values(row).some(v => String(v).includes(churchName));
        
        return filename.includes(churchName) || sheetname.includes(churchName) || nameInContent;
      });

      if (churchRows.length === 0) {
          regionRows.push({
              name: churchName, region: group.region,
              bap_roll_call: 0, bap_online: 0,
              bap_child: 0, bap_teen: 0, bap_uni: 0, bap_ya: 0,
              sun_child: 0, sun_teen: 0, sun_uni: 0, sun_ya: 0, sun_total: 0,
              gospel_ya: 0, gospel_total: 0,
              home_ya: 0, home_total: 0,
              life_teen: 0, life_uni: 0, life_ya: 0, life_total: 0,
              group_child: 0, group_teen: 0, group_uni: 0, group_ya: 0,
              details: {}
          });
          return;
      }

      // 2. Identify Representative Rows
      // Now prioritizes TOTAL rows to ensure we get the full church stat, not just a district average
      const cleanRows = getRepresentativeRows(churchRows, churchName);
      
      const weeklyRows = churchRows.filter(r => !cleanRows.includes(r));
      const calcRows = cleanRows.length > 0 ? cleanRows : weeklyRows; 

      const details: Record<string, string> = {};

      // Helper to extract value and store info
      const extract = (res: CalcResult, key: string): number => {
          if (res.info) details[key] = res.info;
          return res.val;
      };

      // 3. 提取各項數值
      
      // 受浸
      const bap_roll_call = extract(getVal(cleanRows, ['今年受浸小計', '受浸_小計', '今年受浸_小計'], 'max'), 'bap_roll_call');
      
      const manualOnlineResult = getVal(churchRows, ['bap_online_manual'], 'max');
      let bap_online = 0;
      if (manualOnlineResult.info !== '無數據') {
          bap_online = extract(manualOnlineResult, 'bap_online');
      } else {
          bap_online = extract(getVal(cleanRows, ['受浸_線上', '線上受浸'], 'max'), 'bap_online');
      }
      
      const bap_child = extract(getVal(cleanRows, ['今年受浸_小學', '受浸_小學'], 'max'), 'bap_child');
      const bap_teen = extract(getVal(cleanRows, ['今年受浸_中學', '受浸_中學'], 'max'), 'bap_teen');
      const bap_uni = extract(getVal(cleanRows, ['今年受浸_大專', '受浸_大專'], 'max'), 'bap_uni');
      const bap_ya = extract(getVal(cleanRows, ['今年受浸_青職', '受浸_青職'], 'max'), 'bap_ya');

      // 主日
      const sun_child = extract(getVal(calcRows.length > 0 ? calcRows : cleanRows, ['主日_兒童', '兒童主日_小計', '兒童主日_合計'], 'avg'), 'sun_child');
      
      const sun_teen = extract(getVal(cleanRows, ['主日_中學'], 'avg'), 'sun_teen');
      const sun_uni = extract(getVal(cleanRows, ['主日_大專'], 'avg'), 'sun_uni');
      const sun_ya = extract(getVal(cleanRows, ['主日_青職'], 'avg'), 'sun_ya');
      
      // Added '全召會' and '小計' to fallback columns
      let sun_total = extract(getVal(cleanRows, ['主日_小計', '主日_合計', '主日_總計', '主日_總數', '主日_人數', '主日_全召會', '全召會', '小計'], 'avg'), 'sun_total');
      
      if (sun_total === 0) {
          const calculatedSum = sun_child + sun_teen + sun_uni + sun_ya;
          if (calculatedSum > 0) {
              sun_total = calculatedSum;
              details['sun_total'] = (details['sun_total'] || '') + '\n(自動加總: 兒童+中學+大專+青職)';
          }
      }

      // 福音
      const gospel_ya = extract(getVal(cleanRows, ['福音出訪_青職'], 'avg'), 'gospel_ya');
      let gospel_total = extract(getVal(cleanRows, ['福音出訪_小計'], 'avg'), 'gospel_total');
      if (gospel_total === 0 && gospel_ya > 0) gospel_total = gospel_ya;

      // 家聚會
      const home_ya = extract(getVal(cleanRows, ['家聚會出訪_青職', '家聚會受訪_青職'], 'avg'), 'home_ya');
      let home_total = extract(getVal(cleanRows, ['家聚會出訪_小計', '家聚會受訪_小計'], 'avg'), 'home_total');
      if (home_total === 0 && home_ya > 0) home_total = home_ya;

      // 生命讀經
      const life_teen = extract(getVal(cleanRows, ['生命讀經_中學'], 'avg'), 'life_teen');
      const life_uni = extract(getVal(cleanRows, ['生命讀經_大專'], 'avg'), 'life_uni');
      const life_ya = extract(getVal(cleanRows, ['生命讀經_青職'], 'avg'), 'life_ya');
      let life_total = extract(getVal(cleanRows, ['生命讀經_小計'], 'avg'), 'life_total');
      if (life_total === 0) life_total = life_teen + life_uni + life_ya;

      // 小排
      const group_child = extract(getVal(cleanRows, ['小排_學齡前', '小排_小學', '兒童排_學齡前', '兒童排_小學'], 'avg'), 'group_child');
      const group_teen = extract(getVal(cleanRows, ['小排_中學'], 'avg'), 'group_teen');
      const group_uni = extract(getVal(cleanRows, ['小排_大專', '小排_大學'], 'avg'), 'group_uni'); // New Extraction
      const group_ya = extract(getVal(cleanRows, ['小排_青職'], 'avg'), 'group_ya');

      regionRows.push({
        name: churchName, region: group.region,
        bap_roll_call, bap_online,
        bap_child, bap_teen, bap_uni, bap_ya,
        sun_child, sun_teen, sun_uni, sun_ya, sun_total,
        gospel_ya, gospel_total,
        home_ya, home_total,
        life_teen, life_uni, life_ya, life_total,
        group_child, group_teen, group_uni, group_ya,
        details // Store calculation details
      });
    });

    // 計算區域小計
    const subtotal = regionRows.reduce((acc, curr) => {
        const res = { ...acc };
        Object.keys(curr).forEach(k => {
            if (typeof curr[k as keyof MonthlyMetricRow] === 'number') {
                // @ts-ignore
                res[k] = (res[k] || 0) + (curr[k] || 0);
            }
        });
        return res;
    }, { name: `${group.region} 小計`, region: group.region, isSubtotal: true } as MonthlyMetricRow);
    
    results.push(...regionRows, subtotal);
  });

  // 計算總計
  const grandTotal = results.filter(r => r.isSubtotal).reduce((acc, curr) => {
      const res = { ...acc };
      Object.keys(curr).forEach(k => {
          if (typeof curr[k as keyof MonthlyMetricRow] === 'number') {
              // @ts-ignore
              res[k] = (res[k] || 0) + (curr[k] || 0);
          }
      });
      return res;
  }, { name: '合計', isSubtotal: true, isGrandTotal: true } as MonthlyMetricRow);

  results.push(grandTotal);

  return results;
};