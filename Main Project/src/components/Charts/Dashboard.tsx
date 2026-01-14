import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, AreaChart, Area
} from 'recharts';
import { TrendingUp, Users, DollarSign, Activity } from 'lucide-react';

const data = [
  { name: 'Jan', uv: 4000, pv: 2400, amt: 2400 },
  { name: 'Feb', uv: 3000, pv: 1398, amt: 2210 },
  { name: 'Mar', uv: 2000, pv: 9800, amt: 2290 },
  { name: 'Apr', uv: 2780, pv: 3908, amt: 2000 },
  { name: 'May', uv: 1890, pv: 4800, amt: 2181 },
  { name: 'Jun', uv: 2390, pv: 3800, amt: 2500 },
  { name: 'Jul', uv: 3490, pv: 4300, amt: 2100 },
];

const pieData = [
  { name: 'Group A', value: 400 },
  { name: 'Group B', value: 300 },
  { name: 'Group C', value: 300 },
  { name: 'Group D', value: 200 },
];

const StatCard = ({ icon: Icon, title, value, trend }: any) => (
  <div className="bg-black border border-neutral-800 p-4 rounded-lg">
    <div className="flex justify-between items-start">
      <div>
        <p className="text-neutral-400 text-sm">{title}</p>
        <h3 className="text-2xl font-bold text-white mt-1">{value}</h3>
      </div>
      <div className="p-2 bg-neutral-900 rounded-lg">
        <Icon size={20} className="text-neutral-300" />
      </div>
    </div>
    <div className="mt-4 flex items-center text-sm">
      <span className="text-green-500 font-medium">{trend}</span>
      <span className="text-neutral-500 ml-2">vs last month</span>
    </div>
  </div>
);

export const Dashboard = ({ }: any) => {
  return (
    <div className="p-6 space-y-6">
      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={TrendingUp} title="Total Revenue" value="$45,231.89" trend="+20.1%" />
        <StatCard icon={Users} title="Active Users" value="+2350" trend="+180.1%" />
        <StatCard icon={DollarSign} title="Sales" value="+12,234" trend="+19%" />
        <StatCard icon={Activity} title="Active Now" value="+573" trend="+201" />
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Main Chart */}
        <div className="bg-black border border-neutral-800 p-4 rounded-lg h-[300px]">
          <h3 className="text-lg font-semibold text-white mb-4">Revenue Overview</h3>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data}>
              <defs>
                <linearGradient id="colorUv" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#fff" stopOpacity={0.1}/>
                  <stop offset="95%" stopColor="#fff" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <XAxis dataKey="name" stroke="#555" />
              <YAxis stroke="#555" />
              <CartesianGrid strokeDasharray="3 3" stroke="#333" />
              <Tooltip 
                contentStyle={{ backgroundColor: '#000', borderColor: '#333' }}
                itemStyle={{ color: '#fff' }}
              />
              <Area type="monotone" dataKey="uv" stroke="#fff" fillOpacity={1} fill="url(#colorUv)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Bar Chart */}
        <div className="bg-black border border-neutral-800 p-4 rounded-lg h-[300px]">
          <h3 className="text-lg font-semibold text-white mb-4">User Distribution</h3>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="#333" />
              <XAxis dataKey="name" stroke="#555" />
              <YAxis stroke="#555" />
              <Tooltip 
                 contentStyle={{ backgroundColor: '#000', borderColor: '#333' }}
                 itemStyle={{ color: '#fff' }}
              />
              <Bar dataKey="pv" fill="#333" />
              <Bar dataKey="uv" fill="#fff" />
            </BarChart>
          </ResponsiveContainer>
        </div>
        
        {/* Pie Chart */}
        <div className="bg-black border border-neutral-800 p-4 rounded-lg h-[300px]">
           <h3 className="text-lg font-semibold text-white mb-4">Demographics</h3>
           <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={pieData}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={80}
                fill="#8884d8"
                paddingAngle={5}
                dataKey="value"
              >
                {pieData.map((_entry, index) => (
                  <Cell key={`cell-${index}`} fill={['#333', '#666', '#999', '#fff'][index % 4]} />
                ))}
              </Pie>
              <Tooltip 
                 contentStyle={{ backgroundColor: '#000', borderColor: '#333' }}
                 itemStyle={{ color: '#fff' }}
              />
            </PieChart>
           </ResponsiveContainer>
        </div>

        {/* Data Table Preview */}
        <div className="bg-black border border-neutral-800 p-4 rounded-lg h-[300px] overflow-hidden flex flex-col">
           <h3 className="text-lg font-semibold text-white mb-4">Recent Transactions</h3>
           <div className="overflow-auto flex-1">
             <table className="w-full text-left text-sm text-neutral-400">
               <thead className="bg-neutral-900 text-neutral-200 sticky top-0">
                 <tr>
                   <th className="p-2">ID</th>
                   <th className="p-2">User</th>
                   <th className="p-2">Amount</th>
                   <th className="p-2">Status</th>
                 </tr>
               </thead>
               <tbody>
                 {[1,2,3,4,5,6].map(i => (
                   <tr key={i} className="border-b border-neutral-800 hover:bg-neutral-900/50">
                     <td className="p-2 font-mono">#TRX-{1000+i}</td>
                     <td className="p-2">User {i}</td>
                     <td className="p-2">$ {Math.floor(Math.random() * 1000)}</td>
                     <td className="p-2"><span className="text-green-500">Completed</span></td>
                   </tr>
                 ))}
               </tbody>
             </table>
           </div>
        </div>
      </div>
    </div>
  );
};
