
import { DataRow, CHURCH_ORDER } from '../types';
import { processMonthlyReport } from './monthlyHelpers';

// 預設數據：兒童排數
const INITIAL_CHILD_GROUP_COUNTS: Record<string, number> = {
  '斗六': 1, '古坑': 1, '林內': 1, '西螺': 1, '莿桐': 1, '斗南': 3,
  '虎尾': 0, '土庫': 1, '北港': 0, '口湖': 0, '崙背': 1, '褒忠': 0, '二崙': 0, '麥寮': 0,
  '朴子': 8, '布袋': 1, '鹿草': 0, '太保': 1, '水上': 1,
  '嘉義': 10, '梅山': 1, '中埔': 1, '竹崎': 2, '番路': 1,
  '民雄': 3, '六腳': 0, '溪口': 1, '大林': 0, '新港': 1
};

// 預設數據：青少排數
const INITIAL_TEEN_GROUP_COUNTS: Record<string, number> = {
  '斗六': 1, '古坑': 0, '林內': 0, '西螺': 1, '莿桐': 0, '斗南': 1,
  '虎尾': 0, '土庫': 0, '北港': 0, '口湖': 0, '崙背': 1, '褒忠': 0, '二崙': 1, '麥寮': 0,
  '朴子': 3, '布袋': 0, '鹿草': 1, '太保': 1, '水上': 1,
  '嘉義': 8, '梅山': 0, '中埔': 1, '竹崎': 1, '番路': 3,
  '民雄': 1, '六腳': 0, '溪口': 1, '大林': 1, '新港': 1
};

// 2. 定義數據結構介面
export interface ProcessedRow {
  name: string;
  isSubtotal?: boolean;
  isGrandTotal?: boolean; 
  isLastYear?: boolean;   
  region?: string;
  
  // 一、受浸人數
  bap_ya_target: number; bap_ya_actual: number;
  bap_uni_target: number; bap_uni_actual: number;
  bap_teen_target: number; bap_teen_actual: number;
  bap_youth_goal: number; bap_youth_total: number; bap_youth_rate: string;
  bap_other_actual: number;
  bap_all_goal: number; bap_all_total: number; bap_all_rate: string;

  // 二、福家及生命讀經
  vis_ya_avg: number; vis_ya_rate: string;
  vis_all_avg: number; vis_all_rate: string;
  
  home_ya_avg: number; home_ya_rate: string;
  home_all_avg: number; home_all_rate: string;
  
  life_ya_avg: number; life_ya_rate: string;
  life_all_avg: number; life_all_rate: string;

  // 三、小排與大學之家
  grp_ya_avg: number; // 青職人數 (Label changed from Avg to Count per request)
  grp_uni_cnt: number; // 大學人數 (Changed from Manual to Auto extracted from report)
  grp_teen_cnt: number; grp_teen_avg: number; // 青少排數, 青少人數
  grp_child_cnt: number; grp_child_w_avg: number;
  uni_house_cnt: number;

  // 四、主日聚會
  sun_ya_base: number; sun_ya_avg: number; sun_ya_pct: string;
  sun_uni_base: number; sun_uni_avg: number;
  sun_teen_base: number; sun_teen_avg: number;
  sun_child_base: number; sun_child_w_avg: number; 
  sun_all_base: number; sun_all_avg: number; sun_all_yoy: string;
  sun_all_avg_details?: string;

  // 五、召會生活
  cl_count: number;
}

// 輔助函式：計算百分比
const calcRate = (numerator: number, denominator: number): string => {
  if (denominator === 0) return '0.0%';
  return ((numerator / denominator) * 100).toFixed(1) + '%';
};

// 輔助函式：加總兩個 Rows
const sumRows = (acc: ProcessedRow, curr: ProcessedRow): ProcessedRow => {
  const result = { ...acc };
  const numericKeys = Object.keys(curr).filter(k => typeof curr[k as keyof ProcessedRow] === 'number') as (keyof ProcessedRow)[];
  
  numericKeys.forEach(k => {
    // @ts-ignore
    result[k] = (result[k] || 0) + (curr[k] || 0);
  });
  return result;
};

// 輔助函式：根據數值重新計算百分比欄位
// Exporting this mainly for internal use or if needed externally
export const recalcRatesForRow = (row: ProcessedRow): ProcessedRow => {
  const newRow = { ...row };
  
  // 受浸達成率 = 實際 / 目標
  newRow.bap_youth_rate = calcRate(newRow.bap_youth_total, newRow.bap_youth_goal);
  newRow.bap_all_rate = calcRate(newRow.bap_all_total, newRow.bap_all_goal);
  
  // 福音出訪達成率 = 平均 / 主日基數 (依使用者需求修改)
  newRow.vis_ya_rate = calcRate(newRow.vis_ya_avg, newRow.sun_ya_base);
  newRow.vis_all_rate = calcRate(newRow.vis_all_avg, newRow.sun_all_base);
  
  // 家聚會達成率 = 平均 / 主日基數 (依使用者需求修改)
  newRow.home_ya_rate = calcRate(newRow.home_ya_avg, newRow.sun_ya_base);
  newRow.home_all_rate = calcRate(newRow.home_all_avg, newRow.sun_all_base);
  
  // 生命讀經達成率 = 平均 / 主日基數 (依使用者需求修改)
  newRow.life_ya_rate = calcRate(newRow.life_ya_avg, newRow.sun_ya_base);
  newRow.life_all_rate = calcRate(newRow.life_all_avg, newRow.sun_all_base);
  
  // 主日青職佔比 = 青職平均 / 全召會平均
  newRow.sun_ya_pct = calcRate(newRow.sun_ya_avg, newRow.sun_all_avg);
  
  // 全召會年增率 (這裡以 平均 / 基數 表示達成或成長狀況)
  newRow.sun_all_yoy = calcRate(newRow.sun_all_avg, newRow.sun_all_base);
  
  return newRow;
};

// Modified: skipFields allows preserving manually edited values for fields that are usually calculated
export const recalculateRow = (row: ProcessedRow, skipFields: (keyof ProcessedRow)[] = []): ProcessedRow => {
  const newRow = { ...row };
  
  // 總數計算：這裡確保由各細項加總
  
  // 1. 青年總計
  if (!skipFields.includes('bap_youth_total')) {
      newRow.bap_youth_total = (newRow.bap_ya_actual || 0) + (newRow.bap_uni_actual || 0) + (newRow.bap_teen_actual || 0);
  }
  if (!skipFields.includes('bap_youth_goal')) {
      newRow.bap_youth_goal = (newRow.bap_ya_target || 0) + (newRow.bap_uni_target || 0) + (newRow.bap_teen_target || 0);
  }
  
  // 2. 全召會總計
  if (!skipFields.includes('bap_all_total')) {
      newRow.bap_all_total = newRow.bap_youth_total + (newRow.bap_other_actual || 0);
  }
  
  // 這裡修正邏輯：如果 user 手動修改了 bap_all_goal (全召會總目標)，我們就不要用公式覆蓋它
  if (!skipFields.includes('bap_all_goal')) {
      newRow.bap_all_goal = newRow.bap_youth_goal + ((newRow.bap_other_actual || 0) > 0 ? 5 : 0);
  }
  
  return recalcRatesForRow(newRow);
};

export const recalculateSubtotals = (rows: ProcessedRow[]): ProcessedRow[] => {
  const newRows = [...rows];
  const regions = Array.from(new Set(newRows.filter(r => r.region && !r.isSubtotal).map(r => r.region)));

  regions.forEach(region => {
    const regionRows = newRows.filter(r => r.region === region && !r.isSubtotal);
    const subtotalIndex = newRows.findIndex(r => r.region === region && r.isSubtotal);
    
    if (subtotalIndex !== -1 && regionRows.length > 0) {
      let newSubtotal = { ...newRows[subtotalIndex] };
      Object.keys(newSubtotal).forEach(k => {
         if (typeof newSubtotal[k as keyof ProcessedRow] === 'number') {
            // @ts-ignore
            newSubtotal[k] = 0;
         }
      });
      regionRows.forEach(row => {
          newSubtotal = sumRows(newSubtotal, row);
      });
      newRows[subtotalIndex] = recalcRatesForRow(newSubtotal);
    }
  });

  const grandTotalIndex = newRows.findIndex(r => r.name === '合計');
  if (grandTotalIndex !== -1) {
    const subtotals = newRows.filter(r => r.isSubtotal && r.name !== '合計' && !r.isGrandTotal);
    if (subtotals.length > 0) {
      let newGrandTotal = { ...newRows[grandTotalIndex] };
       Object.keys(newGrandTotal).forEach(k => {
         if (typeof newGrandTotal[k as keyof ProcessedRow] === 'number') {
            // @ts-ignore
            newGrandTotal[k] = 0;
         }
      });
      subtotals.forEach(sub => {
        newGrandTotal = sumRows(newGrandTotal, sub);
      });
      newGrandTotal = recalcRatesForRow(newGrandTotal);
      newRows[grandTotalIndex] = newGrandTotal;
    }
  }
  return newRows;
};

// Improved Merge Logic: Handles Averages vs Sums vs Targets correctly
export const mergeProcessedRows = (current: ProcessedRow[], incoming: ProcessedRow[]): ProcessedRow[] => {
    const incomingMap = new Map(incoming.map(r => [r.name, r]));
    return current.map(row => {
        // [FIX] Do NOT skip isLastYear, only skip calculated subtotals/totals
        if (row.isSubtotal || row.isGrandTotal) return row;
        
        const inc = incomingMap.get(row.name);
        if (!inc) return row;
        
        const merged = { ...row };
        
        Object.keys(merged).forEach(key => {
            const k = key as keyof ProcessedRow;
            if (typeof merged[k] === 'number') {
                const valCurr = Number(merged[k]) || 0;
                const valInc = Number(inc[k]) || 0;

                // Identify column type
                const isAvg = k.includes('_avg');
                const isRate = k.includes('_rate') || k.includes('_pct') || k.includes('_yoy');
                const isTarget = k.includes('_target') || k.includes('_goal') || k.includes('_base');
                const isCount = k.endsWith('_cnt'); // New type for group counts
                
                // Merge logic based on type
                if (isTarget || k === 'cl_count' || isCount) {
                    // For Targets/Bases/Manual fields/Group Counts: Take MAX (or overwrite if current is 0)
                    // @ts-ignore
                    merged[k] = Math.max(valCurr, valInc);
                } else if (isAvg || isRate) {
                    // For Averages/Rates: Overwrite with Incoming
                    // @ts-ignore
                    merged[k] = valInc;
                } else {
                    // For Actuals/Counts: Sum
                    // @ts-ignore
                    merged[k] = valCurr + valInc;
                }
            }
        });

        if (inc.sun_all_avg_details) {
            merged.sun_all_avg_details = inc.sun_all_avg_details;
        }
        
        // Don't recalc "Last Year" row, just keep merged values
        if (row.isLastYear) return merged;
        
        return recalculateRow(merged);
    });
};

// ----------------------------------------
// 改寫：直接從 Processed Monthly Report 轉換
// 確保總表的「實際」欄位與月報表完全連動
// ----------------------------------------
export const processConsolidatedData = (rawData: DataRow[], legacyRows?: ProcessedRow[]): ProcessedRow[] => {
  // [Fix] Handle mixed content (Legacy Processed Rows + New Raw Rows)
  let readyRows: ProcessedRow[] = legacyRows || [];
  const rawRows: DataRow[] = [];

  rawData.forEach(r => {
      if ('bap_ya_actual' in r && 'name' in r) {
          readyRows.push(r as unknown as ProcessedRow);
      } else {
          rawRows.push(r);
      }
  });

  // If we only have ready rows and no raw data, return them (legacy behavior fast path)
  if (rawRows.length === 0 && readyRows.length > 0) {
      return readyRows;
  }

  // Otherwise, we calculate the fresh rows from raw data
  const monthlyData = processMonthlyReport(rawRows);
  const monthlyMap = new Map(monthlyData.map(m => [m.name, m]));

  const finalRows: ProcessedRow[] = [];

  // 2. 依照區域/召會順序建構總表
  CHURCH_ORDER.forEach(group => {
    const regionRows: ProcessedRow[] = [];
    
    group.churches.forEach(churchName => {
      // 取得對應的月報表數據
      const mData = monthlyMap.get(churchName);

      // 受浸細項邏輯
      const teenActual = (mData ? mData.bap_child : 0) + (mData ? mData.bap_teen : 0);
      const uniActual = mData ? mData.bap_uni : 0;
      const yaActual = mData ? mData.bap_ya : 0;
      const totalActual = mData ? mData.bap_roll_call : 0; 
      
      const youthTotal = teenActual + uniActual + yaActual;
      const otherActual = Math.max(0, totalActual - youthTotal);

      // 定義基礎 Row
      const row: ProcessedRow = {
        name: churchName,
        region: group.region,
        
        // 受浸
        bap_ya_target: 0, 
        bap_ya_actual: yaActual,
        bap_uni_target: 0, 
        bap_uni_actual: uniActual,
        bap_teen_target: 0, 
        bap_teen_actual: teenActual,
        bap_youth_goal: 0, 
        bap_youth_total: youthTotal, 
        bap_youth_rate: '0.0%',
        bap_other_actual: otherActual,
        bap_all_goal: 0, 
        bap_all_total: totalActual,
        bap_all_rate: '0.0%',

        // 福音出訪
        vis_ya_avg: mData ? mData.gospel_ya : 0, vis_ya_rate: '0.0%',
        vis_all_avg: mData ? mData.gospel_total : 0, vis_all_rate: '0.0%',

        // 家聚會
        home_ya_avg: mData ? mData.home_ya : 0, home_ya_rate: '0.0%',
        home_all_avg: mData ? mData.home_total : 0, home_all_rate: '0.0%',

        // 生命讀經
        life_ya_avg: mData ? mData.life_ya : 0, life_ya_rate: '0.0%',
        life_all_avg: mData ? mData.life_total : 0, life_all_rate: '0.0%',

        // 小排
        grp_ya_avg: mData ? mData.group_ya : 0,
        grp_uni_cnt: mData ? mData.group_uni : 0, // Now automatically mapped
        // 優先使用月報表數據，若無則使用預設值
        grp_teen_cnt: INITIAL_TEEN_GROUP_COUNTS[churchName] || 0, 
        grp_teen_avg: mData ? mData.group_teen : 0,
        grp_child_cnt: INITIAL_CHILD_GROUP_COUNTS[churchName] || 0, 
        grp_child_w_avg: mData ? mData.group_child : 0,
        uni_house_cnt: 0,

        // 主日
        sun_ya_base: 0, sun_ya_avg: mData ? mData.sun_ya : 0, sun_ya_pct: '0.0%',
        sun_uni_base: 0, sun_uni_avg: mData ? mData.sun_uni : 0,
        sun_teen_base: 0, sun_teen_avg: mData ? mData.sun_teen : 0,
        sun_child_base: 0, sun_child_w_avg: mData ? mData.sun_child : 0,
        sun_all_base: 0, sun_all_avg: mData ? mData.sun_total : 0, sun_all_yoy: '0.0%',
        
        cl_count: 0
      };

      regionRows.push(recalculateRow(row));
    });

    // 加入小計 Placeholder
    const subtotal: ProcessedRow = { 
        name: `${group.region} 小計`, region: group.region, isSubtotal: true,
        bap_ya_target: 0, bap_ya_actual: 0, bap_uni_target: 0, bap_uni_actual: 0,
        bap_teen_target: 0, bap_teen_actual: 0, bap_youth_goal: 0, bap_youth_total: 0, bap_youth_rate: '0.0%',
        bap_other_actual: 0, bap_all_goal: 0, bap_all_total: 0, bap_all_rate: '0.0%',
        vis_ya_avg: 0, vis_ya_rate: '0.0%', vis_all_avg: 0, vis_all_rate: '0.0%',
        home_ya_avg: 0, home_ya_rate: '0.0%', home_all_avg: 0, home_all_rate: '0.0%',
        life_ya_avg: 0, life_ya_rate: '0.0%', life_all_avg: 0, life_all_rate: '0.0%',
        grp_ya_avg: 0, grp_uni_cnt: 0, grp_teen_cnt: 0, grp_teen_avg: 0,
        grp_child_cnt: 0, grp_child_w_avg: 0, uni_house_cnt: 0, 
        sun_ya_base: 0, sun_ya_avg: 0, sun_ya_pct: '0.0%',
        sun_uni_base: 0, sun_uni_avg: 0, sun_teen_base: 0, sun_teen_avg: 0,
        sun_child_base: 0, sun_child_w_avg: 0, 
        sun_all_base: 0, sun_all_avg: 0, sun_all_yoy: '0.0%', cl_count: 0
    };
    finalRows.push(...regionRows, subtotal);
  });

  // 加入總計 Placeholder
  const grandTotal: ProcessedRow = { 
    name: '合計', isSubtotal: true, isGrandTotal: true,
    bap_ya_target: 0, bap_ya_actual: 0, bap_uni_target: 0, bap_uni_actual: 0,
    bap_teen_target: 0, bap_teen_actual: 0, bap_youth_goal: 0, bap_youth_total: 0, bap_youth_rate: '0.0%',
    bap_other_actual: 0, bap_all_goal: 0, bap_all_total: 0, bap_all_rate: '0.0%',
    vis_ya_avg: 0, vis_ya_rate: '0.0%', vis_all_avg: 0, vis_all_rate: '0.0%',
    home_ya_avg: 0, home_ya_rate: '0.0%', home_all_avg: 0, home_all_rate: '0.0%',
    life_ya_avg: 0, life_ya_rate: '0.0%', life_all_avg: 0, life_all_rate: '0.0%',
    grp_ya_avg: 0, grp_uni_cnt: 0, grp_teen_cnt: 0, grp_teen_avg: 0,
    grp_child_cnt: 0, grp_child_w_avg: 0, uni_house_cnt: 0, 
    sun_ya_base: 0, sun_ya_avg: 0, sun_ya_pct: '0.0%',
    sun_uni_base: 0, sun_uni_avg: 0, sun_teen_base: 0, sun_teen_avg: 0,
    sun_child_base: 0, sun_child_w_avg: 0, 
    sun_all_base: 0, sun_all_avg: 0, sun_all_yoy: '0.0%', cl_count: 0
  };
  finalRows.push(grandTotal);

  let recalculatedRows = recalculateSubtotals(finalRows);

  // 加入去年統計 Placeholder
  const lastYearRow: ProcessedRow = {
    name: '去年統計', isSubtotal: false, isLastYear: true,  
    bap_ya_target: 0, bap_ya_actual: 0, bap_uni_target: 0, bap_uni_actual: 0,
    bap_teen_target: 0, bap_teen_actual: 0, bap_youth_goal: 0, bap_youth_total: 0, bap_youth_rate: '0.0%',
    bap_other_actual: 0, bap_all_goal: 0, bap_all_total: 0, bap_all_rate: '0.0%',
    vis_ya_avg: 0, vis_ya_rate: '0.0%', vis_all_avg: 0, vis_all_rate: '0.0%',
    home_ya_avg: 0, home_ya_rate: '0.0%', home_all_avg: 0, home_all_rate: '0.0%',
    life_ya_avg: 0, life_ya_rate: '0.0%', life_all_avg: 0, life_all_rate: '0.0%',
    grp_ya_avg: 0, grp_uni_cnt: 0, grp_teen_cnt: 0, grp_teen_avg: 0,
    grp_child_cnt: 0, grp_child_w_avg: 0, uni_house_cnt: 0, 
    sun_ya_base: 0, sun_ya_avg: 0, sun_ya_pct: '0.0%',
    sun_uni_base: 0, sun_uni_avg: 0, sun_teen_base: 0, sun_teen_avg: 0,
    sun_child_base: 0, sun_child_w_avg: 0, 
    sun_all_base: 0, sun_all_avg: 0, sun_all_yoy: '0.0%', cl_count: 0
  };
  recalculatedRows.push(lastYearRow);

  // If we have readyRows (legacy/manual), merge carefully with fresh calculation
  if (readyRows.length > 0) {
      const readyMap = new Map(readyRows.map(r => [r.name, r]));
      
      recalculatedRows = recalculatedRows.map(curr => {
          if (curr.isSubtotal || curr.isGrandTotal) return curr;

          const ready = readyMap.get(curr.name);
          if (!ready) return curr;

          const merged = { ...curr };
          
          Object.keys(merged).forEach(key => {
              const k = key as keyof ProcessedRow;
              if (typeof merged[k] === 'number') {
                  const valCalc = Number(curr[k]) || 0;
                  const valReady = Number(ready[k]) || 0;

                  // 1. Targets & Manual Fields: Trust ReadyRows (User Input)
                  if (k.includes('_target') || k.includes('_goal') || k.includes('_base') || k === 'cl_count' || k.endsWith('_cnt')) {
                      // @ts-ignore
                      merged[k] = Math.max(valCalc, valReady); 
                  }
                  
                  // 2. Metrics (Actuals/Averages): Trust Calculated (Fresh Raw Data)
                  // UNLESS Calculated is 0 and Ready has value (Manual Entry case)
                  else {
                      if (valCalc === 0 && valReady > 0) {
                          // @ts-ignore
                          merged[k] = valReady;
                      }
                  }
              }
          });
          
          if (ready.sun_all_avg_details && !merged.sun_all_avg_details) {
             merged.sun_all_avg_details = ready.sun_all_avg_details;
          }

          return recalculateRow(merged);
      });

      // After merging manual values, we must recalculate all subtotals
      recalculatedRows = recalculateSubtotals(recalculatedRows);
  }

  return recalculatedRows;
};
