import { useAppStore } from '../../store/appStore';
import { WindowContainer } from './WindowContainer';
import { Dashboard } from '../Charts/Dashboard';
import { Jupyter } from '../Jupyter/Jupyter';
import { Assistant } from '../Assistant/Assistant';

export const WindowManager = () => {
  const { windows } = useAppStore();

  return (
    <div className="absolute inset-0 overflow-hidden">
      {windows.map((window) => (
        <WindowContainer key={window.id} window={window}>
          {renderWindowContent(window)}
        </WindowContainer>
      ))}
      
      {/* Fallback/Empty State */}
      {windows.length === 0 && (
        <div className="flex flex-col items-center justify-center h-full text-neutral-600">
           <h1 className="text-2xl font-bold mb-2 text-neutral-500">Welcome to Data4Viz</h1>
           <p>Select an option from the sidebar to get started.</p>
        </div>
      )}
    </div>
  );
};

const renderWindowContent = (window: any) => {
  switch (window.type) {
    case 'dashboard':
    case 'visuals':
    case 'data-summary':
      return <Dashboard window={window} />;
    case 'jupyter':
      return <Jupyter window={window} />;
    case 'assistant':
      return <Assistant window={window} />;
    default:
      return <div className="p-4">Content for {window.type}</div>;
  }
};
