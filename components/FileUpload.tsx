import React, { useRef } from 'react';
import { UploadCloud } from 'lucide-react';

interface FileUploadProps {
  onFilesSelected: (files: File[]) => void;
  isLoading: boolean;
}

const FileUpload: React.FC<FileUploadProps> = ({ onFilesSelected, isLoading }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      onFilesSelected(Array.from(e.target.files));
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (isLoading) return;
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      onFilesSelected(Array.from(e.dataTransfer.files));
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  return (
    <div 
      className={`relative group border-2 border-dashed rounded-xl p-8 text-center transition-all duration-300 cursor-pointer overflow-hidden
        ${isLoading 
          ? 'border-stone-200 bg-stone-50 opacity-60 cursor-not-allowed' 
          : 'border-stone-300 bg-stone-50 hover:border-[#fbbf24] hover:bg-[#fffbeb] hover:shadow-lg'}`}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onClick={() => !isLoading && fileInputRef.current?.click()}
      title="點擊或拖放檔案以上傳"
    >
      <input 
        type="file" 
        multiple 
        accept=".csv,.json,.xls,.xlsx" 
        className="hidden" 
        ref={fileInputRef} 
        onChange={handleFileChange}
        disabled={isLoading}
      />
      
      <div className="flex flex-col items-center justify-center relative z-10">
        <div className={`p-4 rounded-full transition-all duration-300 transform group-hover:scale-110 group-hover:rotate-6
          ${isLoading ? 'bg-stone-100 text-stone-400' : 'bg-white text-stone-400 border border-stone-200 group-hover:text-[#fbbf24] group-hover:border-[#fbbf24]'}`}>
          <UploadCloud size={40} strokeWidth={1.5} />
        </div>
      </div>
      
      {/* Decorative corners for the 'tech' feel being replaced by 'hand-drawn' feel, just simple corners now */}
      {!isLoading && (
        <>
          <div className="absolute top-0 left-0 w-4 h-4 border-t-2 border-l-2 border-[#fbbf24] rounded-tl opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
          <div className="absolute bottom-0 right-0 w-4 h-4 border-b-2 border-r-2 border-[#fbbf24] rounded-br opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
        </>
      )}
    </div>
  );
};

export default FileUpload;