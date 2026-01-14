import React, { useRef } from 'react';
import Draggable from 'react-draggable';
import { ResizableBox } from 'react-resizable';
import { X, Minus, Square, Maximize2 } from 'lucide-react';
import { useAppStore, type WindowState } from '../../store/appStore';
import { cn } from '../../utils/cn';
import 'react-resizable/css/styles.css';

interface WindowContainerProps {
  window: WindowState;
  children: React.ReactNode;
}

export const WindowContainer = ({ window, children }: WindowContainerProps) => {
  const { focusWindow, updateWindow, activeWindowId } = useAppStore();
  const nodeRef = useRef(null);
  
  const isActive = activeWindowId === window.id;

  // Handle Maximize logic purely via CSS/State overrides or just standard size updates
  // For simplicity, we'll just toggle a class or style. 
  // If maximized, we disable dragging and resizing.
  
  if (window.isMinimized) {
    return null; // Don't render if minimized (or render in a dock/taskbar - to be implemented if needed)
  }

  const handleResize = (_e: any, { size }: any) => {
    updateWindow(window.id, { size });
  };

  const handleDrag = (_e: any, { x, y }: any) => {
     updateWindow(window.id, { position: { x, y } });
  };

  const style: React.CSSProperties = {
    zIndex: window.zIndex,
    position: 'absolute',
  };

  if (window.isMaximized) {
    return (
      <div 
        className={cn(
          "fixed inset-0 m-0 z-[100] flex flex-col bg-black border border-neutral-800 shadow-2xl",
          isActive ? "border-neutral-600 ring-1 ring-neutral-700" : "opacity-90"
        )}
        onMouseDown={() => focusWindow(window.id)}
      >
        <WindowTitleBar window={window} />
        <div className="flex-1 overflow-auto bg-neutral-900/90 relative">
          {children}
        </div>
      </div>
    );
  }

  return (
    <Draggable
      handle=".window-handle"
      defaultPosition={window.position}
      position={window.position}
      onStart={() => focusWindow(window.id)}
      onStop={handleDrag}
      nodeRef={nodeRef}
      bounds="parent"
    >
      <div 
        ref={nodeRef}
        style={style} 
        className={cn(
            "flex flex-col bg-black border border-neutral-800 shadow-2xl rounded-lg overflow-hidden transition-shadow duration-200",
            isActive ? "border-neutral-600 shadow-[0_0_20px_rgba(0,0,0,0.5)]" : "opacity-90"
        )}
      >
        <ResizableBox
          width={window.size.width}
          height={window.size.height}
          minConstraints={[300, 200]}
          maxConstraints={[1920, 1080]}
          onResize={handleResize}
          resizeHandles={['se']}
          className="flex flex-col h-full w-full"
        >
          <WindowTitleBar window={window} />
          <div className="flex-1 overflow-auto bg-neutral-900/90 relative cursor-default">
             {children}
          </div>
        </ResizableBox>
      </div>
    </Draggable>
  );
};

const WindowTitleBar = ({ window }: { window: WindowState }) => {
  const { closeWindow, minimizeWindow, maximizeWindow } = useAppStore();

  return (
    <div className="window-handle h-9 bg-neutral-900 border-b border-neutral-800 flex items-center justify-between px-3 cursor-grab active:cursor-grabbing select-none">
      <div className="flex items-center space-x-2">
        <div className={cn("w-2 h-2 rounded-full", window.id.includes('jupyter') ? "bg-orange-500" : window.id.includes('dashboard') ? "bg-blue-500" : "bg-green-500")} />
        <span className="text-xs font-medium text-neutral-300">{window.title}</span>
      </div>
      <div className="flex items-center space-x-1" onMouseDown={(e) => e.stopPropagation()}>
        <button onClick={() => minimizeWindow(window.id)} className="p-1 hover:bg-neutral-800 rounded text-neutral-400 hover:text-white">
          <Minus size={12} />
        </button>
        <button onClick={() => maximizeWindow(window.id)} className="p-1 hover:bg-neutral-800 rounded text-neutral-400 hover:text-white">
          {window.isMaximized ? <Square size={10} /> : <Maximize2 size={10} />}
        </button>
        <button onClick={() => closeWindow(window.id)} className="p-1 hover:bg-red-900/50 hover:text-red-200 rounded text-neutral-400">
          <X size={12} />
        </button>
      </div>
    </div>
  );
};
