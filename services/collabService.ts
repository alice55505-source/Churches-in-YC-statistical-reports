import * as Y from 'yjs';
import { WebrtcProvider } from 'y-webrtc';
import { IndexeddbPersistence } from 'y-indexeddb';
import { ProcessedRow } from '../utils/reportHelpers';

export class CollabService {
  doc: Y.Doc;
  provider: WebrtcProvider | null = null;
  persistence: IndexeddbPersistence | null = null;
  rowsArray: Y.Array<ProcessedRow>;
  currentRoomId: string | null = null;

  constructor() {
    this.doc = new Y.Doc();
    this.rowsArray = this.doc.getArray<ProcessedRow>('table-rows');
  }

  // 連線到指定房間
  connect(roomId: string, initialData: ProcessedRow[] | null = null) {
    if (this.currentRoomId !== roomId) {
      if (this.doc) {
        this.doc.destroy();
      }
      this.doc = new Y.Doc();
      this.rowsArray = this.doc.getArray<ProcessedRow>('table-rows');
      this.currentRoomId = roomId;
    }

    if (this.provider) {
      this.provider.destroy();
    }
    
    // 0. 啟用 IndexedDB 持久化 (重要：確保刷新後資料還在，且能加速同步)
    // 每個房間使用獨立的名稱
    if (this.persistence) {
       this.persistence.destroy();
    }
    this.persistence = new IndexeddbPersistence(`datainsight-room-${roomId}`, this.doc);

    // 1. 建立 WebRTC 連線
    // 使用多個信號伺服器以確保連線穩定性
    this.provider = new WebrtcProvider(`datainsight-pro-room-${roomId}`, this.doc, {
      signaling: [
        'wss://signaling.yjs.dev', 
        'wss://y-webrtc-signaling-eu.herokuapp.com', 
        'wss://y-webrtc-signaling-us.herokuapp.com'
      ],
      filterBcConns: false, // 允許同瀏覽器分頁互通
      password: null
    });

    // 2. 處理初始數據 (僅當 IndexedDB 和 遠端都沒數據時才寫入)
    // 等待 IndexedDB 載入完成後再決定是否寫入 initialData
    this.persistence.whenSynced.then(() => {
        if (initialData && initialData.length > 0) {
            // 如果本地數據庫是空的，才寫入初始數據
            // 這樣避免 User A 刷新後覆蓋掉已有的協作成果
            if (this.rowsArray.length === 0) {
                this.doc.transact(() => {
                  this.rowsArray.push(initialData);
                });
            }
        }
    });
  }

  // 暫時斷開連線
  disconnect() {
    if (this.provider) {
      this.provider.destroy();
      this.provider = null;
    }
    // 保持 persistence 連線，讓本地操作繼續有效
  }

  // 完全重置
  reset() {
    this.disconnect();
    if (this.persistence) {
        this.persistence.clearData(); // 清除 IndexedDB 中的該房數據
        this.persistence.destroy();
        this.persistence = null;
    }
    if (this.doc) {
      this.doc.destroy();
    }
    this.doc = new Y.Doc();
    this.rowsArray = this.doc.getArray<ProcessedRow>('table-rows');
    this.currentRoomId = null;
  }

  // 全量更新
  updateAll(rows: ProcessedRow[]) {
    this.doc.transact(() => {
      this.rowsArray.delete(0, this.rowsArray.length);
      this.rowsArray.push(rows);
    });
  }

  // 訂閱變更
  subscribe(callback: (rows: ProcessedRow[]) => void) {
    const targetArray = this.rowsArray;

    const observer = () => {
      callback(targetArray.toArray());
    };
    targetArray.observe(observer);
    
    // 初始回調
    setTimeout(() => {
        callback(targetArray.toArray());
    }, 0);

    // 當 IndexedDB 載入完成時，強制回調一次
    // 當 WebRTC 同步完成時 (雖然 Yjs 沒有明確的 "sync-done" 事件，但 awareness update 通常伴隨連線)
    if(this.persistence) {
        this.persistence.on('synced', () => {
            callback(targetArray.toArray());
        });
    }

    return () => {
      try {
        targetArray.unobserve(observer);
      } catch (e) {
        // doc destroyed
      }
    };
  }
}

export const collabService = new CollabService();