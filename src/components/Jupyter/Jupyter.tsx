import { useState } from 'react';
import Editor from '@monaco-editor/react';
import { Play, Plus, Trash2, RefreshCw } from 'lucide-react';

interface Cell {
  id: string;
  code: string;
  output: string | null;
  type: 'code' | 'markdown';
}

export const Jupyter = ({ }: any) => {
  const [cells, setCells] = useState<Cell[]>([
    { 
      id: '1', 
      code: 'import pandas as pd\nimport numpy as np\n\ndf = pd.read_csv("data.csv")\ndf.head()', 
      output: null, 
      type: 'code' 
    }
  ]);

  const runCell = (id: string) => {
    setCells(cells.map(cell => {
      if (cell.id === id) {
        // Mock execution
        return { 
          ...cell, 
          output: `[Output for cell ${id}]\n  id    name    value\n0  1    A       10\n1  2    B       20\n2  3    C       30` 
        };
      }
      return cell;
    }));
  };

  const addCell = () => {
    const newCell: Cell = {
      id: Date.now().toString(),
      code: '',
      output: null,
      type: 'code'
    };
    setCells([...cells, newCell]);
  };

  const deleteCell = (id: string) => {
    setCells(cells.filter(c => c.id !== id));
  };

  const updateCellCode = (id: string, value: string | undefined) => {
    setCells(cells.map(c => c.id === id ? { ...c, code: value || '' } : c));
  };

  return (
    <div className="flex flex-col h-full bg-[#1e1e1e] text-white">
      {/* Toolbar */}
      <div className="h-10 bg-[#2d2d2d] border-b border-neutral-700 flex items-center px-4 space-x-2">
        <button onClick={addCell} className="p-1 hover:bg-neutral-700 rounded text-neutral-300" title="Add Code Cell">
          <Plus size={16} />
        </button>
        <button onClick={() => setCells(cells.map(c => ({...c, output: null})))} className="p-1 hover:bg-neutral-700 rounded text-neutral-300" title="Clear All Outputs">
          <RefreshCw size={16} />
        </button>
        <span className="text-xs text-neutral-500 ml-4">Python 3 (ipykernel)</span>
      </div>

      {/* Cells Container */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {cells.map((cell, index) => (
          <div key={cell.id} className="group relative flex flex-col">
            <div className="flex">
               {/* Gutter / Run Button */}
               <div className="w-12 flex flex-col items-end pr-2 pt-2 text-xs text-neutral-500 select-none">
                 <span className="mb-2">[{index + 1}]:</span>
                 <button 
                   onClick={() => runCell(cell.id)}
                   className="p-1 hover:bg-neutral-800 rounded text-green-500 hover:text-green-400"
                 >
                   <Play size={14} />
                 </button>
               </div>

               {/* Editor Area */}
               <div className="flex-1 min-w-0 border border-neutral-700 rounded-md overflow-hidden bg-[#1e1e1e]">
                 <div className="py-2">
                   <Editor
                     height="120px"
                     defaultLanguage="python"
                     theme="vs-dark"
                     value={cell.code}
                     onChange={(val) => updateCellCode(cell.id, val)}
                     options={{
                       minimap: { enabled: false },
                       lineNumbers: 'off',
                       scrollBeyondLastLine: false,
                       folding: false,
                       fontSize: 14,
                       fontFamily: 'JetBrains Mono, monospace',
                       padding: { top: 8, bottom: 8 }
                     }}
                   />
                 </div>
               </div>
            </div>

            {/* Output Area */}
            {cell.output && (
              <div className="flex mt-2">
                <div className="w-12"></div> {/* Spacer */}
                <div className="flex-1 overflow-x-auto bg-neutral-900 border border-neutral-800 rounded p-2 text-sm font-mono text-neutral-300">
                  <pre>{cell.output}</pre>
                </div>
              </div>
            )}
            
            {/* Delete Button (Visible on Hover) */}
            <button 
              onClick={() => deleteCell(cell.id)}
              className="absolute right-2 top-2 p-1 bg-neutral-800 rounded opacity-0 group-hover:opacity-100 transition-opacity text-neutral-400 hover:text-red-400"
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))}
        
        <div className="h-20 flex items-center justify-center border-2 border-dashed border-neutral-800 rounded-lg text-neutral-600 hover:border-neutral-600 hover:text-neutral-400 cursor-pointer transition-colors" onClick={addCell}>
          <Plus size={24} className="mr-2" />
          <span>Add New Cell</span>
        </div>
      </div>
    </div>
  );
};
