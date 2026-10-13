import { memo } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Panel, PanelHeader } from '../shared/Panel';
import { formatNaira } from '../shared/format';

export interface TreasuryChartDatum {
  name: string;
  amount: number;
  fill: string;
}

const GRID = '#eef0f3';
const AXIS = '#6b7480';
const HAIRLINE = '#e6e8ec';

const tooltipStyle = {
  backgroundColor: '#ffffff',
  borderRadius: 4,
  border: `1px solid ${HAIRLINE}`,
  boxShadow: 'none',
  fontSize: '12px',
};

const thousands = new Intl.NumberFormat('en-NG');

function VolumeBar({
  title,
  hint,
  data,
}: {
  title: string;
  hint: string;
  data: TreasuryChartDatum[];
}) {
  return (
    <Panel>
      <PanelHeader title={title} hint={hint} />
      <div className='px-2 py-3'>
        <div className='h-52 w-full'>
          <ResponsiveContainer width='100%' height='100%'>
            <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 16 }}>
              <CartesianGrid strokeDasharray='3 3' vertical={false} stroke={GRID} />
              <XAxis
                dataKey='name'
                tick={{ fontSize: 10, fill: AXIS }}
                interval={0}
                tickLine={false}
                axisLine={{ stroke: HAIRLINE }}
              />
              <YAxis
                width={44}
                tick={{ fontSize: 10, fill: AXIS }}
                tickFormatter={(v) => `₦${thousands.format(Math.round(Number(v) / 1000))}k`}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                formatter={(val: any) => [formatNaira(Number(val)), 'Amount']}
                contentStyle={tooltipStyle}
              />
              <Bar dataKey='amount' radius={[2, 2, 0, 0]}>
                {data.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </Panel>
  );
}

/**
 * The only `recharts` import in the admin tree — TreasuryTab lazy-loads this
 * module so the ~150kB chart bundle never lands in the admin entry chunk.
 */
function TreasuryCharts({
  volumeData,
  feeData,
}: {
  volumeData: TreasuryChartDatum[];
  feeData: TreasuryChartDatum[];
}) {
  return (
    <div className='grid grid-cols-1 gap-4 lg:grid-cols-2'>
      <VolumeBar
        title='Cashflow Volume Breakdown'
        hint='Gross inflows vs Gross outflows vs Net Margin'
        data={volumeData}
      />
      <VolumeBar
        title='Fee Unit Economics'
        hint='Revenue collected vs Gateway costs absorbed'
        data={feeData}
      />
    </div>
  );
}

export default memo(TreasuryCharts);