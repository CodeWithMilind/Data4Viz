import React from 'react';
import { 
  LayoutDashboard, 
  Upload, 
  Globe, 
  Activity, 
  Brush, 
  BarChart2, 
  GitMerge, 
  Lightbulb, 
  Code2, 
  Download, 
  Bot, 
  UserCircle,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { useAppStore } from '../../store/appStore';
import { cn } from '../../utils/cn';

interface SidebarItemProps {
  icon: React.ElementType;
  label: string;
  isCollapsed: boolean;
  onClick?: () => void;
  active?: boolean;
  indent?: boolean;
}

const SidebarItem = ({ icon: Icon, label, isCollapsed, onClick, active, indent }: SidebarItemProps) => {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center w-full p-2 rounded-md transition-colors hover:bg-neutral-800 text-neutral-400 hover:text-white group relative",
        active && "bg-neutral-800 text-white",
        indent && "pl-8"
      )}
      title={isCollapsed ? label : undefined}
    >
      <Icon size={20} className="min-w-[20px]" />
      {!isCollapsed && (
        <span className="ml-3 text-sm font-medium whitespace-nowrap overflow-hidden transition-all duration-300">
          {label}
        </span>
      )}
      {isCollapsed && (
        <div className="absolute left-full ml-2 px-2 py-1 bg-neutral-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 pointer-events-none z-50 whitespace-nowrap border border-neutral-700">
          {label}
        </div>
      )}
    </button>
  );
};

export const Sidebar = () => {
  const { isSidebarCollapsed, toggleSidebar, openWindow } = useAppStore();

  return (
    <div 
      className={cn(
        "h-screen bg-black border-r border-neutral-800 flex flex-col transition-all duration-300 ease-in-out z-50 relative",
        isSidebarCollapsed ? "w-16" : "w-64"
      )}
    >
      {/* Header / Account */}
      <div className="p-4 border-b border-neutral-800 flex items-center justify-between">
         <div className="flex items-center overflow-hidden">
            <UserCircle size={24} className="text-white min-w-[24px]" />
            {!isSidebarCollapsed && <span className="ml-3 font-semibold text-white">Admin User</span>}
         </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-4 px-2 space-y-1">
        <SidebarItem 
          icon={LayoutDashboard} 
          label="Dashboard" 
          isCollapsed={isSidebarCollapsed} 
          onClick={() => openWindow('dashboard')}
        />
        
        <div className="pt-2 pb-1">
          {!isSidebarCollapsed && <p className="px-2 text-xs font-semibold text-neutral-600 uppercase tracking-wider mb-1">Data Source</p>}
          <SidebarItem icon={Upload} label="Upload CSV" isCollapsed={isSidebarCollapsed} onClick={() => openWindow('data-summary', 'Data Upload')} />
          <SidebarItem icon={Globe} label="Load from API" isCollapsed={isSidebarCollapsed} onClick={() => openWindow('data-summary', 'API Load')} />
        </div>

        <div className="pt-2 pb-1">
           {!isSidebarCollapsed && <p className="px-2 text-xs font-semibold text-neutral-600 uppercase tracking-wider mb-1">Analysis</p>}
           <SidebarItem icon={Activity} label="EDA" isCollapsed={isSidebarCollapsed} onClick={() => openWindow('visuals', 'EDA')} />
           <SidebarItem icon={Brush} label="Data Cleaning" isCollapsed={isSidebarCollapsed} onClick={() => openWindow('data-summary', 'Cleaning')} />
           <SidebarItem icon={BarChart2} label="Visuals" isCollapsed={isSidebarCollapsed} onClick={() => openWindow('visuals')} />
           <SidebarItem icon={GitMerge} label="Correlation" isCollapsed={isSidebarCollapsed} onClick={() => openWindow('visuals', 'Correlation')} />
           <SidebarItem icon={Lightbulb} label="Insights" isCollapsed={isSidebarCollapsed} onClick={() => openWindow('assistant', 'Insights')} />
        </div>

        <div className="pt-2 pb-1">
           {!isSidebarCollapsed && <p className="px-2 text-xs font-semibold text-neutral-600 uppercase tracking-wider mb-1">Tools</p>}
           <SidebarItem icon={Code2} label="Jupyter Notebook" isCollapsed={isSidebarCollapsed} onClick={() => openWindow('jupyter')} />
           <SidebarItem icon={Bot} label="AI Assistant" isCollapsed={isSidebarCollapsed} onClick={() => openWindow('assistant')} />
        </div>
      </nav>

      {/* Footer / Export */}
      <div className="p-2 border-t border-neutral-800">
        <SidebarItem icon={Download} label="Export" isCollapsed={isSidebarCollapsed} />
        <button 
          onClick={toggleSidebar}
          className="flex items-center justify-center w-full p-2 mt-2 text-neutral-500 hover:text-white hover:bg-neutral-800 rounded-md"
        >
          {isSidebarCollapsed ? <ChevronRight size={20} /> : <ChevronLeft size={20} />}
        </button>
      </div>
    </div>
  );
};
