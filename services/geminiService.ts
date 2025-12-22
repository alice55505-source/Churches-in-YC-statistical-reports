import { GoogleGenAI } from "@google/genai";
import { DataRow } from '../types';

const getAiClient = () => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    throw new Error("API Key not found");
  }
  return new GoogleGenAI({ apiKey });
};

export const generateDataReport = async (data: DataRow[], context: string = ""): Promise<string> => {
  try {
    const ai = getAiClient();
    
    // Increase sample size to capture multi-file data patterns
    const dataSample = data.slice(0, 400); 
    const dataStr = JSON.stringify(dataSample);

    const prompt = `
      你是資深的商業數據分析專家。請根據以下整合後的數據集（JSON 格式）生成一份專業的統計分析報告。
      
      數據集 (前 400 筆):
      \`\`\`json
      ${dataStr}
      \`\`\`

      ${context ? `使用者額外指示: ${context}` : ''}

      **注意：**
      *   數據集中包含 **「來源報表」** 欄位。這代表數據來自不同的檔案（例如不同月份、不同部門的報表）。
      *   請務必利用此欄位進行 **跨報表比較** 或 **趨勢分析**。

      **任務要求：**
      1. **結構化數據匯總**：包含一個 Markdown 表格，模仿正式統計報表，將數據按「來源報表」或其他關鍵類別進行匯總對比。
      2. **綜合洞察 (Consolidated Insights)**：
          *   如果有多個來源，比較它們之間的差異（例如：A 報表 vs B 報表）。
          *   如果是時間序列（例如 1月 vs 2月），分析成長趨勢。
      3. **關鍵發現 (Key Findings)**：列出最重要的 3-5 個數據亮點。
      4. **策略建議 (Recommendations)**：基於整體數據的改進方向。

      請使用**繁體中文**撰寫，語氣專業且客觀。
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: {
        thinkingConfig: { thinkingBudget: 1024 } 
      }
    });

    return response.text || "無法生成報告，請稍後再試。";
  } catch (error) {
    console.error("Gemini API Error:", error);
    throw new Error("分析生成失敗，請檢查 API Key 或網絡連線。");
  }
};