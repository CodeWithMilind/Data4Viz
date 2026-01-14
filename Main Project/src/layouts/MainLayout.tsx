import { Sidebar } from '../components/Sidebar/Sidebar';
import { WindowManager } from '../components/WindowManager/WindowManager';

export const MainLayout = () => {
  return (
    <div className="flex h-screen w-screen bg-[#111] text-white overflow-hidden">
      <Sidebar />
      <main className="flex-1 relative overflow-hidden bg-neutral-900/50">
        {/* Grid Background Pattern */}
        <div className="absolute inset-0 opacity-[0.03]" 
             style={{ 
               backgroundImage: 'linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)', 
               backgroundSize: '20px 20px' 
             }} 
        />
        
        <WindowManager />
      </main>
    </div>
  );
};
