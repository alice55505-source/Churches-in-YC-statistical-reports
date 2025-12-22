import React, { useMemo } from 'react';
import { 
  ResponsiveContainer, 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend, 
  AreaChart,
  Area
} from 'recharts';
import { DataRow, ColumnInfo } from '../types';

interface DataChartsProps {
  data: DataRow[];
  columns: ColumnInfo[];
}

const DataCharts: React.FC<DataChartsProps> = ({ data, columns }) => {
  const { xAxisKey, numberKeys } = useMemo(() => {
    let xKey = '';
    const nKeys: string[] = [];

    // Prioritize "日期", "Date", "Month" or first string column
    const candidateX = columns.find(c => ['日期', 'Date', 'Month', 'Name', 'Region'].some(k => c.name.includes(k))) 
                    || columns.find(c => c.type === 'string');
    if (candidateX) xKey = candidateX.name;

    columns.forEach(c => {
      // Exclude year-like numbers or ID-like numbers if possible, but hard to tell strictly
      if (c.type === 'number' && c.name !== xKey) nKeys.push(c.name);
    });

    // Limit to top 6 metrics to handle the user's complex sheet without breaking the chart
    return { xAxisKey: xKey, numberKeys: nKeys.slice(0, 6) }; 
  }, [columns]);

  if (!xAxisKey || numberKeys.length === 0) {
    return (
      <div className="p-8 text-center text-gray-500 bg-white rounded-lg border border-gray-200">
        無法自動識別適合繪圖的數值欄位。請確保數據包含數字欄位。
      </div>
    );
  }

  // Pre-calculate totals
  const summary = useMemo(() => {
    return numberKeys.map(key => {
      const sum = data.reduce((acc, curr) => acc + (Number(curr[key]) || 0), 0);
      const avg = sum / data.length;
      return { key, sum, avg };
    });
  }, [data, numberKeys]);

  const colors = ["#6366f1", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899"];

  return (
    <div className="space-y-8">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        {summary.map((item, idx) => (
          <div key={item.key} className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide truncate" title={item.key}>{item.key}</p>
            <div className="mt-1">
              <span className="text-lg font-bold text-gray-900">
                {item.sum.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </span>
            </div>
            <div className="mt-1 text-[10px] text-gray-400">
              Avg: {item.avg.toLocaleString(undefined, { maximumFractionDigits: 1 })}
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-8">
        {/* Main Bar Chart - Full Width for better visibility of many columns */}
        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm min-h-[450px]">
          <h3 className="text-lg font-semibold text-gray-800 mb-6">數據分佈總覽</h3>
          <div className="h-[350px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.slice(0, 30)}> 
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis 
                  dataKey={xAxisKey} 
                  tick={{ fontSize: 11, fill: '#64748b' }} 
                  axisLine={false}
                  tickLine={false}
                  interval={0}
                />
                <YAxis 
                  tick={{ fontSize: 11, fill: '#64748b' }} 
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip 
                  contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                  cursor={{fill: '#f8fafc'}}
                />
                <Legend iconType="circle" />
                {numberKeys.map((key, idx) => (
                  <Bar 
                    key={key} 
                    dataKey={key} 
                    fill={colors[idx % colors.length]} 
                    radius={[2, 2, 0, 0]} 
                    maxBarSize={50}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DataCharts;