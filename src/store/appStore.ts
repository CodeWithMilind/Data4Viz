import { create } from 'zustand';

export type WindowType = 'dashboard' | 'jupyter' | 'assistant' | 'visuals' | 'data-summary';

export interface WindowState {
  id: string;
  type: WindowType;
  title: string;
  isOpen: boolean;
  isMinimized: boolean;
  isMaximized: boolean;
  position: { x: number; y: number };
  size: { width: number; height: number };
  zIndex: number;
  data?: any; // For passing specific data to windows
}

interface AppState {
  isSidebarCollapsed: boolean;
  toggleSidebar: () => void;

  windows: WindowState[];
  activeWindowId: string | null;
  
  openWindow: (type: WindowType, title?: string, data?: any) => void;
  closeWindow: (id: string) => void;
  focusWindow: (id: string) => void;
  updateWindow: (id: string, updates: Partial<WindowState>) => void;
  minimizeWindow: (id: string) => void;
  maximizeWindow: (id: string) => void;
}

const DEFAULT_WINDOW_SIZE = { width: 600, height: 400 };

export const useAppStore = create<AppState>((set, get) => ({
  isSidebarCollapsed: true,
  toggleSidebar: () => set((state) => ({ isSidebarCollapsed: !state.isSidebarCollapsed })),

  windows: [],
  activeWindowId: null,

  openWindow: (type, title, data) => {
    const { windows } = get();
    // specific check: if dashboard is already open, just focus it? Or allow multiples?
    // Requirement: "Multiple tabs/windows can be opened simultaneously"
    
    const id = `${type}-${Date.now()}`;
    const newWindow: WindowState = {
      id,
      type,
      title: title || type.charAt(0).toUpperCase() + type.slice(1),
      isOpen: true,
      isMinimized: false,
      isMaximized: false,
      position: { x: 50 + (windows.length * 20), y: 50 + (windows.length * 20) }, // Cascade
      size: DEFAULT_WINDOW_SIZE,
      zIndex: windows.length + 1,
      data
    };

    set((state) => ({
      windows: [...state.windows, newWindow],
      activeWindowId: id
    }));
  },

  closeWindow: (id) => {
    set((state) => ({
      windows: state.windows.filter((w) => w.id !== id),
      activeWindowId: state.activeWindowId === id ? null : state.activeWindowId
    }));
  },

  focusWindow: (id) => {
    set((state) => {
      const maxZ = Math.max(...state.windows.map((w) => w.zIndex), 0);
      return {
        activeWindowId: id,
        windows: state.windows.map((w) => 
          w.id === id ? { ...w, zIndex: maxZ + 1, isMinimized: false } : w
        )
      };
    });
  },

  updateWindow: (id, updates) => {
    set((state) => ({
      windows: state.windows.map((w) => 
        w.id === id ? { ...w, ...updates } : w
      )
    }));
  },

  minimizeWindow: (id) => {
     set((state) => ({
      windows: state.windows.map((w) => 
        w.id === id ? { ...w, isMinimized: !w.isMinimized } : w
      )
    }));
  },

  maximizeWindow: (id) => {
    set((state) => ({
      windows: state.windows.map((w) => 
        w.id === id ? { ...w, isMaximized: !w.isMaximized } : w
      )
    }));
  }
}));
