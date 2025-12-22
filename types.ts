
export interface DataRow {
  [key: string]: string | number | boolean | null;
}

export interface ColumnInfo {
  name: string;
  type: 'string' | 'number' | 'date';
}

export interface AnalysisResult {
  markdown: string;
}

export enum AppStatus {
  IDLE = 'IDLE',
  PROCESSING = 'PROCESSING',
  ANALYZING = 'ANALYZING',
  READY = 'READY',
  ERROR = 'ERROR'
}

// 定義區域與召會結構
export const CHURCH_ORDER = [
  { region: '雲東區', churches: ['斗六', '古坑', '林內', '西螺', '莿桐', '斗南'] },
  { region: '雲西區', churches: ['虎尾', '土庫', '北港', '口湖', '崙背', '褒忠', '二崙', '麥寮'] },
  { region: '朴子區', churches: ['朴子', '布袋', '鹿草', '太保', '水上'] },
  { region: '嘉義區', churches: ['嘉義', '梅山', '中埔', '竹崎', '番路'] },
  { region: '民雄區', churches: ['民雄', '六腳', '溪口', '大林', '新港'] }
];